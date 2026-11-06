import { useEffect, useState } from "react";
import "./WeeklyReport.css";

import { reportService } from "../../Services/reports/ReportService";
import { WeeklyReport as WeeklyReportType } from "../../types/WeeklyReport";
import { useAuth } from "../../context/AuthContext";

function WeeklyReport() {
  const { user } = useAuth();

  const currentDate = new Date();

  const [weeklyReport, setWeeklyReport] = useState<WeeklyReportType | null>(
    null,
  );

  const [selectedWeek, setSelectedWeek] = useState(
    reportService.getWeekNumber(currentDate),
  );

  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());

  useEffect(() => {
    if (user) {
      loadWeeklyReport();
    }
  }, [user, selectedWeek, selectedYear]);

  async function loadWeeklyReport() {
    if (!user) return;

    try {
      const weekly = await reportService.getWeeklyReport(
        selectedWeek,
        selectedYear,
        user.id,
      );

      setWeeklyReport(weekly);
    } catch (error) {
      console.error("Fehler beim Laden des Wochenberichts:", error);
      setWeeklyReport(null);
    }
  }

  async function handleCreatePdf() {
    if (!weeklyReport || !user) {
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
      weeklyReport.overtimeMinutes - weeklyReport.deficitMinutes;

    const dailyTargetMinutes =
      weeklyReport.days.find((day) => day.targetMinutes > 0)?.targetMinutes ??
      456;

    const formatWorkDays = (minutes: number) =>
      `${reportService.formatMinutesAsWorkDays(
        Math.abs(minutes),
        dailyTargetMinutes,
      )} Arbeitstage`;

    const getDailyLocation = (day: (typeof weeklyReport.days)[number]) => {
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

      if (day.status === "sick") {
        return "Krank";
      }

      if (day.status === "vacation") {
        return "Urlaub";
      }

      if (day.isHoliday) {
        return day.holidayName ?? "Feiertag";
      }

      return locations.length > 0 ? locations.join(" / ") : "—";
    };

    const getDailyBalance = (
      day: (typeof weeklyReport.days)[number],
    ): string => {
      if (day.overtimeMinutes > 0) {
        return `+${reportService.formatMinutes(day.overtimeMinutes)}`;
      }

      if (day.deficitMinutes > 0) {
        return `-${reportService.formatMinutes(day.deficitMinutes)}`;
      }

      return "0h 00min";
    };

    const dailyRows = weeklyReport.days
      .map((day) => {
        const dayDate = new Date(`${day.date}T12:00:00`);

        const formattedDate = dayDate.toLocaleDateString("de-DE", {
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });

        return `
        <tr>
          <td>${escapeHtml(formattedDate)}</td>
          <td>${escapeHtml(getDailyLocation(day))}</td>
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
            ${escapeHtml(getDailyBalance(day))}
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
          Wochenbericht KW ${weeklyReport.week} - ${weeklyReport.year}
        </title>

        <style>
          * {
            box-sizing: border-box;
          }

          @page {
            size: A4;
            margin: 15mm;
          }

          body {
            margin: 0;
            font-family: Arial, Helvetica, sans-serif;
            color: #111827;
            background: #ffffff;
            font-size: 12px;
          }

          h1 {
            margin: 0;
            font-size: 26px;
          }

          h2 {
            margin: 0 0 6px;
            font-size: 18px;
          }

          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 24px;
          }

          .subtitle {
            margin-top: 6px;
            color: #6b7280;
            font-size: 13px;
          }

          .employee {
            margin-bottom: 20px;
            padding: 12px 14px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            background: #f8fafc;
            font-size: 13px;
          }

          .summary-title {
            margin-bottom: 10px;
          }

          .summary {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            margin-bottom: 22px;
          }

          .summary-card {
            padding: 12px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            background: #ffffff;
          }

          .label {
            margin-bottom: 5px;
            color: #6b7280;
            font-size: 11px;
          }

          .value {
            font-size: 16px;
            font-weight: 700;
          }

          .work-locations {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            margin-bottom: 22px;
          }

          .location-card {
            padding: 11px 12px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
          }

          .table-title {
            margin-bottom: 8px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
          }

          th,
          td {
            padding: 7px 8px;
            border-bottom: 1px solid #e5e7eb;
            text-align: left;
            vertical-align: middle;
            font-size: 10px;
          }

          th {
            background: #f8fafc;
            color: #475569;
            font-size: 9px;
            font-weight: 700;
            text-transform: uppercase;
          }

          td.number,
          th.number {
            text-align: right;
            white-space: nowrap;
          }

          .footer {
            margin-top: 25px;
            color: #6b7280;
            font-size: 9px;
          }
        </style>
      </head>

      <body>
        <div class="header">
          <div>
            <h1>Wochenbericht</h1>
            <div class="subtitle">
              KW ${weeklyReport.week} ·
              ${escapeHtml(
                reportService.formatWeekRange(
                  weeklyReport.week,
                  weeklyReport.year,
                ),
              )}
            </div>
          </div>

          <div>
            <strong>${weeklyReport.year}</strong>
          </div>
        </div>

        <div class="employee">
          <strong>Mitarbeiter:</strong>
          ${escapeHtml(user.displayName)}
        </div>

        <h2 class="summary-title">Wochenübersicht</h2>

        <div class="summary">
          <div class="summary-card">
            <div class="label">Sollzeit</div>
            <div class="value">
              ${reportService.formatMinutes(weeklyReport.targetMinutes)}
            </div>
            <div class="label">
              ${formatWorkDays(weeklyReport.targetMinutes)}
            </div>
          </div>

          <div class="summary-card">
            <div class="label">Istzeit</div>
            <div class="value">
              ${reportService.formatMinutes(weeklyReport.totalWorkMinutes)}
            </div>
            <div class="label">
              ${formatWorkDays(weeklyReport.totalWorkMinutes)}
            </div>
          </div>

          <div class="summary-card">
            <div class="label">Saldo</div>
            <div class="value">
              ${
                totalBalance > 0
                  ? `+${reportService.formatMinutes(totalBalance)}`
                  : reportService.formatMinutes(totalBalance)
              }
            </div>
            <div class="label">
              ${formatWorkDays(totalBalance)}
            </div>
          </div>

          <div class="summary-card">
            <div class="label">Überstunden</div>
            <div class="value">
              ${reportService.formatMinutes(weeklyReport.overtimeMinutes)}
            </div>
            <div class="label">
              ${formatWorkDays(weeklyReport.overtimeMinutes)}
            </div>
          </div>

          <div class="summary-card">
            <div class="label">Fehlzeit</div>
            <div class="value">
              ${reportService.formatMinutes(weeklyReport.deficitMinutes)}
            </div>
            <div class="label">
              ${formatWorkDays(weeklyReport.deficitMinutes)}
            </div>
          </div>

          <div class="summary-card">
            <div class="label">Krank</div>
            <div class="value">
              ${reportService.formatMinutes(weeklyReport.sickMinutes)}
            </div>
            <div class="label">
              ${formatWorkDays(weeklyReport.sickMinutes)}
            </div>
          </div>

          <div class="summary-card">
            <div class="label">Urlaub</div>
            <div class="value">
              ${weeklyReport.days.filter((day) => day.isApprovedVacation).length}
              ${
                weeklyReport.days.filter((day) => day.isApprovedVacation)
                  .length === 1
                  ? "Tag"
                  : "Tage"
              }
            </div>
          </div>

          <div class="summary-card">
            <div class="label">Arbeitszeit gesamt</div>
            <div class="value">
              ${reportService.formatMinutes(weeklyReport.totalWorkMinutes)}
            </div>
          </div>

          <div class="summary-card">
            <div class="label">Pause gesamt</div>
            <div class="value">
              ${reportService.formatMinutes(weeklyReport.totalPauseMinutes)}
            </div>
          </div>
        </div>

        <h2 class="table-title">Arbeitsorte</h2>

        <div class="work-locations">
          <div class="location-card">
            <div class="label">🏢 Vor Ort</div>
            <strong>
              ${weeklyReport.officeDays}
              ${weeklyReport.officeDays === 1 ? "Tag" : "Tage"}
            </strong>
            <br />
            ${reportService.formatMinutes(weeklyReport.officeMinutes)}
          </div>

          <div class="location-card">
            <div class="label">🏠 Homeoffice</div>
            <strong>
              ${weeklyReport.homeofficeDays}
              ${weeklyReport.homeofficeDays === 1 ? "Tag" : "Tage"}
            </strong>
            <br />
            ${reportService.formatMinutes(weeklyReport.homeofficeMinutes)}
          </div>

          <div class="location-card">
            <div class="label">🚗 Dienstreise</div>
            <strong>
              ${weeklyReport.businessTripDays}
              ${weeklyReport.businessTripDays === 1 ? "Tag" : "Tage"}
            </strong>
            <br />
            ${reportService.formatMinutes(weeklyReport.businessTripMinutes)}
          </div>
        </div>

        <h2 class="table-title">Tagesübersicht</h2>

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
        `Wochenbericht-KW-${weeklyReport.week}-${weeklyReport.year}.pdf`,
      );

      if (!result?.success) {
        alert(
          result?.message ??
            "Der Wochenbericht konnte nicht als PDF erstellt werden.",
        );
      }
    } catch (error) {
      console.error("Fehler beim Erstellen des Wochenberichts:", error);

      alert("Der Wochenbericht konnte nicht als PDF erstellt werden.");
    }
  }

  return (
    <div className="weekly-report-page">
      <div className="weekly-report-header">
        <div>
          <h1>Wochenbericht</h1>
          <p>Arbeitszeit und Auswertung für eine Kalenderwoche</p>
        </div>

        <button
          type="button"
          className="weekly-pdf-button"
          onClick={handleCreatePdf}
          disabled={!weeklyReport}
          title="Wochenbericht als PDF speichern"
        >
          📄 PDF
        </button>
      </div>

      <section className="weekly-report-selector">
        <div className="weekly-section-title">
          <div>
            <h2>Kalenderwoche auswählen</h2>
            <p>Wähle die gewünschte Kalenderwoche für deine Auswertung.</p>
          </div>
        </div>

        <div className="weekly-filter-grid">
          <label className="weekly-filter-field">
            <span>Kalenderwoche</span>

            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(Number(e.target.value))}
            >
              {Array.from({ length: 53 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  KW {i + 1}
                </option>
              ))}
            </select>
          </label>

          <label className="weekly-filter-field">
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

      <section className="weekly-report-card">
        <div className="weekly-report-card-header">
          <div>
            <h2>Wochenbericht</h2>

            {weeklyReport ? (
              <p>
                KW {weeklyReport.week} ·{" "}
                {reportService.formatWeekRange(
                  weeklyReport.week,
                  weeklyReport.year,
                )}
              </p>
            ) : (
              <p>Lade Bericht...</p>
            )}
          </div>

          <div className="weekly-report-icon">📊</div>
        </div>

        {!weeklyReport && (
          <div className="weekly-loading-state">Bericht wird geladen...</div>
        )}

        {weeklyReport && (
          <div className="weekly-report-stats">
            <div className="weekly-stat-card weekly-stat-work">
              <span>Arbeitszeit</span>

              <strong>
                {reportService.formatMinutes(weeklyReport.totalWorkMinutes)}
              </strong>

              <small>
                {reportService.formatMinutesAsWorkDays(
                  weeklyReport.totalWorkMinutes,
                  weeklyReport.days.find((day) => day.targetMinutes > 0)
                    ?.targetMinutes ?? 0,
                )}
              </small>
            </div>

            <div className="weekly-stat-card weekly-stat-target">
              <span>Sollzeit</span>

              <strong>
                {reportService.formatMinutes(weeklyReport.targetMinutes)}
              </strong>

              <small>
                {
                  weeklyReport.days.filter((day) => day.targetMinutes > 0)
                    .length
                }{" "}
                Arbeitstage
              </small>
            </div>

            <div className="weekly-stat-card weekly-stat-sick">
              <span>Krank</span>
              <strong>
                {reportService.formatMinutes(weeklyReport.sickMinutes)}
              </strong>
              <small>
                {reportService.formatMinutesAsWorkDays(
                  weeklyReport.sickMinutes,
                  weeklyReport.days.find((day) => day.targetMinutes > 0)
                    ?.targetMinutes ?? 0,
                )}
              </small>
            </div>

            <div className="weekly-stat-card weekly-stat-overtime">
              <span>Überstunden</span>
              <strong>
                +{reportService.formatMinutes(weeklyReport.overtimeMinutes)}
              </strong>
              <small>
                {reportService.formatMinutesAsWorkDays(
                  weeklyReport.overtimeMinutes,
                  weeklyReport.days.find((day) => day.targetMinutes > 0)
                    ?.targetMinutes ?? 0,
                )}
              </small>
            </div>

            <div className="weekly-stat-card weekly-stat-deficit">
              <span>Fehlzeit</span>
              <strong>
                {reportService.formatMinutes(weeklyReport.deficitMinutes)}
              </strong>
              <small>
                {reportService.formatMinutesAsWorkDays(
                  weeklyReport.deficitMinutes,
                  weeklyReport.days.find((day) => day.targetMinutes > 0)
                    ?.targetMinutes ?? 0,
                )}
              </small>
            </div>

            <div className="weekly-stat-card">
              <span>🏢 Vor Ort</span>
              <strong>
                {weeklyReport.officeDays}{" "}
                {weeklyReport.officeDays === 1 ? "Tag" : "Tage"}
              </strong>
              <small>
                {reportService.formatMinutes(weeklyReport.officeMinutes)}
              </small>
            </div>

            <div className="weekly-stat-card">
              <span>🏠 Homeoffice</span>
              <strong>
                {weeklyReport.homeofficeDays}{" "}
                {weeklyReport.homeofficeDays === 1 ? "Tag" : "Tage"}
              </strong>
              <small>
                {reportService.formatMinutes(weeklyReport.homeofficeMinutes)}
              </small>
            </div>

            <div className="weekly-stat-card weekly-stat-business-trip">
              <span>🚗 Dienstreise</span>
              <strong>
                {weeklyReport.businessTripDays}{" "}
                {weeklyReport.businessTripDays === 1 ? "Tag" : "Tage"}
              </strong>
              <small>
                {reportService.formatMinutes(weeklyReport.businessTripMinutes)}
              </small>
            </div>

            <div className="weekly-stat-card">
              <span>🌴 Urlaub</span>
              <strong>
                {
                  weeklyReport.days.filter((day) => day.isApprovedVacation)
                    .length
                }{" "}
                {weeklyReport.days.filter((day) => day.isApprovedVacation)
                  .length === 1
                  ? "Tag"
                  : "Tage"}
              </strong>
              <small>Genehmigter Urlaub</small>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default WeeklyReport;
