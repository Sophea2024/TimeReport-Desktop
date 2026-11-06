import { useEffect, useState } from "react";
import "./DailyReport.css";

import { reportService } from "../../Services/reports/ReportService";
import { DailyReport as DailyReportType } from "../../types/DailyReport";
import { useAuth } from "../../context/AuthContext";

function DailyReport() {
  const { user } = useAuth();

  const [dailyReport, setDailyReport] = useState<DailyReportType | null>(null);

  const [selectedDate, setSelectedDate] = useState(
    getLocalDateString(new Date()),
  );

  function getLocalDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  useEffect(() => {
    if (user) {
      loadDailyReport();
    }
  }, [user, selectedDate]);

  async function loadDailyReport() {
    if (!user) return;

    try {
      const daily = await reportService.getDailyReport(selectedDate, user.id);

      setDailyReport(daily);
    } catch (error) {
      console.error("Fehler beim Laden des Tagesberichts:", error);
      setDailyReport(null);
    }
  }

  async function handleCreatePdf() {
    if (!dailyReport || !user) {
      return;
    }

    const escapeHtml = (value: string) =>
      value.replace(/[&<>"']/g, (character) => {
        const entities: Record<string, string> = {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        };

        return entities[character];
      });

    const employeeName = escapeHtml(user.displayName ?? "");
    const reportDate = escapeHtml(dailyReport.date);

    const html = `
    <!DOCTYPE html>
    <html lang="de">
      <head>
        <meta charset="UTF-8" />
        <title>Tagesbericht ${reportDate}</title>
        <style>
          * { box-sizing: border-box; }
          @page { size: A4; margin: 18mm; }
          body {
            margin: 0;
            font-family: Arial, Helvetica, sans-serif;
            color: #111827;
            background: #fff;
          }
          h1 { margin: 0; font-size: 26px; }
          .header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 28px;
          }
          .subtitle {
            margin-top: 6px;
            color: #6b7280;
            font-size: 13px;
          }
          .employee {
            margin-bottom: 24px;
            padding: 14px 16px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            background: #f8fafc;
          }
          .stats {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
          }
          .stat {
            padding: 14px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            break-inside: avoid;
          }
          .label {
            color: #6b7280;
            font-size: 12px;
            margin-bottom: 6px;
          }
          .value { font-size: 17px; font-weight: 700; }
          .footer {
            margin-top: 35px;
            color: #6b7280;
            font-size: 10px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>Tagesbericht</h1>
            <div class="subtitle">Arbeitszeit und Auswertung für einen Tag</div>
          </div>
          <strong>${reportDate}</strong>
        </div>

        <div class="employee">
          <strong>Mitarbeiter:</strong> ${employeeName}
        </div>

        <div class="stats">
          <div class="stat">
            <div class="label">Arbeitszeit</div>
            <div class="value">${reportService.formatMinutes(dailyReport.totalWorkMinutes)}</div>
          </div>
          <div class="stat">
            <div class="label">Pause</div>
            <div class="value">${reportService.formatMinutes(dailyReport.totalPauseMinutes)}</div>
          </div>
          <div class="stat">
            <div class="label">Sollzeit</div>
            <div class="value">${reportService.formatMinutes(dailyReport.targetMinutes)}</div>
          </div>
          <div class="stat">
            <div class="label">Überstunden</div>
            <div class="value">${reportService.formatMinutes(dailyReport.overtimeMinutes)}</div>
          </div>
          <div class="stat">
            <div class="label">Fehlzeit</div>
            <div class="value">${reportService.formatMinutes(dailyReport.deficitMinutes)}</div>
          </div>
          <div class="stat">
            <div class="label">Büro</div>
            <div class="value">${reportService.formatMinutes(dailyReport.officeMinutes)}</div>
          </div>
          <div class="stat">
            <div class="label">Homeoffice</div>
            <div class="value">${reportService.formatMinutes(dailyReport.homeofficeMinutes)}</div>
          </div>
          <div class="stat">
            <div class="label">Dienstreise</div>
            <div class="value">${reportService.formatMinutes(dailyReport.businessTripMinutes)}</div>
          </div>
          <div class="stat">
            <div class="label">Krankheit</div>
            <div class="value">${reportService.formatMinutes(dailyReport.sickMinutes)}</div>
          </div>
          <div class="stat">
            <div class="label">Urlaub</div>
            <div class="value">${dailyReport.isApprovedVacation ? "Ja" : "Nein"}</div>
          </div>
        </div>

        <div class="footer">
          Erstellt mit TimeReport · ${new Date().toLocaleString("de-DE")}
        </div>
      </body>
    </html>
  `;

    try {
      const result = await window.ipcRenderer.invoke(
        "create-report-pdf",
        html,
        `Tagesbericht-${dailyReport.date}.pdf`,
      );

      if (!result?.success) {
        alert(
          result?.message ?? "Der PDF-Bericht konnte nicht erstellt werden.",
        );
      }
    } catch (error) {
      console.error("Fehler beim Erstellen des PDF-Berichts:", error);
      alert("Beim Erstellen des PDF-Berichts ist ein Fehler aufgetreten.");
    }
  }

  return (
    <div className="daily-report-page">
      <div className="daily-report-header">
        <div>
          <h1>Tagesbericht</h1>
          <p>Arbeitszeit und Auswertung für einen Tag</p>
        </div>

        <button
          type="button"
          className="daily-pdf-button"
          onClick={handleCreatePdf}
          disabled={!dailyReport}
          title="Tagesbericht als PDF speichern"
        >
          📄 PDF
        </button>
      </div>

      <section className="daily-report-selector">
        <div className="daily-section-title">
          <div>
            <h2>Datum auswählen</h2>
            <p>Wähle den gewünschten Tag für deine Auswertung.</p>
          </div>
        </div>

        <div className="daily-filter-grid">
          <label className="daily-filter-field">
            <span>Datum</span>

            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="daily-report-card">
        <div className="daily-report-card-header">
          <div>
            <h2>Tagesbericht</h2>
            <p>{dailyReport?.date ?? "Lade Bericht..."}</p>
          </div>

          <div className="daily-report-icon">📅</div>
        </div>

        {!dailyReport && (
          <div className="daily-loading-state">Bericht wird geladen...</div>
        )}

        {dailyReport && (
          <div className="daily-report-stats">
            <div className="daily-stat-card daily-stat-work">
              <span>Arbeitszeit</span>
              <strong>
                {reportService.formatMinutes(dailyReport.totalWorkMinutes)}
              </strong>
            </div>

            <div className="daily-stat-card">
              <span>Pause</span>
              <strong>
                {reportService.formatMinutes(dailyReport.totalPauseMinutes)}
              </strong>
            </div>

            <div className="daily-stat-card daily-stat-target">
              <span>Sollzeit</span>
              <strong>
                {reportService.formatMinutes(dailyReport.targetMinutes)}
              </strong>
            </div>

            <div className="daily-stat-card daily-stat-sick">
              <span>Krank</span>
              <strong>
                {reportService.formatMinutes(dailyReport.sickMinutes)}
              </strong>
            </div>

            <div className="daily-stat-card daily-stat-overtime">
              <span>Überstunden</span>
              <strong>
                {reportService.formatMinutes(dailyReport.overtimeMinutes)}
              </strong>
            </div>

            <div className="daily-stat-card daily-stat-deficit">
              <span>Fehlzeit</span>
              <strong>
                {reportService.formatMinutes(dailyReport.deficitMinutes)}
              </strong>
            </div>

            <div className="daily-stat-card">
              <span>🏢 Vor Ort</span>
              <strong>
                {reportService.formatMinutes(dailyReport.officeMinutes)}
              </strong>
            </div>

            <div className="daily-stat-card">
              <span>🏠 Homeoffice</span>
              <strong>
                {reportService.formatMinutes(dailyReport.homeofficeMinutes)}
              </strong>
            </div>
            <div className="daily-stat-card daily-stat-business-trip">
              <span>🚗 Dienstreise</span>
              <strong>
                {reportService.formatMinutes(dailyReport.businessTripMinutes)}
              </strong>
            </div>
            <div className="daily-stat-card">
              <span>🌴 Urlaub</span>
              <strong>
                {dailyReport.isApprovedVacation ? "Ja · 1 Tag" : "Nein"}
              </strong>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default DailyReport;
