import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { reportService } from "../../Services/reports/ReportService";
import { WorkSession, WorkInterval } from "../../types/WorkSession";
import "./SingleReport.css";
import { FileText, CalendarDays, FileSpreadsheet } from "lucide-react";
import ExcelJS from "exceljs";

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatTime(value?: Date | string | null): string {
  if (!value) return "–";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return date.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  return parsed.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatMonth(month: string): string {
  const parsed = new Date(`${month}-01T12:00:00`);
  return parsed.toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
  });
}

function normalizeSessions(sessions: WorkSession[]): WorkSession[] {
  return sessions.map((session) => {
    let intervals: unknown = session.workIntervals;

    if (typeof intervals === "string") {
      try {
        intervals = JSON.parse(intervals);
      } catch (error) {
        console.error("Arbeitsintervalle konnten nicht gelesen werden:", error);
        intervals = [];
      }
    }

    const workIntervals: WorkInterval[] = Array.isArray(intervals)
      ? intervals.map((interval) => ({
          ...interval,
          start: new Date(interval.start),
          end: interval.end ? new Date(interval.end) : undefined,
        }))
      : [];

    return {
      ...session,
      workIntervals,
    };
  });
}

function getCurrentWorkMinutes(session: WorkSession): number {
  const start = new Date(session.workStart).getTime();
  const end = session.workEnd
    ? new Date(session.workEnd).getTime()
    : Date.now();

  if (!Number.isFinite(start) || end < start) {
    return 0;
  }

  let pauseMinutes = session.totalPauseMinutes ?? 0;

  if (session.pauseStart && !session.pauseEnd) {
    const pauseStart = new Date(session.pauseStart).getTime();

    if (Number.isFinite(pauseStart)) {
      pauseMinutes += Math.max(0, Math.floor((end - pauseStart) / 60000));
    }
  }

  return Math.max(0, Math.floor((end - start) / 60000) - pauseMinutes);
}

function getDayStatus(sessions: WorkSession[]): string {
  if (
    sessions.some(
      (session) => session.status === "in_progress" || !session.workEnd,
    )
  ) {
    return "In Arbeit";
  }

  if (sessions.some((session) => session.status === "needs_correction")) {
    return "Korrektur erforderlich";
  }

  if (sessions.some((session) => session.status === "auto_closed")) {
    return "Automatisch beendet";
  }

  if (
    sessions.some(
      (session) => session.status === "sick" || session.workLocation === "sick",
    )
  ) {
    return "Krankheit";
  }

  if (sessions.some((session) => session.status === "vacation")) {
    return "Urlaub";
  }

  if (
    sessions.length > 0 &&
    sessions.every((session) => session.status === "completed")
  ) {
    return "Abgeschlossen";
  }

  return "Nicht angegeben";
}

type DailyEntry = {
  date: string;
  sessions: WorkSession[];
  workMinutes: number;
  pauseMinutes: number;
  sollMinutes: number;
  saldoMinutes: number;
  status: string;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function getIntervals(day: DailyEntry): WorkInterval[] {
  return day.sessions
    .flatMap((session) => session.workIntervals ?? [])
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

function getWorkLocationLabel(day: DailyEntry): string {
  if (day.status === "Urlaub") return "Urlaub";

  const workLocation = day.sessions[0]?.workLocation;

  if (workLocation === "office") return "Vor Ort";
  if (workLocation === "homeoffice") return "Homeoffice";
  if (workLocation === "business_trip") return "Dienstreise";
  if (workLocation === "sick") return "Krankheit";

  if (day.sessions.some((session) => session.status === "vacation")) {
    return "Urlaub";
  }

  return "–";
}

function makeDailyEntries(
  monthSessions: WorkSession[],
  dailyTargets: Record<string, number>,
  vacationDates: string[] = [],
): DailyEntry[] {
  const byDate = new Map<string, WorkSession[]>();

  for (const session of monthSessions) {
    const daySessions = byDate.get(session.date) ?? [];
    daySessions.push(session);
    byDate.set(session.date, daySessions);
  }

  // Genehmigte Urlaubstage auch ohne Arbeitssitzung aufnehmen.
  vacationDates.forEach((date) => {
    if (!byDate.has(date)) {
      byDate.set(date, []);
    }
  });

  return Array.from(byDate.entries())
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, daySessions]) => ({
      date,
      sessions: daySessions,
      workMinutes: daySessions.reduce(
        (sum, session) =>
          sum +
          (session.workEnd
            ? (session.totalWorkMinutes ?? 0)
            : getCurrentWorkMinutes(session)),
        0,
      ),
      pauseMinutes: daySessions.reduce(
        (sum, session) => sum + (session.totalPauseMinutes ?? 0),
        0,
      ),
      sollMinutes: dailyTargets[date] ?? 0,
      saldoMinutes: 0,
      status: vacationDates.includes(date)
        ? "Urlaub"
        : getDayStatus(daySessions),
    }));
}

