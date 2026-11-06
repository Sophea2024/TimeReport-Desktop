import { useEffect, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

import "./YearlyReport.css";

import { reportService } from "../../Services/reports/ReportService";
import { YearlyReport as YearlyReportType } from "../../types/YearlyReport";
import { useAuth } from "../../context/AuthContext";

const MONTH_NAMES = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

// Normale Zeitangabe: immer Stunden und Minuten
function formatMinutes(minutes: number): string {
  const sign = minutes < 0 ? "-" : "";
  const absoluteMinutes = Math.abs(minutes);

  const hours = Math.floor(absoluteMinutes / 60);
  const remainingMinutes = absoluteMinutes % 60;

  return `${sign}${hours} h ${remainingMinutes
    .toString()
    .padStart(2, "0")} min`;
}

// Die tägliche Sollzeit kommt aus den Berichtstagen (ReportService übernimmt
// dafür die in den Einstellungen hinterlegte Arbeitszeit). Es gibt bewusst
// keinen fest codierten Stundenwert.
function formatMinutesAsWorkDays(
  minutes: number,
  dailyTargetMinutes: number,
): string {
  if (!Number.isFinite(minutes)) {
    return "—";
  }

  if (!Number.isFinite(dailyTargetMinutes) || dailyTargetMinutes <= 0) {
    return formatMinutes(minutes);
  }

  const sign = minutes < 0 ? "-" : "";
  const absoluteMinutes = Math.abs(Math.trunc(minutes));

  const days = Math.floor(absoluteMinutes / dailyTargetMinutes);
  const remainingAfterDays = absoluteMinutes % dailyTargetMinutes;
  const hours = Math.floor(remainingAfterDays / 60);
  const remainingMinutes = remainingAfterDays % 60;

  return `${sign}${days} ${days === 1 ? "Tag" : "Tage"}, ${hours} h ${remainingMinutes
    .toString()
    .padStart(2, "0")} min`;
}

function formatBalance(minutes: number, dailyTargetMinutes: number): string {
  if (minutes === 0) {
    return formatMinutesAsWorkDays(0, dailyTargetMinutes);
  }

  const formatted = formatMinutesAsWorkDays(minutes, dailyTargetMinutes);

  return minutes > 0 ? `+${formatted}` : formatted;
}

export default function YearlyReport() {
  const { user } = useAuth();

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const [report, setReport] = useState<YearlyReportType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [yearlyWorkdayStats, setYearlyWorkdayStats] = useState({
    totalWorkDays: 0,
    totalWorkDaysWithoutBusinessTrip: 0,
    homeofficeOnlyDays: 0,
    officeOnlyDays: 0,
    businessTripOnlyDays: 0,
    officeAndHomeofficeDays: 0,
  });

  useEffect(() => {
    if (!user?.id) return;

    const loadReport = async () => {
      try {
        setLoading(true);
        setError("");

        const yearlyReport = await reportService.getYearlyReport(
          selectedYear,
          user.id,
        );

        setReport(yearlyReport);

        const monthlyReports = await Promise.all(
          Array.from({ length: 12 }, (_, index) =>
            reportService.getMonthlyReport(index + 1, selectedYear, user.id),
          ),
        );

        const days = monthlyReports.flatMap((monthly) => monthly.days);

        const totalWorkDays = days.filter(
          (day) =>
            day.totalWorkMinutes > 0 &&
            day.status !== "sick" &&
            day.status !== "vacation" &&
            !day.isHoliday,
        ).length;

        const totalWorkDaysWithoutBusinessTrip = days.filter(
          (day) =>
            day.totalWorkMinutes > 0 &&
            day.businessTripMinutes === 0 &&
            day.status !== "sick" &&
            day.status !== "vacation" &&
            !day.isHoliday,
        ).length;

        const homeofficeOnlyDays = days.filter(
          (day) =>
            day.homeofficeMinutes > 0 &&
            day.officeMinutes === 0 &&
            day.businessTripMinutes === 0 &&
            day.status !== "sick" &&
            day.status !== "vacation" &&
            !day.isHoliday,
        ).length;

        const officeOnlyDays = days.filter(
          (day) =>
            day.officeMinutes > 0 &&
            day.homeofficeMinutes === 0 &&
            day.businessTripMinutes === 0 &&
            day.status !== "sick" &&
            day.status !== "vacation" &&
            !day.isHoliday,
        ).length;

        const businessTripOnlyDays = days.filter(
          (day) =>
            day.businessTripMinutes > 0 &&
            day.officeMinutes === 0 &&
            day.homeofficeMinutes === 0 &&
            day.status !== "sick" &&
            day.status !== "vacation" &&
            !day.isHoliday,
        ).length;

        const officeAndHomeofficeDays = days.filter(
          (day) =>
            day.officeMinutes > 0 &&
            day.homeofficeMinutes > 0 &&
            day.status !== "sick" &&
            day.status !== "vacation" &&
            !day.isHoliday,
        ).length;

        setYearlyWorkdayStats({
          totalWorkDays,
          totalWorkDaysWithoutBusinessTrip,
          homeofficeOnlyDays,
          officeOnlyDays,
          businessTripOnlyDays,
          officeAndHomeofficeDays,
        });
      } catch (err) {
        console.error("Fehler beim Laden des Jahresberichts:", err);
        setError("Der Jahresbericht konnte nicht geladen werden.");
      } finally {
        setLoading(false);
      }
    };

    loadReport();
  }, [selectedYear, user?.id]);

  const goToPreviousYear = () => {
    setSelectedYear((year) => year - 1);
  };

  const goToNextYear = () => {
    setSelectedYear((year) => year + 1);
  };

  const isFutureMonth = (month: number) => {
    const now = new Date();

    return selectedYear === now.getFullYear() && month > now.getMonth() + 1;
  };

  if (!report && loading) {
    return (
      <div className="yearly-report-scroll">
        <div className="yearly-report-page">
          <div className="reports-header">
            <div>
              <h1>Jahresbericht</h1>
              <p>Übersicht der Arbeitszeiten für {selectedYear}</p>
            </div>
            <div className="yearly-report-filters">
              <button
                type="button"
                className="yearly-report-nav-button"
                onClick={goToPreviousYear}
                aria-label="Vorheriges Jahr"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="yearly-report-period">
                <Calendar size={18} />
                <span>{selectedYear}</span>
              </div>
              <button
                type="button"
                className="yearly-report-nav-button"
                onClick={goToNextYear}
                aria-label="Nächstes Jahr"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          <div className="yearly-report-card">
            <div className="report-empty">Jahresbericht wird geladen...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="yearly-report-scroll">
        <div className="yearly-report-page">
          <div className="reports-header">
            <div>
              <h1>Jahresbericht</h1>
              <p>Übersicht der Arbeitszeiten für {selectedYear}</p>
            </div>
            <div className="yearly-report-filters">
              <button
                type="button"
                className="yearly-report-nav-button"
                onClick={goToPreviousYear}
                aria-label="Vorheriges Jahr"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="yearly-report-period">
                <Calendar size={18} />
                <span>{selectedYear}</span>
              </div>
              <button
                type="button"
                className="yearly-report-nav-button"
                onClick={goToNextYear}
                aria-label="Nächstes Jahr"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          <div className="yearly-report-card">
            <div className="report-empty report-error">
              {error || "Keine Daten verfügbar."}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const totalBalance = report.overtimeMinutes - report.deficitMinutes;

  const yearlyVacationDays = report.months.reduce(
    (total, month) =>
      total + month.days.filter((day) => day.isApprovedVacation).length,
    0,
  );

  // targetMinutes eines regulären Berichtstags entspricht der individuellen
  // täglichen Sollzeit, die der ReportService aus den Benutzereinstellungen lädt.
  const dailyTargetMinutes =
    report.months
      .flatMap((month) => month.days)
      .find((day) => Number.isFinite(day.targetMinutes) && day.targetMinutes > 0)
      ?.targetMinutes ?? 0;

  async function handleCreateWorkdayPdf() {
    if (!report || !user) return;

    const escapeHtml = (value: string): string =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const {
      totalWorkDays,
      totalWorkDaysWithoutBusinessTrip,
      homeofficeOnlyDays,
      officeOnlyDays,
      businessTripOnlyDays,
      officeAndHomeofficeDays,
    } = yearlyWorkdayStats;

    const workdayBalance = report.overtimeMinutes - report.deficitMinutes;

    const monthRows = report.months
      .map((month) => {
        const future = isFutureMonth(month.month);
        const balance = month.overtimeMinutes - month.deficitMinutes;
        const monthVacationDays = month.days.filter(
          (day) => day.isApprovedVacation,
        ).length;

        return `
        <tr class="${future ? "future-row" : ""}">
          <td class="month">${escapeHtml(MONTH_NAMES[month.month - 1])}</td>
          <td class="number">${future ? "—" : formatMinutesAsWorkDays(month.totalWorkMinutes, dailyTargetMinutes)}</td>
          <td class="number">${future ? "—" : formatMinutesAsWorkDays(month.targetMinutes, dailyTargetMinutes)}</td>
          <td class="number">${future ? "—" : formatMinutesAsWorkDays(month.overtimeMinutes, dailyTargetMinutes)}</td>
          <td class="number">${future ? "—" : formatMinutesAsWorkDays(month.deficitMinutes, dailyTargetMinutes)}</td>
          <td class="number">${future ? "—" : formatMinutesAsWorkDays(month.sickMinutes, dailyTargetMinutes)}</td>
          <td class="number">${future ? "—" : monthVacationDays}</td>
          <td class="number">${future ? "—" : formatMinutesAsWorkDays(month.officeMinutes, dailyTargetMinutes)}</td>
          <td class="number">${future ? "—" : formatMinutesAsWorkDays(month.homeofficeMinutes, dailyTargetMinutes)}</td>
          <td class="number">${future ? "—" : formatMinutesAsWorkDays(month.businessTripMinutes, dailyTargetMinutes)}</td>
          <td class="number">${future ? "—" : formatBalance(balance, dailyTargetMinutes)}</td>
        </tr>`;
      })
      .join("");

    const html = `
    <!DOCTYPE html>
    <html lang="de">
    <head>
      <meta charset="UTF-8" />
      <title>Arbeitstage ${report.year}</title>
      <style>
        * { box-sizing: border-box; }
        @page { size: A4 landscape; margin: 15mm; }
        body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111827; background: #fff; font-size: 10px; }
        h1 { margin: 0; font-size: 26px; }
        h2 { margin: 0 0 10px; font-size: 19px; }
        .header { margin-bottom: 22px; }
        .subtitle { margin-top: 5px; color: #6b7280; font-size: 12px; }
        .employee { margin-bottom: 24px; padding: 11px 13px; border: 1px solid #e5e7eb; border-radius: 8px; background: #f8fafc; font-size: 12px; }
        .workday-summary { display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px; margin-bottom: 24px; }
        .workday-card { padding: 14px 15px; border: 1px solid #e5e7eb; border-radius: 9px; background: #fff; }
        .label { margin-bottom: 7px; color: #6b7280; font-size: 10px; line-height: 1.25; }
        .workday-value { font-size: 21px; line-height: 1; font-weight: 700; color: #111827; }
        .workday-unit { margin-top: 5px; color: #9ca3af; font-size: 9px; }
        .table-title { margin: 22px 0 8px; font-size: 19px; }
        table { width: 100%; border-collapse: collapse; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; }
        th, td { padding: 6px 7px; border-bottom: 1px solid #e5e7eb; font-size: 8.5px; vertical-align: middle; }
        th { background: #f8fafc; color: #475569; font-size: 8px; font-weight: 700; text-transform: uppercase; white-space: nowrap; }
        td.month, th.month { text-align: left; }
        td.number, th.number { text-align: right; white-space: nowrap; }
        .positive { color: #15803d; font-weight: 700; }
        .negative { color: #dc2626; font-weight: 700; }
        .future-row { opacity: 0.45; }
        .total-row td { padding-top: 9px; padding-bottom: 9px; background: #f8fafc; border-top: 2px solid #e5e7eb; font-weight: 700; }
        .footer { margin-top: 20px; color: #6b7280; font-size: 8px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Arbeitstage</h1>
        <div class="subtitle">Arbeitstagsübersicht für ${report.year}</div>
      </div>
      <div class="employee">
        <strong>Mitarbeiter:</strong> ${escapeHtml(user.displayName)}
      </div>
      <h2>Arbeitstage</h2>
      <div class="workday-summary">
        ${[
          ["Gesamte Arbeitstage", totalWorkDays],
          ["Ohne Dienstreisen", totalWorkDaysWithoutBusinessTrip],
          ["Nur Homeoffice", homeofficeOnlyDays],
          ["Nur Vor Ort", officeOnlyDays],
          ["Nur Dienstreise", businessTripOnlyDays],
          ["Büro / Homeoffice", officeAndHomeofficeDays],
          ["Urlaubstage", yearlyVacationDays],
        ]
          .map(
            ([label, value]) => `
              <div class="workday-card">
                <div class="label">${label}</div>
                <div class="workday-value">${value}</div>
                <div class="workday-unit">${label === "Urlaubstage" ? (value === 1 ? "Urlaubstag" : "Urlaubstage") : (value === 1 ? "Arbeitstag" : "Arbeitstage")}</div>
              </div>`,
          )
          .join("")}
      </div>
      <h2 class="table-title">Monatsübersicht</h2>
      <table>
        <thead>
          <tr>
            <th class="month">Monat</th>
            <th class="number">Arbeitszeit</th>
            <th class="number">Sollzeit</th>
            <th class="number">Überstunden</th>
            <th class="number">Fehlzeit</th>
            <th class="number">Krank</th>
            <th class="number">Urlaub</th>
            <th class="number">Büro</th>
            <th class="number">Homeoffice</th>
            <th class="number">Dienstreise</th>
            <th class="number">Saldo</th>
          </tr>
        </thead>
        <tbody>
          ${monthRows}
          <tr class="total-row">
            <td class="month">Gesamt</td>
            <td class="number">${formatMinutesAsWorkDays(report.totalWorkMinutes, dailyTargetMinutes)}</td>
            <td class="number">${formatMinutesAsWorkDays(report.targetMinutes, dailyTargetMinutes)}</td>
            <td class="number">${formatMinutesAsWorkDays(report.overtimeMinutes, dailyTargetMinutes)}</td>
            <td class="number">${formatMinutesAsWorkDays(report.deficitMinutes, dailyTargetMinutes)}</td>
            <td class="number">${formatMinutesAsWorkDays(report.sickMinutes, dailyTargetMinutes)}</td>
            <td class="number">${yearlyVacationDays}</td>
            <td class="number">${formatMinutesAsWorkDays(report.officeMinutes, dailyTargetMinutes)}</td>
            <td class="number">${formatMinutesAsWorkDays(report.homeofficeMinutes, dailyTargetMinutes)}</td>
            <td class="number">${formatMinutesAsWorkDays(report.businessTripMinutes, dailyTargetMinutes)}</td>
            <td class="number">${formatBalance(workdayBalance, dailyTargetMinutes)}</td>
          </tr>
        </tbody>
      </table>
      <div class="footer">Erstellt mit TimeReport · ${new Date().toLocaleString("de-DE")}</div>
    </body>
    </html>`;

    try {
      const result = await window.ipcRenderer.invoke(
        "create-report-pdf",
        html,
        `Arbeitstage-${report.year}.pdf`,
        true,
      );

      if (!result?.success) {
        alert(
          result?.message ??
            "Die Arbeitstage konnten nicht als PDF erstellt werden.",
        );
      }
    } catch (error) {
      console.error("Fehler beim Erstellen des Arbeitstage-PDFs:", error);
      alert("Die Arbeitstage konnten nicht als PDF erstellt werden.");
    }
  }

  async function handleCreatePdf() {
    if (!report || !user) return;

    const escapeHtml = (value: string): string =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const vacationDays = yearlyVacationDays;

    const sickDays = report.months.reduce(
      (total, month) =>
        total + month.days.filter((day) => day.status === "sick").length,
      0,
    );

    const monthRows = report.months
      .map((month) => {
        const future = isFutureMonth(month.month);
        const balance = month.overtimeMinutes - month.deficitMinutes;
        const monthVacationDays = month.days.filter(
          (day) => day.isApprovedVacation,
        ).length;

        return `
        <tr class="${future ? "future-row" : ""}">
          <td class="month">${escapeHtml(MONTH_NAMES[month.month - 1])}</td>
          <td class="number">${future ? "—" : formatMinutesAsWorkDays(month.totalWorkMinutes, dailyTargetMinutes)}</td>
          <td class="number">${future ? "—" : formatMinutesAsWorkDays(month.targetMinutes, dailyTargetMinutes)}</td>
          <td class="number">${future ? "—" : formatMinutesAsWorkDays(month.overtimeMinutes, dailyTargetMinutes)}</td>
          <td class="number">${future ? "—" : formatMinutesAsWorkDays(month.deficitMinutes, dailyTargetMinutes)}</td>
          <td class="number">${future ? "—" : formatMinutesAsWorkDays(month.sickMinutes, dailyTargetMinutes)}</td>
          <td class="number">${future ? "—" : monthVacationDays}</td>
          <td class="number">${future ? "—" : formatMinutesAsWorkDays(month.officeMinutes, dailyTargetMinutes)}</td>
          <td class="number">${future ? "—" : formatMinutesAsWorkDays(month.homeofficeMinutes, dailyTargetMinutes)}</td>
          <td class="number">${future ? "—" : formatMinutesAsWorkDays(month.businessTripMinutes, dailyTargetMinutes)}</td>
          <td class="number">${future ? "—" : formatBalance(balance, dailyTargetMinutes)}</td>
        </tr>`;
      })
      .join("");

    const html = `
    <!DOCTYPE html>
    <html lang="de">
    <head>
      <meta charset="UTF-8" />
      <title>Jahresbericht ${report.year}</title>
      <style>
        * { box-sizing: border-box; }
        @page { size: A4 landscape; margin: 12mm; }
        body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111827; background: #fff; font-size: 10px; }
        h1 { margin: 0; font-size: 24px; }
        h2 { margin: 0 0 10px; font-size: 16px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; }
        .subtitle { margin-top: 5px; color: #6b7280; font-size: 11px; }
        .employee { margin-bottom: 16px; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 7px; background: #f8fafc; font-size: 11px; }
        .summary-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; margin-bottom: 16px; }
        .summary-card { padding: 9px 10px; border: 1px solid #e5e7eb; border-radius: 7px; }
        .label { margin-bottom: 4px; color: #6b7280; font-size: 9px; }
        .value { font-size: 13px; font-weight: 700; }
        .locations { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 18px; }
        .location-card { padding: 9px 10px; border: 1px solid #e5e7eb; border-radius: 7px; }
        .workday-summary { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-bottom: 18px; }
        .workday-card { padding: 9px 10px; border: 1px solid #e5e7eb; border-radius: 7px; background: #fff; }
        .workday-card .label { margin-bottom: 4px; color: #6b7280; font-size: 9px; line-height: 1.2; }
        .workday-card .workday-value { font-size: 16px; font-weight: 700; color: #111827; }
        .workday-card .workday-unit { margin-top: 2px; color: #9ca3af; font-size: 8px; }
        .table-title { margin-bottom: 7px; }
        table { width: 100%; border-collapse: collapse; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; }
        th, td { padding: 6px 7px; border-bottom: 1px solid #e5e7eb; font-size: 8.5px; vertical-align: middle; }
        th { background: #f8fafc; color: #475569; font-size: 8px; font-weight: 700; text-transform: uppercase; white-space: nowrap; }
        td.month, th.month { text-align: left; }
        td.number, th.number { text-align: right; white-space: nowrap; }
        .positive { color: #15803d; font-weight: 700; }
        .negative { color: #dc2626; font-weight: 700; }
        .future-row { opacity: 0.45; }
        .total-row td { padding-top: 9px; padding-bottom: 9px; background: #f8fafc; border-top: 2px solid #e5e7eb; font-weight: 700; }
        .footer { margin-top: 20px; color: #6b7280; font-size: 8px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1>Jahresbericht</h1>
          <div class="subtitle">Übersicht der Arbeitszeiten für ${report.year}</div>
        </div>
        <div><strong>${report.year}</strong></div>
      </div>
      <div class="employee"><strong>Mitarbeiter:</strong> ${escapeHtml(user.displayName)}</div>

      <h2>Jahresübersicht</h2>
      <div class="summary-grid">
        <div class="summary-card">
          <div class="label">Jahres-Sollzeit</div>
          <div class="value">${formatMinutesAsWorkDays(report.targetMinutes, dailyTargetMinutes)}</div>
        </div>
        <div class="summary-card">
          <div class="label">Jahres-Istzeit</div>
          <div class="value">${formatMinutesAsWorkDays(report.totalWorkMinutes, dailyTargetMinutes)}</div>
        </div>
        <div class="summary-card">
          <div class="label">Überstunden</div>
          <div class="value positive">${formatMinutesAsWorkDays(report.overtimeMinutes, dailyTargetMinutes)}</div>
        </div>
        <div class="summary-card">
          <div class="label">Fehlzeit</div>
          <div class="value negative">${formatMinutesAsWorkDays(report.deficitMinutes, dailyTargetMinutes)}</div>
        </div>
        <div class="summary-card">
          <div class="label">Jahres-Saldo</div>
          <div class="value ${totalBalance > 0 ? "positive" : totalBalance < 0 ? "negative" : ""}">
            ${formatBalance(totalBalance, dailyTargetMinutes)}
          </div>
        </div>
        <div class="summary-card">
          <div class="label">Krankheit</div>
          <div class="value">${formatMinutesAsWorkDays(report.sickMinutes, dailyTargetMinutes)}</div>
        </div>
        <div class="summary-card">
          <div class="label">Urlaubstage</div>
          <div class="value">${vacationDays}</div>
        </div>
      </div>

      <h2>Arbeitsorte</h2>
      <div class="locations">
        <div class="location-card">
          <div class="label">🏢 Vor Ort</div>
          <strong>${report.officeDays} ${report.officeDays === 1 ? "Tag" : "Tage"}</strong><br />
          ${formatMinutesAsWorkDays(report.officeMinutes, dailyTargetMinutes)}
        </div>
        <div class="location-card">
          <div class="label">🏠 Homeoffice</div>
          <strong>${report.homeofficeDays} ${report.homeofficeDays === 1 ? "Tag" : "Tage"}</strong><br />
          ${formatMinutesAsWorkDays(report.homeofficeMinutes, dailyTargetMinutes)}
        </div>
        <div class="location-card">
          <div class="label">🚗 Dienstreise</div>
          <strong>${report.businessTripDays} ${report.businessTripDays === 1 ? "Tag" : "Tage"}</strong><br />
          ${formatMinutesAsWorkDays(report.businessTripMinutes, dailyTargetMinutes)}
        </div>
      </div>

      <h2>Arbeitstage</h2>
      <div class="workday-summary">
        ${[
          ["Gesamte Arbeitstage", yearlyWorkdayStats.totalWorkDays],
          [
            "Ohne Dienstreisen",
            yearlyWorkdayStats.totalWorkDaysWithoutBusinessTrip,
          ],
          ["Nur Homeoffice", yearlyWorkdayStats.homeofficeOnlyDays],
          ["Nur Vor Ort", yearlyWorkdayStats.officeOnlyDays],
          ["Nur Dienstreise", yearlyWorkdayStats.businessTripOnlyDays],
          ["Büro / Homeoffice", yearlyWorkdayStats.officeAndHomeofficeDays],
        ]
          .map(
            ([label, value]) => `
              <div class="workday-card">
                <div class="label">${label}</div>
                <div class="workday-value">${value}</div>
                <div class="workday-unit">${value === 1 ? "Arbeitstag" : "Arbeitstage"}</div>
              </div>`,
          )
          .join("")}
      </div>

      <h2 class="table-title">Monatsübersicht</h2>
      <table>
        <thead>
          <tr>
            <th class="month">Monat</th>
            <th class="number">Arbeitszeit</th>
            <th class="number">Sollzeit</th>
            <th class="number">Überstunden</th>
            <th class="number">Fehlzeit</th>
            <th class="number">Krank</th>
            <th class="number">Urlaub</th>
            <th class="number">Büro</th>
            <th class="number">Homeoffice</th>
            <th class="number">Dienstreise</th>
            <th class="number">Saldo</th>
          </tr>
        </thead>
        <tbody>
          ${monthRows}
          <tr class="total-row">
            <td class="month">Gesamt</td>
            <td class="number">${formatMinutesAsWorkDays(report.totalWorkMinutes, dailyTargetMinutes)}</td>
            <td class="number">${formatMinutesAsWorkDays(report.targetMinutes, dailyTargetMinutes)}</td>
            <td class="number">${formatMinutesAsWorkDays(report.overtimeMinutes, dailyTargetMinutes)}</td>
            <td class="number">${formatMinutesAsWorkDays(report.deficitMinutes, dailyTargetMinutes)}</td>
            <td class="number">${formatMinutesAsWorkDays(report.sickMinutes, dailyTargetMinutes)}</td>
            <td class="number">${vacationDays}</td>
            <td class="number">${formatMinutesAsWorkDays(report.officeMinutes, dailyTargetMinutes)}</td>
            <td class="number">${formatMinutesAsWorkDays(report.homeofficeMinutes, dailyTargetMinutes)}</td>
            <td class="number">${formatMinutesAsWorkDays(report.businessTripMinutes, dailyTargetMinutes)}</td>
            <td class="number">${formatBalance(totalBalance, dailyTargetMinutes)}</td>
          </tr>
        </tbody>
      </table>

      <div style="margin-top: 16px;">
        <h2>Abwesenheiten</h2>
        <table>
          <tbody>
            <tr><td>Urlaubstage</td><td class="number">${vacationDays}</td></tr>
            <tr><td>Kranktage</td><td class="number">${sickDays}</td></tr>
            <tr><td>Krankheitszeit</td><td class="number">${formatMinutesAsWorkDays(report.sickMinutes, dailyTargetMinutes)}</td></tr>
          </tbody>
        </table>
      </div>

      <div class="footer">Erstellt mit TimeReport · ${new Date().toLocaleString("de-DE")}</div>
    </body>
    </html>`;

    try {
      const result = await window.ipcRenderer.invoke(
        "create-report-pdf",
        html,
        `Jahresbericht-${report.year}.pdf`,
        true,
      );

      if (!result?.success) {
        alert(
          result?.message ?? "Der Jahresbericht konnte nicht erstellt werden.",
        );
      }
    } catch (error) {
      console.error("Fehler beim Erstellen des Jahresberichts:", error);
      alert("Der Jahresbericht konnte nicht erstellt werden.");
    }
  }

  return (
    <div className="yearly-report-scroll">
      <div className="yearly-report-page">
        <div className="reports-header">
          <div>
            <h1>Jahresbericht</h1>
            <p>Übersicht der Arbeitszeiten für {selectedYear}</p>
          </div>

          <div className="yearly-report-header-actions">
            <div className="yearly-report-filters">
              <button
                type="button"
                className="yearly-report-nav-button"
                onClick={goToPreviousYear}
                aria-label="Vorheriges Jahr"
              >
                <ChevronLeft size={18} />
              </button>

              <div className="yearly-report-period">
                <Calendar size={18} />
                <span>{selectedYear}</span>
              </div>

              <button
                type="button"
                className="yearly-report-nav-button"
                onClick={goToNextYear}
                aria-label="Nächstes Jahr"
              >
                <ChevronRight size={18} />
              </button>

              <button
                type="button"
                className="yearly-pdf-button"
                onClick={handleCreatePdf}
                disabled={!report}
                title="Jahresbericht als PDF speichern"
              >
                📄 PDF
              </button>
            </div>
          </div>
        </div>

        <div className="yearly-workday-section">
          <div className="yearly-workday-header">
            <div>
              <h2>Arbeitstage</h2>
              <p>Übersicht der Arbeitstage im ausgewählten Jahr</p>
            </div>

            <button
              type="button"
              className="yearly-workday-pdf-button"
              onClick={handleCreateWorkdayPdf}
              disabled={!report}
              title="Arbeitstage als PDF speichern"
            >
              📄 PDF
            </button>
          </div>

          <div className="yearly-workday-summary">
            {[
              ["Gesamte Arbeitstage", yearlyWorkdayStats.totalWorkDays],
              [
                "Ohne Dienstreisen",
                yearlyWorkdayStats.totalWorkDaysWithoutBusinessTrip,
              ],
              ["Nur Homeoffice", yearlyWorkdayStats.homeofficeOnlyDays],
              ["Nur Vor Ort", yearlyWorkdayStats.officeOnlyDays],
              ["Nur Dienstreise", yearlyWorkdayStats.businessTripOnlyDays],
              ["Büro / Homeoffice", yearlyWorkdayStats.officeAndHomeofficeDays],
            ].map(([label, value]) => (
              <div className="yearly-workday-card" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>{value === 1 ? "Arbeitstag" : "Arbeitstage"}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="yearly-report-card">
          <div className="yearly-report-table-wrapper">
            <table className="report-table yearly-report-table">
              <thead>
                <tr>
                  <th>Monat</th>
                  <th>Arbeitszeit</th>
                  <th>Sollzeit</th>
                  <th>Überstunden</th>
                  <th>Fehlzeit</th>
                  <th>Krank</th>
                  <th>Urlaub</th>
                  <th>Büro</th>
                  <th>Homeoffice</th>
                  <th>Dienstreise</th>
                  <th>Saldo</th>
                </tr>
              </thead>

              <tbody>
                {report.months.map((month) => {
                  const future = isFutureMonth(month.month);
                  const balance = month.overtimeMinutes - month.deficitMinutes;
                  const monthVacationDays = month.days.filter(
                    (day) => day.isApprovedVacation,
                  ).length;

                  return (
                    <tr
                      key={`${month.year}-${month.month}`}
                      className={future ? "yearly-month-future" : ""}
                    >
                      <td>
                        <strong>{MONTH_NAMES[month.month - 1]}</strong>
                      </td>
                      <td>
                        {future ? "—" : formatMinutesAsWorkDays(month.totalWorkMinutes, dailyTargetMinutes)}
                      </td>
                      <td>
                        {future
                          ? "—"
                          : formatMinutesAsWorkDays(
                              month.targetMinutes,
                              dailyTargetMinutes,
                            )}
                      </td>
                      <td
                        className={
                          !future && month.overtimeMinutes > 0
                            ? "report-value-positive"
                            : ""
                        }
                      >
                        {future ? "—" : formatMinutesAsWorkDays(month.overtimeMinutes, dailyTargetMinutes)}
                      </td>
                      <td
                        className={
                          !future && month.deficitMinutes > 0
                            ? "report-value-negative"
                            : ""
                        }
                      >
                        {future ? "—" : formatMinutesAsWorkDays(month.deficitMinutes, dailyTargetMinutes)}
                      </td>
                      <td>{future ? "—" : formatMinutesAsWorkDays(month.sickMinutes, dailyTargetMinutes)}</td>
                      <td>{future ? "—" : monthVacationDays}</td>
                      <td>
                        {future ? "—" : formatMinutesAsWorkDays(month.officeMinutes, dailyTargetMinutes)}
                      </td>
                      <td>
                        {future ? "—" : formatMinutesAsWorkDays(month.homeofficeMinutes, dailyTargetMinutes)}
                      </td>
                      <td>
                        {future
                          ? "—"
                          : formatMinutesAsWorkDays(month.businessTripMinutes, dailyTargetMinutes)}
                      </td>
                      <td
                        className={
                          future
                            ? ""
                            : balance > 0
                              ? "report-value-positive"
                              : balance < 0
                                ? "report-value-negative"
                                : ""
                        }
                      >
                        {future
                          ? "—"
                          : formatBalance(balance, dailyTargetMinutes)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              <tfoot>
                <tr className="yearly-total-row">
                  <td>
                    <strong>Gesamt</strong>
                  </td>
                  <td>
                    <strong>{formatMinutesAsWorkDays(report.totalWorkMinutes, dailyTargetMinutes)}</strong>
                  </td>
                  <td>
                    <strong>
                      {formatMinutesAsWorkDays(
                        report.targetMinutes,
                        dailyTargetMinutes,
                      )}
                    </strong>
                  </td>
                  <td className="report-value-positive">
                    <strong>{formatMinutesAsWorkDays(report.overtimeMinutes, dailyTargetMinutes)}</strong>
                  </td>
                  <td className="report-value-negative">
                    <strong>{formatMinutesAsWorkDays(report.deficitMinutes, dailyTargetMinutes)}</strong>
                  </td>
                  <td>
                    <strong>{formatMinutesAsWorkDays(report.sickMinutes, dailyTargetMinutes)}</strong>
                  </td>
                  <td>
                    <strong>{yearlyVacationDays}</strong>
                  </td>
                  <td>
                    <strong>{formatMinutesAsWorkDays(report.officeMinutes, dailyTargetMinutes)}</strong>
                  </td>
                  <td>
                    <strong>{formatMinutesAsWorkDays(report.homeofficeMinutes, dailyTargetMinutes)}</strong>
                  </td>
                  <td>
                    <strong>{formatMinutesAsWorkDays(report.businessTripMinutes, dailyTargetMinutes)}</strong>
                  </td>
                  <td
                    className={
                      totalBalance > 0
                        ? "report-value-positive"
                        : totalBalance < 0
                          ? "report-value-negative"
                          : ""
                    }
                  >
                    <strong>
                      {formatBalance(totalBalance, dailyTargetMinutes)}
                    </strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
