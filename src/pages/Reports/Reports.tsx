import { useEffect, useState } from "react";
import "./Reports.css";

import { reportService } from "../../Services/reports/ReportService";
import { DailyReport } from "../../types/DailyReport";
import { WeeklyReport } from "../../types/WeeklyReport";
import { MonthlyReport } from "../../types/MonthlyReport";
import { useAuth } from "../../context/AuthContext";

function Reports() {
  const { user } = useAuth();

  const [dailyReport, setDailyReport] = useState<DailyReport | null>(null);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [monthlyReport, setMonthlyReport] = useState<MonthlyReport | null>(
    null,
  );

  const [selectedDate, setSelectedDate] = useState(
    getLocalDateString(new Date()),
  );

  const currentDate = new Date();

  const [selectedWeek, setSelectedWeek] = useState(
    reportService.getWeekNumber(currentDate),
  );

  const [selectedMonth, setSelectedMonth] = useState(
    currentDate.getMonth() + 1,
  );

  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());

  function getLocalDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  useEffect(() => {
    if (user) {
      loadReports();
    }
  }, [user, selectedDate, selectedWeek, selectedMonth, selectedYear]);

  async function loadReports() {
    if (!user) return;

    try {
      const daily = await reportService.getDailyReport(selectedDate, user.id);

      const weekly = await reportService.getWeeklyReport(
        selectedWeek,
        selectedYear,
        user.id,
      );

      const monthly = await reportService.getMonthlyReport(
        selectedMonth,
        selectedYear,
        user.id,
      );

      setDailyReport(daily);
      setWeeklyReport(weekly);
      setMonthlyReport(monthly);
    } catch (error) {
      console.error("Fehler beim Laden der Berichte:", error);

      setDailyReport(null);
      setWeeklyReport(null);
      setMonthlyReport(null);
    }
  }

  return (
    <div className="reports-page">
      <div className="reports-header">
        <div>
          <h1>Berichte</h1>
          <p>Arbeitszeiten und Auswertungen</p>
        </div>
      </div>

      {/* ==========================================
          BERICHT AUSWÄHLEN
      ========================================== */}

      <section className="report-selector">
        <div className="section-title">
          <div>
            <h2>Bericht auswählen</h2>
            <p>Wähle den gewünschten Zeitraum für deine Auswertung.</p>
          </div>
        </div>

        <div className="filter-grid">
          <label className="filter-field">
            <span>Datum</span>

            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </label>

          <label className="filter-field">
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

          <label className="filter-field">
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

          <label className="filter-field">
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

      {/* ==========================================
          TAGES- UND WOCHENBERICHT
      ========================================== */}

      <div className="report-columns">
        {/* ========================================
            TAGESBERICHT
        ======================================== */}

        <section id="daily-report" className="report-card">
          <div className="report-card-header">
            <div>
              <h2>Tagesbericht</h2>
              <p>{dailyReport?.date ?? "Lade Bericht..."}</p>
            </div>

            <div className="report-icon">📅</div>
          </div>

          {!dailyReport && (
            <div className="loading-state">Bericht wird geladen...</div>
          )}

          {dailyReport && (
            <div className="report-stats">
              <div className="stat-card stat-work">
                <span>Arbeitszeit</span>
                <strong>
                  {reportService.formatMinutes(dailyReport.totalWorkMinutes)}
                </strong>
              </div>

              <div className="stat-card">
                <span>Pause</span>
                <strong>
                  {reportService.formatMinutes(dailyReport.totalPauseMinutes)}
                </strong>
              </div>

              <div className="stat-card stat-target">
                <span>Sollzeit</span>
                <strong>
                  {reportService.formatMinutes(dailyReport.targetMinutes)}
                </strong>
              </div>

              <div className="stat-card sick-value">
                <span>Krank</span>
                <strong>
                  {reportService.formatMinutes(dailyReport.sickMinutes)}
                </strong>
              </div>

              <div className="stat-card stat-overtime">
                <span>Überstunden</span>
                <strong>
                  {reportService.formatMinutes(dailyReport.overtimeMinutes)}
                </strong>
              </div>

              <div className="stat-card stat-deficit">
                <span>Fehlzeit</span>
                <strong>
                  {reportService.formatMinutes(dailyReport.deficitMinutes)}
                </strong>
              </div>

              <div className="stat-card">
                <span>🏢 Vor Ort</span>
                <strong>
                  {reportService.formatMinutes(dailyReport.officeMinutes)}
                </strong>
              </div>

              <div className="stat-card">
                <span>🏠 Homeoffice</span>
                <strong>
                  {reportService.formatMinutes(dailyReport.homeofficeMinutes)}
                </strong>
              </div>
            </div>
          )}
        </section>

        {/* ========================================
            WOCHENBERICHT
        ======================================== */}

        <section id="weekly-report" className="report-card">
          <div className="report-card-header">
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

            <div className="report-icon">📊</div>
          </div>

          {!weeklyReport && (
            <div className="loading-state">Bericht wird geladen...</div>
          )}

          {weeklyReport && (
            <div className="report-stats">
              <div className="stat-card stat-work">
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

              <div className="stat-card stat-target">
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

              <div className="stat-card sick-value">
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

              <div className="stat-card stat-overtime">
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

              <div className="stat-card stat-deficit">
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

              <div className="stat-card">
                <span>🏢 Vor Ort</span>
                <strong>
                  {weeklyReport.officeDays}{" "}
                  {weeklyReport.officeDays === 1 ? "Tag" : "Tage"}
                </strong>

                <small>
                  {reportService.formatMinutes(weeklyReport.officeMinutes)}
                </small>
              </div>

              <div className="stat-card">
                <span>🏠 Homeoffice</span>
                <strong>
                  {weeklyReport.homeofficeDays}{" "}
                  {weeklyReport.homeofficeDays === 1 ? "Tag" : "Tage"}
                </strong>

                <small>
                  {reportService.formatMinutes(weeklyReport.homeofficeMinutes)}
                </small>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ==========================================
          MONATSBERICHT
      ========================================== */}

      <section id="monthly-report" className="report-card monthly-card">
        <div className="report-card-header">
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

          <div className="report-icon">📈</div>
        </div>

        {!monthlyReport && (
          <div className="loading-state">Bericht wird geladen...</div>
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

            return (
              <>
                {/* ====================================
                MONATS-STATISTIK
            ==================================== */}

                <div className="report-stats monthly-stats">
                  <div className="stat-card stat-work">
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

                  <div className="stat-card stat-target">
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

                  <div className="stat-card sick-value">
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

                  <div className="stat-card stat-overtime">
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

                  <div className="stat-card stat-deficit">
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

                  <div className="stat-card">
                    <span>🏢 Vor Ort</span>
                    <strong>
                      {monthlyReport.officeDays}{" "}
                      {monthlyReport.officeDays === 1 ? "Tag" : "Tage"}
                    </strong>

                    <small>
                      {reportService.formatMinutes(monthlyReport.officeMinutes)}
                    </small>
                  </div>

                  <div className="stat-card">
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
                </div>

                {/* ====================================
                TAGESÜBERSICHT
            ==================================== */}

                <div className="daily-overview">
                  <div className="overview-header">
                    <div>
                      <h3>Tagesübersicht</h3>
                      <p>Arbeitszeiten im ausgewählten Monat</p>
                    </div>
                  </div>

                  <div className="table-wrapper">
                    <table className="report-table">
                      <thead>
                        <tr>
                          <th>Datum</th>
                          <th className="center">Ort</th>
                          <th className="right">Krank</th>
                          <th className="right">Soll</th>
                          <th className="right">Ist</th>
                          <th className="right">Pause</th>
                          <th className="right">Saldo</th>
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

                          const ort =
                            day.status === "sick"
                              ? "Krank"
                              : day.status === "vacation"
                                ? "Urlaub"
                                : day.isHoliday
                                  ? (day.holidayName ?? "Feiertag")
                                  : day.officeMinutes > 0 &&
                                      day.homeofficeMinutes > 0
                                    ? "Büro / Homeoffice"
                                    : day.officeMinutes > 0
                                      ? "Büro"
                                      : day.homeofficeMinutes > 0
                                        ? "Homeoffice"
                                        : "—";

                          return (
                            <tr
                              key={day.date}
                              className={
                                day.status === "sick"
                                  ? "sick-row"
                                  : day.status === "vacation"
                                    ? "vacation-row"
                                    : isHoliday
                                      ? "holiday-row"
                                      : isWeekend
                                        ? "weekend-row"
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
                                className={`center ${
                                  day.sickMinutes > 0 ? "sick-value" : ""
                                }`}
                              >
                                {ort}
                              </td>

                              <td
                                className={`right ${
                                  day.sickMinutes > 0 ? "sick-value" : ""
                                }`}
                              >
                                {day.sickMinutes > 0
                                  ? reportService.formatMinutes(day.sickMinutes)
                                  : "—"}
                              </td>

                              <td className="right">
                                {isWeekend
                                  ? "0h 00min"
                                  : isHoliday
                                    ? "Feiertag"
                                    : reportService.formatMinutes(
                                        day.targetMinutes,
                                      )}
                              </td>

                              <td className="right">
                                {reportService.formatMinutes(
                                  day.totalWorkMinutes,
                                )}
                              </td>

                              <td className="right">
                                {reportService.formatMinutes(
                                  day.totalPauseMinutes,
                                )}
                              </td>

                              <td
                                className={`right ${
                                  day.overtimeMinutes > 0
                                    ? "saldo-positive"
                                    : day.deficitMinutes > 0
                                      ? "saldo-negative"
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

export default Reports;