function SingleReport() {
  const { user } = useAuth();

  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [startMonth, setStartMonth] = useState(getCurrentMonth());
  const [endMonth, setEndMonth] = useState(getCurrentMonth());

  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [vacationDates, setVacationDates] = useState<string[]>([]);
  const [dailyBalances, setDailyBalances] = useState<Record<string, number>>(
    {},
  );
  const [dailyTargets, setDailyTargets] = useState<Record<string, number>>({});

  useEffect(() => {
    let active = true;

    async function loadSessions() {
      if (!user) {
        setSessions([]);
        setDailyBalances({});
        setDailyTargets({});
        setVacationDates([]);
        return;
      }

      setLoading(true);
      setError("");

      try {
        // 1. Arbeitssitzungen laden
        const loadedSessions = await window.database.getWorkSessionsByUser(
          user.id,
        );

        const allSessions = normalizeSessions(loadedSessions);

        // 2. Sitzungen des ausgewählten Monats filtern
        const monthSessions = allSessions
          .filter((session) => session.date?.startsWith(`${selectedMonth}-`))
          .sort((a, b) => {
            const dateOrder = a.date.localeCompare(b.date);

            if (dateOrder !== 0) return dateOrder;

            return (
              new Date(a.workStart).getTime() - new Date(b.workStart).getTime()
            );
          });

        // 3. Monatsbericht laden
        const [year, month] = selectedMonth.split("-").map(Number);

        const monthlyReport = await reportService.getMonthlyReport(
          month,
          year,
          user.id,
        );

        // 4. Tageswerte und genehmigte Urlaubstage übernehmen
        const balances: Record<string, number> = {};
        const targets: Record<string, number> = {};

        const approvedVacationDates = monthlyReport.days
          .filter((day) => day.isApprovedVacation)
          .map((day) => day.date);

        monthlyReport.days.forEach((day) => {
          balances[day.date] = day.overtimeMinutes - day.deficitMinutes;
          targets[day.date] = day.targetMinutes;
        });

        if (!active) return;

        setSessions(monthSessions);
        setDailyBalances(balances);
        setDailyTargets(targets);
        setVacationDates(approvedVacationDates);
      } catch (err) {
        console.error("Fehler beim Laden des Einzelzeitnachweises:", err);

        if (active) {
          setSessions([]);
          setDailyBalances({});
          setDailyTargets({});
          setVacationDates([]);
          setError("Die Arbeitszeiten konnten nicht geladen werden.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadSessions();

    return () => {
      active = false;
    };
  }, [user, selectedMonth]);

  const dailyEntries = useMemo(() => {
    return makeDailyEntries(sessions, dailyTargets, vacationDates).map(
      (entry) => ({
        ...entry,
        saldoMinutes: dailyBalances[entry.date] ?? 0,
      }),
    );
  }, [sessions, dailyBalances, dailyTargets, vacationDates]);

  const formatSaldo = (minutes: number) => {
    const sign = minutes > 0 ? "+" : minutes < 0 ? "−" : "";

    return `${sign}${reportService.formatMinutes(Math.abs(minutes))}`;
  };

  const totalWorkMinutes = dailyEntries.reduce(
    (sum, day) => sum + day.workMinutes,
    0,
  );

  const totalSollMinutes = dailyEntries.reduce(
    (sum, day) => sum + day.sollMinutes,
    0,
  );

  const calculatedTotalSaldoMinutes = totalWorkMinutes - totalSollMinutes;

  const totalSaldoMinutes = dailyEntries.reduce(
    (sum, day) => sum + day.saldoMinutes,
    0,
  );

  const totalPauseMinutes = dailyEntries.reduce(
    (sum, day) => sum + day.pauseMinutes,
    0,
  );

  const maxIntervals = Math.max(
    1,
    ...dailyEntries.map((day) => getIntervals(day).length),
  );

  async function handleCreatePdf() {
    if (!user || dailyEntries.length === 0) return;

    const intervalHeaders = Array.from(
      { length: maxIntervals },
      (_, index) => `<th>Beginn ${index + 1}</th><th>Ende ${index + 1}</th>`,
    ).join("");

    const rows = dailyEntries
      .map((day) => {
        const intervals = getIntervals(day);
        const workLocationLabel = getWorkLocationLabel(day);

        const intervalCells = Array.from(
          { length: maxIntervals },
          (_, index) => {
            const interval = intervals[index];

            return `<td>${interval ? escapeHtml(formatTime(interval.start)) : "–"}</td>
            <td>${interval ? escapeHtml(formatTime(interval.end)) : "–"}</td>`;
          },
        ).join("");

        return `<tr>
          <td>${escapeHtml(formatDate(day.date))}</td>
          ${intervalCells}
          <td>${escapeHtml(workLocationLabel)}</td>
          <td>${escapeHtml(reportService.formatMinutes(day.workMinutes))}</td>
          <td>${escapeHtml(reportService.formatMinutes(day.sollMinutes))}</td>
          <td>${escapeHtml(formatSaldo(day.saldoMinutes))}</td>
        </tr>`;
      })
      .join("");

    const html = `<!DOCTYPE html>
      <html lang="de">
      <head>
        <meta charset="UTF-8" />
        <title>Einzelzeitnachweis ${escapeHtml(selectedMonth)}</title>
        <style>
          * { box-sizing: border-box; }
          @page { size: A4 landscape; margin: 10mm; }
          body { font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 10px; }
          h1 { font-size: 22px; margin-bottom: 6px; }
          .muted { color: #6b7280; }
          .employee { margin: 16px 0; padding: 10px; border: 1px solid #d1d5db; }
          table { width: 100%; border-collapse: collapse; margin-top: 14px; }
          th, td { text-align: left; padding: 6px 5px; border-bottom: 1px solid #e5e7eb; white-space: nowrap; }
          th { background: #f3f4f6; }
          .footer { margin-top: 20px; color: #6b7280; font-size: 9px; }
        </style>
      </head>
      <body>
        <h1>Einzelzeitnachweis</h1>
        <div class="muted">${escapeHtml(formatMonth(selectedMonth))}</div>
        <div class="employee">
          <strong>Mitarbeiter:</strong> ${escapeHtml(user.displayName ?? "")}<br />
          <strong>Nachweiszeitraum:</strong> ${escapeHtml(formatMonth(selectedMonth))}
        </div>
        <table>
          <thead>
            <tr>
              <th>Datum</th>
              ${intervalHeaders}
              <th>Arbeitsort</th>
              <th>Arbeitszeit</th>
              <th>Soll</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr>
              <th>Monatssumme</th>
              <th colspan="${maxIntervals * 2}"></th>
              <th></th>
              <th style="text-align: left;">
                ${escapeHtml(reportService.formatMinutes(totalWorkMinutes))}
              </th>
              <th style="text-align: left;">
                ${escapeHtml(reportService.formatMinutes(totalSollMinutes))}
              </th>
              <th style="text-align: left;">
                ${escapeHtml(formatSaldo(calculatedTotalSaldoMinutes))}
              </th>
            </tr>
          </tfoot>
        </table>
        <div class="footer">
          Erstellt mit TimeReport · ${escapeHtml(new Date().toLocaleString("de-DE"))}
        </div>
      </body>
      </html>`;

    try {
      const result = await window.ipcRenderer.invoke(
        "create-report-pdf",
        html,
        `Einzelzeitnachweis-${selectedMonth}.pdf`,
      );

      if (!result?.success) {
        alert(
          result?.message ??
            "Der Einzelzeitnachweis konnte nicht als PDF erstellt werden.",
        );
      }
    } catch (err) {
      console.error("Fehler beim PDF-Export:", err);
      alert("Beim Erstellen der PDF-Datei ist ein Fehler aufgetreten.");
    }
  }

  async function handleCreateExcel() {
    if (!user) return;

    if (!startMonth || !endMonth || startMonth > endMonth) {
      alert("Bitte wähle einen gültigen Zeitraum aus.");
      return;
    }

    try {
      const loadedSessions = await window.database.getWorkSessionsByUser(
        user.id,
      );
      const allSessions = normalizeSessions(loadedSessions);

      const rangeSessions = allSessions
        .filter((session) => {
          const month = session.date?.slice(0, 7);
          return !!month && month >= startMonth && month <= endMonth;
        })
        .sort((a, b) => {
          const dateOrder = a.date.localeCompare(b.date);
          if (dateOrder !== 0) return dateOrder;

          return (
            new Date(a.workStart).getTime() - new Date(b.workStart).getTime()
          );
        });

      const months: string[] = [];
      const cursor = new Date(`${startMonth}-01T12:00:00`);
      const lastMonth = new Date(`${endMonth}-01T12:00:00`);

      while (cursor <= lastMonth) {
        months.push(
          `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
        );
        cursor.setMonth(cursor.getMonth() + 1);
      }

      const monthData = await Promise.all(
        months.map(async (month) => {
          const monthSessions = rangeSessions.filter((session) =>
            session.date?.startsWith(`${month}-`),
          );

          const [year, monthNumber] = month.split("-").map(Number);

          const monthlyReport = await reportService.getMonthlyReport(
            monthNumber,
            year,
            user.id,
          );

          const dailyTargets: Record<string, number> = {};
          const dailyBalances: Record<string, number> = {};

          const approvedVacationDates = monthlyReport.days
            .filter((day) => day.isApprovedVacation)
            .map((day) => day.date);

          monthlyReport.days.forEach((day) => {
            dailyTargets[day.date] = day.targetMinutes;
            dailyBalances[day.date] = day.overtimeMinutes - day.deficitMinutes;
          });

          const entries = makeDailyEntries(
            monthSessions,
            dailyTargets,
            approvedVacationDates,
          );

          const enrichedEntries = entries.map((day) => ({
            ...day,
            saldoMinutes: dailyBalances[day.date] ?? 0,
          }));

          const workMinutes = enrichedEntries.reduce(
            (sum, day) => sum + day.workMinutes,
            0,
          );

          const sollMinutes = enrichedEntries.reduce(
            (sum, day) => sum + day.sollMinutes,
            0,
          );

          const saldoMinutes = enrichedEntries.reduce(
            (sum, day) => sum + day.saldoMinutes,
            0,
          );

          return {
            month,
            monthLabel: formatMonth(month),
            entries: enrichedEntries,
            workMinutes,
            sollMinutes,
            saldoMinutes,
          };
        }),
      );

      const maxExcelIntervals = Math.max(
        1,
        ...monthData.flatMap((data) =>
          data.entries.map((day) => getIntervals(day).length),
        ),
      );

      const headers = [
        "Datum",
        ...Array.from({ length: maxExcelIntervals }, (_, index) => [
          `Beginn ${index + 1}`,
          `Ende ${index + 1}`,
        ]).flat(),
        "Arbeitsort",
        "Arbeitszeit",
        "Soll",
        "Saldo",
        "Status",
      ];

      const columnCount = headers.length;
      const totalIntervalColumns = maxExcelIntervals * 2;
      const totalWorkLocationColumn = totalIntervalColumns + 2;
      const totalWorkColumn = totalWorkLocationColumn + 1;
      const totalSollColumn = totalWorkColumn + 1;
      const totalSaldoColumn = totalSollColumn + 1;

      const years = [
        ...new Set(monthData.map((data) => data.month.slice(0, 4))),
      ];

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "TimeReport Desktop";
      workbook.created = new Date();

      const styleHeader = (row: ExcelJS.Row) => {
        row.height = 30;
        row.eachCell((cell) => {
          cell.font = {
            name: "Arial",
            bold: true,
            color: { argb: "FF20364D" },
          };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFDCE6F1" },
          };
          cell.alignment = {
            vertical: "middle",
            horizontal: "center",
            wrapText: true,
          };
          cell.border = {
            top: { style: "thin", color: { argb: "FF9EADBD" } },
            bottom: { style: "medium", color: { argb: "FF24476B" } },
            left: { style: "thin", color: { argb: "FFD5DDE5" } },
            right: { style: "thin", color: { argb: "FFD5DDE5" } },
          };
        });
      };

      const styleTitle = (
        worksheet: ExcelJS.Worksheet,
        rowNumber: number,
        title: string,
        columns: number,
      ) => {
        worksheet.mergeCells(rowNumber, 1, rowNumber, columns);
        const cell = worksheet.getCell(rowNumber, 1);
        cell.value = title;
        cell.font = {
          name: "Arial",
          size: 20,
          bold: true,
          color: { argb: "FFFFFFFF" },
        };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF24476B" },
        };
        cell.alignment = { vertical: "middle", horizontal: "left" };
        worksheet.getRow(rowNumber).height = 36;
      };

      for (const year of years) {
        const yearlyMonths = monthData.filter((data) =>
          data.month.startsWith(`${year}-`),
        );

        const worksheet = workbook.addWorksheet(`${year} Übersicht`, {
          views: [{ state: "frozen", ySplit: 4 }],
          pageSetup: {
            orientation: "landscape",
            fitToPage: true,
            fitToWidth: 1,
            fitToHeight: 0,
            paperSize: 9,
          },
        });

        styleTitle(worksheet, 1, `${year} Übersicht`, columnCount);

        worksheet.mergeCells(2, 1, 2, columnCount);
        worksheet.getCell(2, 1).value =
          `Mitarbeiter: ${user.displayName ?? ""}`;
        worksheet.getCell(2, 1).font = {
          name: "Arial",
          size: 11,
          bold: true,
          color: { argb: "FF20364D" },
        };
        worksheet.getRow(2).height = 23;

        worksheet.mergeCells(3, 1, 3, columnCount);
        worksheet.getCell(3, 1).value =
          `Ausgewählter Zeitraum: ${formatMonth(startMonth)} bis ${formatMonth(endMonth)}`;
        worksheet.getCell(3, 1).font = { name: "Arial", size: 10 };
        worksheet.getRow(3).height = 21;

        let currentRow = 5;
        let yearWorkMinutes = 0;
        let yearSollMinutes = 0;
        let yearDays = 0;

        for (const data of yearlyMonths) {
          worksheet.mergeCells(currentRow, 1, currentRow, columnCount);

          const monthHeading = worksheet.getCell(currentRow, 1);
          monthHeading.value = `Berichtsmonat: ${data.monthLabel}`;
          monthHeading.font = {
            name: "Arial",
            size: 11,
            bold: true,
            color: { argb: "FF20364D" },
          };
          monthHeading.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFE8EDF2" },
          };
          monthHeading.alignment = {
            vertical: "middle",
            horizontal: "left",
          };

          worksheet.getRow(currentRow).height = 23;
          currentRow += 2;

          const headerRow = worksheet.getRow(currentRow);
          headerRow.values = headers;
          styleHeader(headerRow);
          currentRow += 1;

          data.entries.forEach((day, index) => {
            const intervals = getIntervals(day);

            const values = [
              formatDate(day.date),
              ...Array.from(
                { length: maxExcelIntervals },
                (_, intervalIndex) => {
                  const interval = intervals[intervalIndex];
                  return [
                    interval ? formatTime(interval.start) : "–",
                    interval ? formatTime(interval.end) : "–",
                  ];
                },
              ).flat(),
              getWorkLocationLabel(day),
              reportService.formatMinutes(day.workMinutes),
              reportService.formatMinutes(day.sollMinutes),
              formatSaldo(day.saldoMinutes),
              day.status,
            ];

            const row = worksheet.getRow(currentRow);
            row.values = values;
            row.height = 23;

            row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
              cell.font = {
                name: "Arial",
                size: 10,
                color: { argb: "FF273444" },
              };
              cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: {
                  argb: index % 2 === 0 ? "FFFFFFFF" : "FFF3F6F9",
                },
              };
              cell.alignment = {
                vertical: "middle",
                horizontal: columnNumber === 1 ? "left" : "center",
              };
              cell.border = {
                bottom: { style: "hair", color: { argb: "FFDCE2E8" } },
              };
            });

            currentRow += 1;
          });

          const totalRow = worksheet.getRow(currentRow);
          totalRow.getCell(1).value = "Monatssumme";

          totalRow.getCell(totalWorkColumn).value = reportService.formatMinutes(
            data.workMinutes,
          );

          totalRow.getCell(totalSollColumn).value = reportService.formatMinutes(
            data.sollMinutes,
          );

          totalRow.getCell(totalSaldoColumn).value = formatSaldo(
            data.saldoMinutes,
          );

          for (let column = 1; column <= columnCount; column++) {
            const cell = totalRow.getCell(column);
            cell.font = {
              name: "Arial",
              size: 11,
              bold: true,
              color: { argb: "FF20364D" },
            };
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFE8EDF2" },
            };
            cell.alignment = {
              vertical: "middle",
              horizontal: column >= totalWorkColumn ? "center" : "left",
            };
            cell.border = {
              top: { style: "medium", color: { argb: "FF24476B" } },
            };
          }

          totalRow.height = 28;

          yearWorkMinutes += data.workMinutes;
          yearSollMinutes += data.sollMinutes;
          yearDays += data.entries.length;

          currentRow += 2;
        }

        const annualTotal = worksheet.getRow(currentRow);
        annualTotal.getCell(1).value = `Jahressumme ${year}`;
        annualTotal.getCell(2).value = `${yearDays} Tage`;

        annualTotal.getCell(totalWorkColumn).value =
          reportService.formatMinutes(yearWorkMinutes);

        annualTotal.getCell(totalSollColumn).value =
          reportService.formatMinutes(yearSollMinutes);

        annualTotal.getCell(totalSaldoColumn).value = formatSaldo(
          yearWorkMinutes - yearSollMinutes,
        );

        for (let column = 1; column <= columnCount; column++) {
          const cell = annualTotal.getCell(column);
          cell.font = {
            name: "Arial",
            size: 12,
            bold: true,
            color: { argb: "FFFFFFFF" },
          };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF24476B" },
          };
          cell.alignment = { vertical: "middle" };
          cell.border = {
            top: { style: "medium", color: { argb: "FF20364D" } },
          };
        }

        annualTotal.height = 32;

        worksheet.columns = [
          { width: 15 },
          ...Array.from({ length: totalIntervalColumns }, () => ({
            width: 12,
          })),
          { width: 18 },
          { width: 16 },
          { width: 16 },
          { width: 16 },
          { width: 22 },
        ];
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Einzelzeitnachweis-${startMonth}-bis-${endMonth}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Fehler beim Excel-Export:", err);
      alert(
        "Der Einzelzeitnachweis konnte nicht als Excel-Datei exportiert werden.",
      );
    }
  }

  return (
    <div className="single-report-page">
      <header className="single-report-header">
        <div>
          <h1>Einzelzeitnachweis</h1>
          <p>Monatlicher Überblick über die gespeicherten Arbeitsintervalle.</p>
        </div>
      </header>

      <div>
        <section className="single-report-filter">
          <div className="single-report-section-top">
            <div className="single-report-section-heading">
              <CalendarDays size={22} />
              <div>
                <h2>1. Excel-Export</h2>
                <p>
                  Wähle den Zeitraum für die Excel-Datei. Der Export enthält
                  eine Übersicht mit den ausgewählten Monaten.
                </p>
              </div>
            </div>

            <button
              className="single-report-export-button excel-export-button"
              onClick={handleCreateExcel}
              disabled={
                loading || !startMonth || !endMonth || startMonth > endMonth
              }
            >
              <FileSpreadsheet size={18} />
              Excel erstellen
            </button>
          </div>

          <div className="excel-month-range">
            <div className="excel-month-field">
              <label htmlFor="startMonth">Von Monat</label>
              <input
                id="startMonth"
                type="month"
                value={startMonth}
                onChange={(event) => setStartMonth(event.target.value)}
              />
            </div>

            <div className="excel-month-field">
              <label htmlFor="endMonth">Bis Monat</label>
              <input
                id="endMonth"
                type="month"
                value={endMonth}
                onChange={(event) => setEndMonth(event.target.value)}
              />
            </div>
          </div>
        </section>
      </div>

      <div>
        <section className="single-report-filter">
          <div className="single-report-section-top">
            <div className="single-report-section-heading">
              <CalendarDays size={22} />
              <div>
                <h2>2. Monatsansicht und PDF</h2>
                <p>
                  Wähle den Monat, dessen Arbeitszeitdetails du ansehen und als
                  PDF speichern möchtest.
                </p>
              </div>
            </div>

            <button
              className="single-report-export-button pdf-export-button"
              onClick={handleCreatePdf}
              disabled={loading || dailyEntries.length === 0}
            >
              <FileText size={18} />
              PDF erstellen
            </button>
          </div>

          <div className="single-report-selected-month">
            <label htmlFor="selectedMonth">Angezeigter Monat</label>
            <input
              id="selectedMonth"
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
            />
          </div>
        </section>

        <section className="single-report-card">
          <div className="single-report-card-heading">
            <div>
              <h2>Arbeitszeitdetails</h2>
              <p>{formatMonth(selectedMonth)}</p>
            </div>
            <FileText size={25} />
          </div>

          {loading ? (
            <p className="single-report-message">
              Arbeitszeiten werden geladen …
            </p>
          ) : error ? (
            <p className="single-report-error">{error}</p>
          ) : dailyEntries.length === 0 ? (
            <p className="single-report-message">
              Für {formatMonth(selectedMonth)} wurden keine Arbeitszeiten
              gefunden.
            </p>
          ) : (
            <>
              <div className="single-report-summary">
                <div>
                  <span>Gesamtarbeitszeit</span>
                  <strong>
                    {reportService.formatMinutes(totalWorkMinutes)}
                  </strong>
                </div>

                <div>
                  <span>Gesamtpause</span>
                  <strong>
                    {reportService.formatMinutes(totalPauseMinutes)}
                  </strong>
                </div>

                <div>
                  <span>Erfasste Tage</span>
                  <strong>{dailyEntries.length}</strong>
                </div>
              </div>

              <div className="single-report-table-wrapper">
                <table className="single-report-table single-report-month-table">
                  <thead>
                    <tr>
                      <th>Datum</th>
                      {Array.from({ length: maxIntervals }, (_, index) => [
                        <th key={`start-header-${index}`}>
                          Beginn {index + 1}
                        </th>,
                        <th key={`end-header-${index}`}>Ende {index + 1}</th>,
                      ]).flat()}
                      <th>Arbeitsort</th>
                      <th>Arbeitszeit</th>
                      <th>Pause</th>
                      <th>Saldo</th>
                      <th>Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {dailyEntries.map((day) => {
                      const intervals = getIntervals(day);

                      return (
                        <tr key={day.date}>
                          <td>{formatDate(day.date)}</td>

                          {Array.from({ length: maxIntervals }, (_, index) => {
                            const interval = intervals[index];

                            return [
                              <td key={`start-${day.date}-${index}`}>
                                {interval ? formatTime(interval.start) : "–"}
                              </td>,
                              <td key={`end-${day.date}-${index}`}>
                                {interval ? formatTime(interval.end) : "–"}
                              </td>,
                            ];
                          }).flat()}

                          <td>{getWorkLocationLabel(day)}</td>

                          <td>
                            {reportService.formatMinutes(day.workMinutes)}
                          </td>

                          <td>
                            {reportService.formatMinutes(day.pauseMinutes)}
                          </td>

                          <td>{formatSaldo(day.saldoMinutes)}</td>
                          <td>{day.status}</td>
                        </tr>
                      );
                    })}
                  </tbody>

                  <tfoot>
                    <tr>
                      <th colSpan={1 + maxIntervals * 2}>Monatssumme</th>
                      <th></th>
                      <th>{reportService.formatMinutes(totalWorkMinutes)}</th>
                      <th>{reportService.formatMinutes(totalPauseMinutes)}</th>
                      <th>{formatSaldo(totalSaldoMinutes)}</th>
                      <th></th>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export default SingleReport;
