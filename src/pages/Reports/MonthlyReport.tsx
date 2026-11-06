import { useEffect, useState } from "react";
import "./MonthlyReport.css";

import { reportService } from "../../Services/reports/ReportService";
import type { MonthlyReport as MonthlyReportType } from "../../types/MonthlyReport";
import { useAuth } from "../../context/AuthContext";

function MonthlyReport() {
  const { user } = useAuth();

  const currentDate = new Date();

  const [monthlyReport, setMonthlyReport] = useState<MonthlyReportType | null>(
    null,
  );

  const [selectedMonth, setSelectedMonth] = useState(
    currentDate.getMonth() + 1,
  );

  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());

  useEffect(() => {
    if (user) {
      loadMonthlyReport();
    }
  }, [user, selectedMonth, selectedYear]);

  async function loadMonthlyReport() {
    if (!user) return;

    try {
      const monthly = await reportService.getMonthlyReport(
        selectedMonth,
        selectedYear,
        user.id,
      );

      setMonthlyReport(monthly);
    } catch (error) {
      console.error("Fehler beim Laden des Monatsberichts:", error);
      setMonthlyReport(null);
    }
  }

  async function handleCreateDailyOverviewPdf() {
    if (!monthlyReport || !user) {
      return;
    }

    const escapeHtml = (value: string): string => {
      return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };

    const totalWorkDays = monthlyReport.days.filter(
      (day) =>
        day.totalWorkMinutes > 0 &&
        day.status !== "sick" &&
        day.status !== "vacation" &&
        !day.isHoliday,
    ).length;

    const totalWorkDaysWithoutBusinessTrip = monthlyReport.days.filter(
      (day) =>
        day.totalWorkMinutes > 0 &&
        day.businessTripMinutes === 0 &&
        day.status !== "sick" &&
        day.status !== "vacation" &&
        !day.isHoliday,
    ).length;

    const homeofficeOnlyDays = monthlyReport.days.filter(
      (day) =>
        day.homeofficeMinutes > 0 &&
        day.officeMinutes === 0 &&
        day.businessTripMinutes === 0 &&
        day.status !== "sick" &&
        day.status !== "vacation" &&
        !day.isHoliday,
    ).length;

    const officeOnlyDays = monthlyReport.days.filter(
      (day) =>
        day.officeMinutes > 0 &&
        day.homeofficeMinutes === 0 &&
        day.businessTripMinutes === 0 &&
        day.status !== "sick" &&
        day.status !== "vacation" &&
        !day.isHoliday,
    ).length;

    const businessTripOnlyDays = monthlyReport.days.filter(
      (day) =>
        day.businessTripMinutes > 0 &&
        day.officeMinutes === 0 &&
        day.homeofficeMinutes === 0 &&
        day.status !== "sick" &&
        day.status !== "vacation" &&
        !day.isHoliday,
    ).length;

    const officeAndHomeofficeDays = monthlyReport.days.filter(
      (day) =>
        day.officeMinutes > 0 &&
        day.homeofficeMinutes > 0 &&
        day.status !== "sick" &&
        day.status !== "vacation" &&
        !day.isHoliday,
    ).length;

    const dailyRows = monthlyReport.days
      .map((day) => {
        const dayDate = new Date(`${day.date}T12:00:00`);

        const formattedDate = dayDate.toLocaleDateString("de-DE", {
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });

        const locations: string[] = [];

        if (day.officeMinutes > 0) {
          locations.push("Büro");
        }

        if (day.homeofficeMinutes > 0) {
          locations.push("Homeoffice");
        }

        if (day.businessTripMinutes > 0) {
          locations.push("Dienstreise");
        }

        const location =
          day.status === "sick"
            ? "Krank"
            : day.status === "vacation"
              ? "Urlaub"
              : day.isHoliday
                ? (day.holidayName ?? "Feiertag")
                : locations.length > 0
                  ? locations.join(" / ")
                  : "—";

        const saldo =
          day.overtimeMinutes > 0
            ? `+${reportService.formatMinutes(day.overtimeMinutes)}`
            : day.deficitMinutes > 0
              ? `-${reportService.formatMinutes(day.deficitMinutes)}`
              : "0h 00min";

        const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;

        return `
        <tr class="${
          day.status === "sick"
            ? "sick-row"
            : day.status === "vacation"
              ? "vacation-row"
              : day.isHoliday
                ? "holiday-row"
                : isWeekend
                  ? "weekend-row"
                  : ""
        }">
          <td>${escapeHtml(formattedDate)}</td>

          <td>${escapeHtml(location)}</td>

          <td class="number">
            ${
              day.sickMinutes > 0
                ? reportService.formatMinutes(day.sickMinutes)
                : "—"
            }
          </td>

          <td class="number">
            ${
              isWeekend
                ? "0h 00min"
                : day.isHoliday
                  ? "Feiertag"
                  : reportService.formatMinutes(day.targetMinutes)
            }
          </td>

          <td class="number">
            ${reportService.formatMinutes(day.totalWorkMinutes)}
          </td>

          <td class="number">
            ${reportService.formatMinutes(day.totalPauseMinutes)}
          </td>

          <td class="number">${escapeHtml(saldo)}</td>
        </tr>
      `;
      })
      .join("");

    const html = `
    <!DOCTYPE html>
    <html lang="de">
      <head>
        <meta charset="UTF-8" />

        <title>
          Tagesübersicht ${monthlyReport.month}/${monthlyReport.year}
        </title>

        <style>
          * {
            box-sizing: border-box;
          }

          @page {
            size: A4 landscape;
            margin: 12mm;
          }

          body {
            margin: 0;
            font-family: Arial, Helvetica, sans-serif;
            color: #111827;
            background: #ffffff;
            font-size: 11px;
          }

          h1 {
            margin: 0;
            font-size: 24px;
          }

          .subtitle {
            margin-top: 4px;
            color: #6b7280;
            font-size: 11px;
          }

          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 18px;
          }

          .employee {
            margin-bottom: 16px;
            padding: 10px 12px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            background: #f8fafc;
            font-size: 11px;
          }

          .section-title {
            margin: 0 0 8px;
            font-size: 17px;
          }

          .workday-summary {
            display: grid;
            grid-template-columns: repeat(6, 1fr);
            gap: 8px;
            margin-bottom: 18px;
          }

          .workday-card {
            padding: 9px 10px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            background: #ffffff;
          }

          .label {
            margin-bottom: 4px;
            color: #6b7280;
            font-size: 9px;
            line-height: 1.2;
          }

          .workday-value {
            font-size: 16px;
            font-weight: 700;
            color: #111827;
          }

          .workday-unit {
            margin-top: 2px;
            color: #9ca3af;
            font-size: 8px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
          }

          thead {
            display: table-header-group;
          }

          tr {
            page-break-inside: avoid;
          }

          th,
          td {
            padding: 6px 7px;
            border-bottom: 1px solid #e5e7eb;
            text-align: left;
            vertical-align: middle;
            font-size: 9px;
          }

          th {
            background: #f8fafc;
            color: #475569;
            font-size: 8px;
            font-weight: 700;
          }

          td.number,
          th.number {
            text-align: right;
            white-space: nowrap;
          }

          .weekend-row {
            background: #f8fafc;
          }

          .holiday-row {
            background: #fffbeb;
          }

          .sick-row {
            background: #faf5ff;
          }

          .vacation-row {
            background: #eff6ff;
          }

          .footer {
            margin-top: 18px;
            color: #6b7280;
            font-size: 8px;
          }
        </style>
      </head>

      <body>
        <div class="header">
          <div>
            <h1>Tagesübersicht</h1>

            <div class="subtitle">
              Arbeitszeiten im ausgewählten Monat:
              ${escapeHtml(reportService.formatMonth(monthlyReport.month))}
              ${monthlyReport.year}
            </div>
          </div>

          <div>
            <strong>${monthlyReport.year}</strong>
          </div>
        </div>

        <div class="employee">
          <strong>Mitarbeiter:</strong>
          ${escapeHtml(user.displayName)}
        </div>

        <h2 class="section-title">Tagesübersicht</h2>

        <div class="subtitle">
          Arbeitszeiten im ausgewählten Monat
        </div>

        <div class="workday-summary">

          <div class="workday-card">
            <div class="label">Gesamte Arbeitstage</div>
            <div class="workday-value">${totalWorkDays}</div>
            <div class="workday-unit">
              ${totalWorkDays === 1 ? "Arbeitstag" : "Arbeitstage"}
            </div>
          </div>

          <div class="workday-card">
            <div class="label">Ohne Dienstreisen</div>
            <div class="workday-value">
              ${totalWorkDaysWithoutBusinessTrip}
            </div>
            <div class="workday-unit">
              ${
                totalWorkDaysWithoutBusinessTrip === 1
                  ? "Arbeitstag"
                  : "Arbeitstage"
              }
            </div>
          </div>

          <div class="workday-card">
            <div class="label">Nur Homeoffice</div>
            <div class="workday-value">
              ${homeofficeOnlyDays}
            </div>
            <div class="workday-unit">
              ${homeofficeOnlyDays === 1 ? "Arbeitstag" : "Arbeitstage"}
            </div>
          </div>

          <div class="workday-card">
            <div class="label">Nur Vor Ort</div>
            <div class="workday-value">
              ${officeOnlyDays}
            </div>
            <div class="workday-unit">
              ${officeOnlyDays === 1 ? "Arbeitstag" : "Arbeitstage"}
            </div>
          </div>

          <div class="workday-card">
            <div class="label">Nur Dienstreise</div>
            <div class="workday-value">
              ${businessTripOnlyDays}
            </div>
            <div class="workday-unit">
              ${businessTripOnlyDays === 1 ? "Arbeitstag" : "Arbeitstage"}
            </div>
          </div>

          <div class="workday-card">
            <div class="label">Büro / Homeoffice</div>
            <div class="workday-value">
              ${officeAndHomeofficeDays}
            </div>
            <div class="workday-unit">
              ${officeAndHomeofficeDays === 1 ? "Arbeitstag" : "Arbeitstage"}
            </div>
          </div>

        </div>

        <table>
          <thead>
            <tr>
              <th>Datum</th>
              <th>Ort</th>
              <th class="number">Krank</th>
              <th class="number">Soll</th>
              <th class="number">Ist</th>
              <th class="number">Pause</th>
              <th class="number">Saldo</th>
            </tr>
          </thead>

          <tbody>
            ${dailyRows}
          </tbody>
        </table>

        <div class="footer">
          Erstellt mit TimeReport ·
          ${new Date().toLocaleString("de-DE")}
        </div>
      </body>
    </html>
  `;

    try {
      const result = await window.ipcRenderer.invoke(
        "create-report-pdf",
        html,
        `Tagesuebersicht-${monthlyReport.year}-${String(
          monthlyReport.month,
        ).padStart(2, "0")}.pdf`,
        true,
      );

      if (!result?.success) {
        alert(
          result?.message ??
            "Die Tagesübersicht konnte nicht als PDF erstellt werden.",
        );
      }
    } catch (error) {
      console.error("Fehler beim Erstellen der Tagesübersicht:", error);

      alert("Die Tagesübersicht konnte nicht als PDF erstellt werden.");
    }
  }

  async function handleCreatePdf() {
    if (!monthlyReport || !user) {
      return;
    }

    const escapeHtml = (value: string): string => {
      return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };

    const totalBalance =
      monthlyReport.overtimeMinutes - monthlyReport.deficitMinutes;

    const vacationDays = monthlyReport.days.filter(
      (day) => day.isApprovedVacation,
    ).length;

    const sickDays = monthlyReport.days.filter(
      (day) => day.status === "sick",
    ).length;

    const totalWorkDays = monthlyReport.days.filter(
      (day) =>
        day.totalWorkMinutes > 0 &&
        day.status !== "sick" &&
        day.status !== "vacation" &&
        !day.isHoliday,
    ).length;

    const totalWorkDaysWithoutBusinessTrip = monthlyReport.days.filter(
      (day) =>
        day.totalWorkMinutes > 0 &&
        day.businessTripMinutes === 0 &&
        day.status !== "sick" &&
        day.status !== "vacation" &&
        !day.isHoliday,
    ).length;

    const homeofficeOnlyDays = monthlyReport.days.filter(
      (day) =>
        day.homeofficeMinutes > 0 &&
        day.officeMinutes === 0 &&
        day.businessTripMinutes === 0 &&
        day.status !== "sick" &&
        day.status !== "vacation" &&
        !day.isHoliday,
    ).length;

    const officeOnlyDays = monthlyReport.days.filter(
      (day) =>
        day.officeMinutes > 0 &&
        day.homeofficeMinutes === 0 &&
        day.businessTripMinutes === 0 &&
        day.status !== "sick" &&
        day.status !== "vacation" &&
        !day.isHoliday,
    ).length;

    const businessTripOnlyDays = monthlyReport.days.filter(
      (day) =>
        day.businessTripMinutes > 0 &&
        day.officeMinutes === 0 &&
        day.homeofficeMinutes === 0 &&
        day.status !== "sick" &&
        day.status !== "vacation" &&
        !day.isHoliday,
    ).length;

    const officeAndHomeofficeDays = monthlyReport.days.filter(
      (day) =>
        day.officeMinutes > 0 &&
        day.homeofficeMinutes > 0 &&
        day.status !== "sick" &&
        day.status !== "vacation" &&
        !day.isHoliday,
    ).length;

    const dailyRows = monthlyReport.days
      .map((day) => {
        const dayDate = new Date(`${day.date}T12:00:00`);

        const formattedDate = dayDate.toLocaleDateString("de-DE", {
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });

        const locations: string[] = [];

        if (day.officeMinutes > 0) {
          locations.push("Büro");
        }

        if (day.homeofficeMinutes > 0) {
          locations.push("Homeoffice");
        }

        if (day.businessTripMinutes > 0) {
          locations.push("Dienstreise");
        }

        const location =
          day.status === "sick"
            ? "Krank"
            : day.status === "vacation"
              ? "Urlaub"
              : day.isHoliday
                ? (day.holidayName ?? "Feiertag")
                : locations.length > 0
                  ? locations.join(" / ")
                  : "—";

        const saldo =
          day.overtimeMinutes > 0
            ? `+${reportService.formatMinutes(day.overtimeMinutes)}`
            : day.deficitMinutes > 0
              ? `-${reportService.formatMinutes(day.deficitMinutes)}`
              : "0h 00min";

        return `
        <tr class="${
          day.status === "sick"
            ? "sick-row"
            : day.status === "vacation"
              ? "vacation-row"
              : day.isHoliday
                ? "holiday-row"
                : dayDate.getDay() === 0 || dayDate.getDay() === 6
                  ? "weekend-row"
                  : ""
        }">
          <td>${escapeHtml(formattedDate)}</td>

          <td>${escapeHtml(location)}</td>

          <td class="number">
            ${
              day.sickMinutes > 0
                ? reportService.formatMinutes(day.sickMinutes)
                : "—"
            }
          </td>

          <td class="number">
            ${
              day.isHoliday
                ? "Feiertag"
                : reportService.formatMinutes(day.targetMinutes)
            }
          </td>

          <td class="number">
            ${reportService.formatMinutes(day.totalWorkMinutes)}
          </td>

          <td class="number">
            ${reportService.formatMinutes(day.totalPauseMinutes)}
          </td>

          <td class="number">
            ${escapeHtml(saldo)}
          </td>
        </tr>
      `;
      })
      .join("");

    const html = `
    <!DOCTYPE html>
    <html lang="de">
      <head>
        <meta charset="UTF-8" />

        <title>
          Monatsbericht ${monthlyReport.month}/${monthlyReport.year}
        </title>

        <style>
          * {
            box-sizing: border-box;
          }

          @page {
            size: A4;
            margin: 12mm;
          }

          body {
            margin: 0;
            font-family: Arial, Helvetica, sans-serif;
            color: #111827;
            background: #ffffff;
            font-size: 11px;
          }

          h1 {
            margin: 0;
            font-size: 26px;
          }

          h2 {
            margin: 0 0 8px;
            font-size: 18px;
          }

          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 20px;
          }

          .subtitle {
            margin-top: 5px;
            color: #6b7280;
            font-size: 12px;
          }

          .employee {
            margin-bottom: 18px;
            padding: 11px 13px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            background: #f8fafc;
            font-size: 12px;
          }

          .summary-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 9px;
            margin-bottom: 18px;
          }

          .summary-card {
            padding: 11px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            background: #ffffff;
          }

          .label {
            margin-bottom: 5px;
            color: #6b7280;
            font-size: 10px;
          }

          .value {
            font-size: 15px;
            font-weight: 700;
          }

          .locations {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 9px;
            margin-bottom: 18px;
          }

          /* Arbeitstage */

          .workday-summary {
            display: grid;
            grid-template-columns: repeat(6, 1fr);
            gap: 8px;
            margin-bottom: 18px;
          }

          .workday-card {
            padding: 9px 10px;
            border: 1px solid #e5e7eb;
            border-radius: 7px;
            background: #ffffff;
          }

          .workday-card .label {
            margin-bottom: 4px;
            color: #6b7280;
            font-size: 9px;
            line-height: 1.2;
          }

          .workday-card .workday-value {
            font-size: 16px;
            font-weight: 700;
            color: #111827;
          }
              
          .workday-card .workday-unit {
            margin-top: 2px;
            color: #9ca3af;
            font-size: 8px;
          }

          .workday-summary {
            display: grid;
            grid-template-columns: repeat(6, 1fr);
            gap: 8px;
            margin-bottom: 18px;
          }

          .workday-card {
            padding: 9px 10px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            background: #ffffff;
          }

          .workday-card .label {
            margin-bottom: 5px;
            color: #6b7280;
            font-size: 9px;
          }

          .workday-card .workday-value {
            font-size: 14px;
            font-weight: 700;
          }

          .workday-card .workday-unit {
            margin-top: 2px;
            color: #9ca3af;
            font-size: 8px;
          }

          .location-card {
            padding: 10px 11px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
          }

          .overview-title {
            margin-bottom: 8px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
          }

          thead {
            display: table-header-group;
          }

          tr {
            page-break-inside: avoid;
          }

          th,
          td {
            padding: 6px 7px;
            border-bottom: 1px solid #e5e7eb;
            text-align: left;
            vertical-align: middle;
            font-size: 9px;
          }

          th {
            background: #f8fafc;
            color: #475569;
            font-size: 8px;
            font-weight: 700;
            text-transform: uppercase;
          }

          td.number,
          th.number {
            text-align: right;
            white-space: nowrap;
          }

          .weekend-row {
            background: #f8fafc;
          }

          .holiday-row {
            background: #fffbeb;
          }

          .sick-row {
            background: #faf5ff;
          }

          .vacation-row {
            background: #eff6ff;
          }

          .positive {
            color: #15803d;
            font-weight: 700;
          }

          .negative {
            color: #dc2626;
            font-weight: 700;
          }

          .footer {
            margin-top: 22px;
            color: #6b7280;
            font-size: 8px;
          }
        </style>
      </head>

      <body>
        <div class="header">
          <div>
            <h1>Monatsbericht</h1>

            <div class="subtitle">
              ${escapeHtml(reportService.formatMonth(monthlyReport.month))}
              ${monthlyReport.year}
            </div>
          </div>

          <div>
            <strong>${monthlyReport.year}</strong>
          </div>
        </div>

        <div class="employee">
          <strong>Mitarbeiter:</strong>
          ${escapeHtml(user.displayName)}
        </div>

        <h2>Monatsübersicht</h2>

        <div class="summary-grid">
          <div class="summary-card">
            <div class="label">Sollzeit</div>
            <div class="value">
              ${reportService.formatMinutes(monthlyReport.targetMinutes)}
            </div>
          </div>

          <div class="summary-card">
            <div class="label">Istzeit</div>
            <div class="value">
              ${reportService.formatMinutes(monthlyReport.totalWorkMinutes)}
            </div>
          </div>

          <div class="summary-card">
            <div class="label">Überstunden</div>
            <div class="value positive">
              +${reportService.formatMinutes(monthlyReport.overtimeMinutes)}
            </div>
          </div>

          <div class="summary-card">
            <div class="label">Fehlzeit</div>
            <div class="value negative">
              ${reportService.formatMinutes(monthlyReport.deficitMinutes)}
            </div>
          </div>

          <div class="summary-card">
            <div class="label">Saldo</div>
            <div class="value ${
              totalBalance > 0 ? "positive" : totalBalance < 0 ? "negative" : ""
            }">
              ${
                totalBalance > 0
                  ? `+${reportService.formatMinutes(totalBalance)}`
                  : reportService.formatMinutes(totalBalance)
              }
            </div>
          </div>

          <div class="summary-card">
            <div class="label">Krankheit</div>
            <div class="value">
              ${reportService.formatMinutes(monthlyReport.sickMinutes)}
            </div>
          </div>

          <div class="summary-card">
            <div class="label">Kranktage</div>
            <div class="value">
              ${sickDays}
            </div>
          </div>

          <div class="summary-card">
            <div class="label">Urlaubstage</div>
            <div class="value">
              ${vacationDays}
            </div>
          </div>
        </div>

        <h2>Arbeitsorte</h2>

        <div class="locations">
          <div class="location-card">
            <div class="label">🏢 Vor Ort</div>
            <strong>
              ${monthlyReport.officeDays}
              ${monthlyReport.officeDays === 1 ? "Tag" : "Tage"}
            </strong>

            <br />

            ${reportService.formatMinutes(monthlyReport.officeMinutes)}
          </div>

          <div class="location-card">
            <div class="label">🏠 Homeoffice</div>
            <strong>
              ${monthlyReport.homeofficeDays}
              ${monthlyReport.homeofficeDays === 1 ? "Tag" : "Tage"}
            </strong>

            <br />

            ${reportService.formatMinutes(monthlyReport.homeofficeMinutes)}
          </div>

          <div class="location-card">
            <div class="label">🚗 Dienstreise</div>
            <strong>
              ${monthlyReport.businessTripDays}
              ${monthlyReport.businessTripDays === 1 ? "Tag" : "Tage"}
            </strong>

            <br />

            ${reportService.formatMinutes(monthlyReport.businessTripMinutes)}
          </div>
        </div>      

        <div class="overview-title">
          <h2>Tagesübersicht</h2>

          <div class="subtitle">
            Arbeitszeiten im ausgewählten Monat
          </div>
        </div>

        <div class="workday-summary">

          <div class="workday-card">
            <div class="label">Gesamte Arbeitstage</div>
            <div class="workday-value">${totalWorkDays}</div>
            <div class="workday-unit">
              ${totalWorkDays === 1 ? "Arbeitstag" : "Arbeitstage"}
            </div>
          </div>

          <div class="workday-card">
            <div class="label">Ohne Dienstreisen</div>
            <div class="workday-value">
              ${totalWorkDaysWithoutBusinessTrip}
            </div>
            <div class="workday-unit">
              ${totalWorkDaysWithoutBusinessTrip === 1 ? "Arbeitstag" : "Arbeitstage"}
            </div>
          </div>

          <div class="workday-card">
            <div class="label">Nur Homeoffice</div>
            <div class="workday-value">
              ${homeofficeOnlyDays}
            </div>
            <div class="workday-unit">
              ${homeofficeOnlyDays === 1 ? "Arbeitstag" : "Arbeitstage"}
            </div>
          </div>

  <div class="workday-card">
    <div class="label">Nur Vor Ort</div>
    <div class="workday-value">
      ${officeOnlyDays}
    </div>
    <div class="workday-unit">
      ${officeOnlyDays === 1 ? "Arbeitstag" : "Arbeitstage"}
    </div>
  </div>

  <div class="workday-card">
    <div class="label">Nur Dienstreise</div>
    <div class="workday-value">
      ${businessTripOnlyDays}
    </div>
    <div class="workday-unit">
      ${businessTripOnlyDays === 1 ? "Arbeitstag" : "Arbeitstage"}
    </div>
  </div>

  <div class="workday-card">
    <div class="label">Büro / Homeoffice</div>
    <div class="workday-value">
      ${officeAndHomeofficeDays}
    </div>
    <div class="workday-unit">
      ${officeAndHomeofficeDays === 1 ? "Arbeitstag" : "Arbeitstage"}
    </div>
  </div>

</div>

<table>
          <thead>
            <tr>
              <th>Datum</th>
              <th>Ort</th>
              <th class="number">Krank</th>
              <th class="number">Soll</th>
              <th class="number">Ist</th>
              <th class="number">Pause</th>
              <th class="number">Saldo</th>
            </tr>
          </thead>

          <tbody>
            ${dailyRows}
          </tbody>
        </table>

        <div class="footer">
          Erstellt mit TimeReport ·
          ${new Date().toLocaleString("de-DE")}
        </div>
      </body>
    </html>
  `;

    try {
      const result = await window.ipcRenderer.invoke(
        "create-report-pdf",
        html,
        `Monatsbericht-${monthlyReport.year}-${String(
          monthlyReport.month,
        ).padStart(2, "0")}.pdf`,
      );

      if (!result?.success) {
        alert(
          result?.message ??
            "Der Monatsbericht konnte nicht als PDF erstellt werden.",
        );
      }
    } catch (error) {
      console.error("Fehler beim Erstellen des Monatsberichts:", error);

      alert("Der Monatsbericht konnte nicht als PDF erstellt werden.");
    }
  }

  return (
    <div className="monthly-report-page">
      <div className="monthly-report-header">
        <div>
          <h1>Monatsbericht</h1>
          <p>Arbeitszeit und Tagesübersicht für einen Monat</p>
        </div>

        <button
          type="button"
          className="monthly-pdf-button"
          onClick={handleCreatePdf}
          disabled={!monthlyReport}
          title="Monatsbericht als PDF speichern"
        >
          📄 PDF
        </button>
      </div>

      <section className="monthly-report-selector">
        <div className="monthly-section-title">
          <div>
            <h2>Monat auswählen</h2>
            <p>Wähle den gewünschten Monat für deine Auswertung.</p>
          </div>
        </div>

        <div className="monthly-filter-grid">
          <label className="monthly-filter-field">
            <span>Monat</span>

            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {reportService.formatMonth(i + 1)}
                </option>
              ))}
            </select>
          </label>

          <label className="monthly-filter-field">
            <span>Jahr</span>

            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
            >
              {Array.from({ length: 5 }, (_, i) => {
                const year = currentDate.getFullYear() - 2 + i;

                return (
                  <option key={year} value={year}>
                    {year}
                  </option>
                );
              })}
            </select>
          </label>
        </div>
      </section>

      <section className="monthly-report-card">
        <div className="monthly-report-card-header">
          <div>
            <h2>Monatsbericht</h2>

            {monthlyReport ? (
              <p>
                {reportService.formatMonth(monthlyReport.month)}{" "}
                {monthlyReport.year}
              </p>
            ) : (
              <p>Lade Bericht...</p>
            )}
          </div>

          <div className="monthly-report-icon">📈</div>
        </div>

        {!monthlyReport && (
          <div className="monthly-loading-state">Bericht wird geladen...</div>
        )}

        {monthlyReport &&
          (() => {
            const dailyTargetMinutes =
              monthlyReport.days.find((day) => day.targetMinutes > 0)
                ?.targetMinutes ?? 0;

            const totalWorkingDays = monthlyReport.days.filter((day) => {
              const date = new Date(`${day.date}T12:00:00`);
              const dayOfWeek = date.getDay();

              return dayOfWeek >= 1 && dayOfWeek <= 5 && !day.isHoliday;
            }).length;

            const totalWorkDays = monthlyReport.days.filter(
              (day) =>
                day.totalWorkMinutes > 0 &&
                day.status !== "sick" &&
                day.status !== "vacation" &&
                !day.isHoliday,
            ).length;

            const totalWorkDaysWithoutBusinessTrip = monthlyReport.days.filter(
              (day) =>
                day.totalWorkMinutes > 0 &&
                day.businessTripMinutes === 0 &&
                day.status !== "sick" &&
                day.status !== "vacation" &&
                !day.isHoliday,
            ).length;

            const homeofficeOnlyDays = monthlyReport.days.filter(
              (day) =>
                day.homeofficeMinutes > 0 &&
                day.officeMinutes === 0 &&
                day.businessTripMinutes === 0 &&
                day.status !== "sick" &&
                day.status !== "vacation" &&
                !day.isHoliday,
            ).length;

            const officeOnlyDays = monthlyReport.days.filter(
              (day) =>
                day.officeMinutes > 0 &&
                day.homeofficeMinutes === 0 &&
                day.businessTripMinutes === 0 &&
                day.status !== "sick" &&
                day.status !== "vacation" &&
                !day.isHoliday,
            ).length;

            const officeOrHomeofficeDays = monthlyReport.days.filter(
              (day) =>
                (day.officeMinutes > 0 || day.homeofficeMinutes > 0) &&
                day.status !== "sick" &&
                day.status !== "vacation" &&
                !day.isHoliday,
            ).length;

            const businessTripOnlyDays = monthlyReport.days.filter(
              (day) =>
                day.businessTripMinutes > 0 &&
                day.officeMinutes === 0 &&
                day.homeofficeMinutes === 0 &&
                day.status !== "sick" &&
                day.status !== "vacation" &&
                !day.isHoliday,
            ).length;

            return (
              <>
                <div className="monthly-report-stats">
                  <div className="monthly-stat-card monthly-stat-work">
                    <span>Arbeitszeit</span>

                    <strong>
                      {reportService.formatMinutes(
                        monthlyReport.totalWorkMinutes,
                      )}
                    </strong>

                    <small>
                      {reportService.formatMinutesAsWorkDays(
                        monthlyReport.totalWorkMinutes,
                        dailyTargetMinutes,
                      )}
                    </small>
                  </div>

                  <div className="monthly-stat-card monthly-stat-target">
                    <span>Sollzeit</span>

                    <strong>
                      {reportService.formatMinutes(monthlyReport.targetMinutes)}
                    </strong>

                    <small>
                      {dailyTargetMinutes > 0
                        ? Math.round(
                            monthlyReport.targetMinutes / dailyTargetMinutes,
                          )
                        : 0}{" "}
                      von {totalWorkingDays} Arbeitstagen
                    </small>
                  </div>

                  <div className="monthly-stat-card monthly-stat-sick">
                    <span>Krank</span>

                    <strong>
                      {reportService.formatMinutes(monthlyReport.sickMinutes)}
                    </strong>

                    <small>
                      {reportService.formatMinutesAsWorkDays(
                        monthlyReport.sickMinutes,
                        dailyTargetMinutes,
                      )}
                    </small>
                  </div>

                  <div className="monthly-stat-card monthly-stat-overtime">
                    <span>Überstunden</span>

                    <strong>
                      +
                      {reportService.formatMinutes(
                        monthlyReport.overtimeMinutes,
                      )}
                    </strong>

                    <small>
                      {reportService.formatMinutesAsWorkDays(
                        monthlyReport.overtimeMinutes,
                        dailyTargetMinutes,
                      )}
                    </small>
                  </div>

                  <div className="monthly-stat-card monthly-stat-deficit">
                    <span>Fehlzeit</span>

                    <strong>
                      {reportService.formatMinutes(
                        monthlyReport.deficitMinutes,
                      )}
                    </strong>

                    <small>
                      {reportService.formatMinutesAsWorkDays(
                        monthlyReport.deficitMinutes,
                        dailyTargetMinutes,
                      )}
                    </small>
                  </div>

                  <div className="monthly-stat-card">
                    <span>🏢 Vor Ort</span>

                    <strong>
                      {monthlyReport.officeDays}{" "}
                      {monthlyReport.officeDays === 1 ? "Tag" : "Tage"}
                    </strong>

                    <small>
                      {reportService.formatMinutes(monthlyReport.officeMinutes)}
                    </small>
                  </div>

                  <div className="monthly-stat-card">
                    <span>🏠 Homeoffice</span>

                    <strong>
                      {monthlyReport.homeofficeDays}{" "}
                      {monthlyReport.homeofficeDays === 1 ? "Tag" : "Tage"}
                    </strong>

                    <small>
                      {reportService.formatMinutes(
                        monthlyReport.homeofficeMinutes,
                      )}
                    </small>
                  </div>

                  <div className="monthly-stat-card monthly-stat-business-trip">
                    <span>🚗 Dienstreise</span>

                    <strong>
                      {monthlyReport.businessTripDays}{" "}
                      {monthlyReport.businessTripDays === 1 ? "Tag" : "Tage"}
                    </strong>

                    <small>
                      {reportService.formatMinutes(
                        monthlyReport.businessTripMinutes,
                      )}
                    </small>
                  </div>

                  <div className="monthly-stat-card">
                    <span>🌴 Urlaub</span>

                    <strong>
                      {
                        monthlyReport.days.filter(
                          (day) => day.isApprovedVacation,
                        ).length
                      }{" "}
                      {monthlyReport.days.filter(
                        (day) => day.isApprovedVacation,
                      ).length === 1
                        ? "Tag"
                        : "Tage"}
                    </strong>

                    <small>Genehmigter Urlaub</small>
                  </div>
                </div>

                <div className="monthly-daily-overview">
                  <div className="monthly-overview-header">
                    <div>
                      <h3>Tagesübersicht</h3>
                      <p>Arbeitszeiten im ausgewählten Monat</p>
                    </div>

                    <button
                      type="button"
                      className="monthly-daily-pdf-button"
                      onClick={handleCreateDailyOverviewPdf}
                      disabled={!monthlyReport}
                      title="Tagesübersicht als PDF speichern"
                    >
                      📄 PDF
                    </button>
                  </div>

                  <div className="monthly-workday-summary">
                    <div className="monthly-workday-card">
                      <span>Gesamte Arbeitstage</span>
                      <strong>{totalWorkDays}</strong>
                      <small>
                        {totalWorkDays === 1 ? "Arbeitstag" : "Arbeitstage"}
                      </small>
                    </div>

                    <div className="monthly-workday-card">
                      <span>Arbeitstage ohne Dienstreisen</span>
                      <strong>{totalWorkDaysWithoutBusinessTrip}</strong>
                      <small>
                        {totalWorkDaysWithoutBusinessTrip === 1
                          ? "Arbeitstag"
                          : "Arbeitstage"}
                      </small>
                    </div>

                    <div className="monthly-workday-card">
                      <span>Nur Homeoffice</span>
                      <strong>{homeofficeOnlyDays}</strong>
                      <small>
                        {homeofficeOnlyDays === 1
                          ? "Arbeitstag"
                          : "Arbeitstage"}
                      </small>
                    </div>

                    <div className="monthly-workday-card">
                      <span>Nur Vor Ort</span>
                      <strong>{officeOnlyDays}</strong>
                      <small>
                        {officeOnlyDays === 1 ? "Arbeitstag" : "Arbeitstage"}
                      </small>
                    </div>

                    <div className="monthly-workday-card">
                      <span>Büro / Homeoffice</span>
                      <strong>{officeOrHomeofficeDays}</strong>
                      <small>
                        {officeOrHomeofficeDays === 1
                          ? "Arbeitstag"
                          : "Arbeitstage"}
                      </small>
                    </div>

                    <div className="monthly-workday-card">
                      <span>Nur Dienstreise</span>
                      <strong>{businessTripOnlyDays}</strong>
                      <small>
                        {businessTripOnlyDays === 1
                          ? "Arbeitstag"
                          : "Arbeitstage"}
                      </small>
                    </div>
                  </div>

                  <div className="monthly-table-wrapper">
                    <table className="monthly-report-table">
                      <thead>
                        <tr>
                          <th>Datum</th>
                          <th className="monthly-center">Ort</th>
                          <th className="monthly-right">Krank</th>
                          <th className="monthly-right">Soll</th>
                          <th className="monthly-right">Ist</th>
                          <th className="monthly-right">Pause</th>
                          <th className="monthly-right">Saldo</th>
                        </tr>
                      </thead>

                      <tbody>
                        {monthlyReport.days.map((day) => {
                          const dayDate = new Date(`${day.date}T12:00:00`);

                          const dayOfWeek = dayDate.getDay();

                          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                          const isHoliday = day.isHoliday;

                          const saldo =
                            day.overtimeMinutes > 0
                              ? `+${reportService.formatMinutes(
                                  day.overtimeMinutes,
                                )}`
                              : day.deficitMinutes > 0
                                ? `-${reportService.formatMinutes(
                                    day.deficitMinutes,
                                  )}`
                                : "0h 00min";

                          const locations: string[] = [];

                          if (day.officeMinutes > 0) {
                            locations.push("Büro");
                          }

                          if (day.homeofficeMinutes > 0) {
                            locations.push("Homeoffice");
                          }

                          if (day.businessTripMinutes > 0) {
                            locations.push("Dienstreise");
                          }

                          const ort =
                            day.status === "sick"
                              ? "Krank"
                              : day.status === "vacation"
                                ? "Urlaub"
                                : day.isHoliday
                                  ? (day.holidayName ?? "Feiertag")
                                  : locations.length > 0
                                    ? locations.join(" / ")
                                    : "—";

                          return (
                            <tr
                              key={day.date}
                              className={
                                day.status === "sick"
                                  ? "monthly-sick-row"
                                  : day.status === "vacation"
                                    ? "monthly-vacation-row"
                                    : isHoliday
                                      ? "monthly-holiday-row"
                                      : isWeekend
                                        ? "monthly-weekend-row"
                                        : ""
                              }
                            >
                              <td>
                                {dayDate.toLocaleDateString("de-DE", {
                                  weekday: "short",
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                })}
                              </td>

                              <td
                                className={`monthly-center ${
                                  day.sickMinutes > 0
                                    ? "monthly-sick-value"
                                    : ""
                                }`}
                              >
                                {ort}
                              </td>

                              <td
                                className={`monthly-right ${
                                  day.sickMinutes > 0
                                    ? "monthly-sick-value"
                                    : ""
                                }`}
                              >
                                {day.sickMinutes > 0
                                  ? reportService.formatMinutes(day.sickMinutes)
                                  : "—"}
                              </td>

                              <td className="monthly-right">
                                {isWeekend
                                  ? "0h 00min"
                                  : isHoliday
                                    ? "Feiertag"
                                    : reportService.formatMinutes(
                                        day.targetMinutes,
                                      )}
                              </td>

                              <td className="monthly-right">
                                {reportService.formatMinutes(
                                  day.totalWorkMinutes,
                                )}
                              </td>

                              <td className="monthly-right">
                                {reportService.formatMinutes(
                                  day.totalPauseMinutes,
                                )}
                              </td>

                              <td
                                className={`monthly-right ${
                                  day.overtimeMinutes > 0
                                    ? "monthly-saldo-positive"
                                    : day.deficitMinutes > 0
                                      ? "monthly-saldo-negative"
                                      : ""
                                }`}
                              >
                                {saldo}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            );
          })()}
      </section>
    </div>
  );
}

export default MonthlyReport;
