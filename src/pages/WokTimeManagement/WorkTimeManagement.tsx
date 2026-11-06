import React from "react";
import { useEffect, useMemo, useState } from "react";
import "./WorkTimeManagement.css";
import { Vacation } from "../../types/Vacation";

import { timeTrackingService } from "../../Services/timetracking/TimeTrackingService";
import { useAuth } from "../../context/AuthContext";
import {
  WorkSession,
  WorkPause,
  WorkInterval,
  WorkSessionStatus,
} from "../../types/WorkSession";

import {
  readExcelWorkTimeFile,
  ExcelImportResult,
} from "../../utils/excelWorkTimeImport";

type FilterStatus = "all" | "completed" | "auto_closed" | "needs_correction";

function WorkTimeManagement() {
  const { user } = useAuth();

  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [vacations, setVacations] = useState<Vacation[]>([]);

  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");

  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");

  const [fromDate, setFromDate] = useState("");

  const [toDate, setToDate] = useState("");

  const [editingSession, setEditingSession] = useState<WorkSession | null>(
    null,
  );

  const [error, setError] = useState("");

  const [showExcelImport, setShowExcelImport] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelPreview, setExcelPreview] = useState<ExcelImportResult | null>(
    null,
  );
  const [excelImportError, setExcelImportError] = useState("");
  const [excelLoading, setExcelLoading] = useState(false);
  const [excelDuplicateMode, setExcelDuplicateMode] = useState<
    "skip" | "replace"
  >("skip");

  useEffect(() => {
    loadSessions();
  }, [user]);

  async function loadSessions() {
    if (!user) {
      setSessions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await timeTrackingService.getWorkSessions(user.id);

      const vacationResult = await window.database.getVacations(user.id);

      setSessions(result);
      setVacations(vacationResult);
    } catch (error) {
      console.error(error);

      setError("Die Arbeitszeiten konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  function hasApprovedVacation(date: string): boolean {
    return vacations.some(
      (vacation) =>
        vacation.status === "approved" &&
        date >= vacation.startDate &&
        date <= vacation.endDate,
    );
  }

  const filteredSessions = useMemo(() => {
    return sessions
      .filter((session) => {
        if (!fromDate) return true;

        return session.date >= fromDate;
      })
      .filter((session) => {
        if (!toDate) return true;

        return session.date <= toDate;
      })
      .filter((session) => {
        if (statusFilter === "all") {
          return true;
        }

        return session.status === statusFilter;
      })
      .filter((session) => {
        if (!search.trim()) return true;

        const text = `${session.date} ${session.workLocation}`.toLowerCase();

        return text.includes(search.toLowerCase());
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [sessions, fromDate, toDate, statusFilter, search]);

  const totalMinutes = useMemo(() => {
    return filteredSessions.reduce(
      (sum, session) => sum + (session.totalWorkMinutes || 0),
      0,
    );
  }, [filteredSessions]);

  const totalPauseMinutes = useMemo(() => {
    return filteredSessions.reduce(
      (sum, session) => sum + (session.totalPauseMinutes || 0),
      0,
    );
  }, [filteredSessions]);

  const maxWorkIntervals = useMemo(() => {
    return Math.max(
      1,
      ...filteredSessions.map((session) => session.workIntervals?.length ?? 0),
    );
  }, [filteredSessions]);

  const excelDuplicateDates = useMemo(() => {
    if (!excelPreview) {
      return new Set<string>();
    }

    return new Set(
      excelPreview.rows
        .filter((row) => sessions.some((session) => session.date === row.date))
        .map((row) => row.date),
    );
  }, [excelPreview, sessions]);

  function formatTime(date?: Date) {
    if (!date) return "--:--";

    return date.toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatMinutes(minutes: number) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    return `${hours}:${mins.toString().padStart(2, "0")}`;
  }

  function getStatus(session: WorkSession) {
    switch (session.status) {
      case "auto_closed":
        return {
          text: "Automatisch beendet",
          className: "status-auto",
        };

      case "needs_correction":
        return {
          text: "Korrektur erforderlich",
          className: "status-warning",
        };

      default:
        return {
          text: "Erfasst",
          className: "status-success",
        };
    }
  }

  async function handleDelete(session: WorkSession) {
    const confirmed = window.confirm(
      `Möchtest du die Arbeitszeit vom ${session.date} wirklich löschen?`,
    );

    if (!confirmed) return;

    const success = await timeTrackingService.deleteWorkSession(session.id);

    if (!success) {
      alert("Die Arbeitszeit konnte nicht gelöscht werden.");

      return;
    }

    await loadSessions();
  }

  async function handleSave(session: WorkSession) {
    const success = await timeTrackingService.updateWorkSession(session);

    if (!success) {
      alert(
        "Die Arbeitszeit konnte nicht gespeichert werden. " +
          "Bitte überprüfe Arbeitsbeginn, Arbeitsende, Pausen und Intervalle.",
      );
      return;
    }

    setEditingSession(null);

    await loadSessions();
  }

  async function handleExcelFileChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];

    if (!file) return;

    setExcelFile(file);
    setExcelPreview(null);
    setExcelImportError("");

    await loadExcelPreview(file);
  }

  async function loadExcelPreview(file: File, sheetName?: string) {
    setExcelLoading(true);
    setExcelImportError("");

    try {
      const result = await readExcelWorkTimeFile(file, sheetName);

      setExcelPreview(result);
    } catch (error) {
      console.error("Excel-Importfehler:", error);

      setExcelPreview(null);

      setExcelImportError(
        error instanceof Error
          ? error.message
          : "Die Excel-Datei konnte nicht gelesen werden.",
      );
    } finally {
      setExcelLoading(false);
    }
  }

  async function handleSheetChange(sheetName: string) {
    if (!excelFile) return;

    await loadExcelPreview(excelFile, sheetName);
  }

  function closeExcelImport() {
    setShowExcelImport(false);
    setExcelFile(null);
    setExcelPreview(null);
    setExcelImportError("");
  }

  async function handleExcelImport() {
    if (!user || !excelPreview) return;

    setExcelLoading(true);
    setExcelImportError("");

    try {
      let importedCount = 0;
      let skippedCount = 0;

      for (const row of excelPreview.rows) {
        // Tage ohne gültiges Datum oder ohne Arbeitsintervalle überspringen.
        if (!row.date || row.intervals.length === 0) {
          skippedCount++;
          continue;
        }

        const existingSessions = sessions.filter(
          (session) => session.date === row.date,
        );

        const existingSession = existingSessions[0];

        if (existingSessions.length > 0 && excelDuplicateMode === "skip") {
          skippedCount++;
          continue;
        }

        const baseDate = new Date(`${row.date}T00:00:00`);

        const workIntervals: WorkInterval[] = [];

        for (const interval of row.intervals) {
          const [startHours, startMinutes] = interval.start
            .split(":")
            .map(Number);

          const [endHours, endMinutes] = interval.end.split(":").map(Number);

          const start = new Date(baseDate);
          start.setHours(startHours, startMinutes, 0, 0);

          const end = new Date(baseDate);
          end.setHours(endHours, endMinutes, 0, 0);

          if (end <= start) {
            end.setDate(end.getDate() + 1);
          }

          workIntervals.push({
            id: crypto.randomUUID(),
            start,
            end,
          });
        }

        // Arbeitsintervalle müssen chronologisch sein und dürfen
        // sich nicht überschneiden.
        for (let index = 1; index < workIntervals.length; index++) {
          const previous = workIntervals[index - 1];
          const current = workIntervals[index];

          if (
            !previous.end ||
            current.start.getTime() < previous.end.getTime()
          ) {
            throw new Error(
              `Ungültige oder überlappende Arbeitsintervalle am ${row.date}.`,
            );
          }
        }

        const pauses: WorkPause[] = [];

        for (let index = 0; index < workIntervals.length - 1; index++) {
          const previous = workIntervals[index];
          const next = workIntervals[index + 1];

          if (!previous.end) continue;

          if (next.start > previous.end) {
            pauses.push({
              id: crypto.randomUUID(),
              start: new Date(previous.end),
              end: new Date(next.start),
            });
          }
        }

        const totalWorkMinutes = workIntervals.reduce((total, interval) => {
          if (!interval.end) return total;

          return (
            total +
            Math.round(
              (interval.end.getTime() - interval.start.getTime()) / 60000,
            )
          );
        }, 0);

        const totalPauseMinutes = pauses.reduce((total, pause) => {
          if (!pause.end) return total;

          return (
            total +
            Math.round((pause.end.getTime() - pause.start.getTime()) / 60000)
          );
        }, 0);

        const firstInterval = workIntervals[0];
        const lastInterval = workIntervals[workIntervals.length - 1];

        const importedSession: WorkSession = {
          id: existingSession?.id ?? crypto.randomUUID(),
          userId: user.id,
          date: row.date,
          workLocation: "office",

          loginTime: firstInterval.start,
          logoutTime: lastInterval.end,

          workStart: firstInterval.start,
          workEnd: lastInterval.end,

          pauses,
          workIntervals,

          pauseStart: pauses[0]?.start,
          pauseEnd: pauses[pauses.length - 1]?.end,

          totalPauseMinutes,
          totalWorkMinutes,

          status: "completed",
        };

        // Beim Ersetzen alle vorhandenen Sessions dieses Tages entfernen.
        if (excelDuplicateMode === "replace") {
          for (const existing of existingSessions) {
            const deleted = await timeTrackingService.deleteWorkSession(
              existing.id,
            );

            if (!deleted) {
              throw new Error(
                `Eine vorhandene Arbeitszeit vom ${row.date} konnte nicht gelöscht werden.`,
              );
            }
          }
        }

        const success = await window.database.saveWorkSession(importedSession);

        if (success === false) {
          throw new Error(`Speichern fehlgeschlagen für ${row.date}.`);
        }

        importedCount++;
      }

      await loadSessions();

      alert(
        `Import abgeschlossen.\n` +
          `Importiert: ${importedCount}\n` +
          `Übersprungen: ${skippedCount}`,
      );

      closeExcelImport();
    } catch (error) {
      console.error("Excel-Importfehler:", error);

      setExcelImportError(
        error instanceof Error
          ? error.message
          : "Beim Import ist ein Fehler aufgetreten.",
      );
    } finally {
      setExcelLoading(false);
    }
  }

  if (!user) {
    return (
      <div className="work-management">
        <div className="empty-state">Kein Benutzer angemeldet.</div>
      </div>
    );
  }

  return (
    <div className="work-management">
      <div className="page-header">
        <div>
          <h1>Arbeitszeiten verwalten</h1>

          <p>Arbeitszeiten prüfen, korrigieren und verwalten.</p>
        </div>

        <div className="work-header-actions">
          <button
            className="excel-import-btn"
            onClick={() => setShowExcelImport(true)}
          >
            📥 Excel importieren
          </button>

          <button className="refresh-btn" onClick={loadSessions}>
            ↻ Aktualisieren
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="summary-grid">
        <div className="summary-card">
          <span>Einträge</span>

          <strong>{filteredSessions.length}</strong>
        </div>

        <div className="summary-card">
          <span>Arbeitszeit</span>

          <strong>{formatMinutes(totalMinutes)}</strong>
        </div>

        <div className="summary-card">
          <span>Pausen</span>

          <strong>{formatMinutes(totalPauseMinutes)}</strong>
        </div>
      </div>

      <div className="filter-card">
        <div className="filter-group">
          <label>Suche</label>

          <input
            type="text"
            placeholder="Datum oder Arbeitsort..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="filter-group">
          <label>Von</label>

          <input
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
          />
        </div>

        <div className="filter-group">
          <label>Bis</label>

          <input
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
          />
        </div>

        <div className="filter-group">
          <label>Status</label>

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as FilterStatus)
            }
          >
            <option value="all">Alle</option>

            <option value="completed">Erfasst</option>

            <option value="auto_closed">Automatisch beendet</option>

            <option value="needs_correction">Korrektur erforderlich</option>
          </select>
        </div>
      </div>

      <div className="table-card">
        {loading ? (
          <div className="loading">Arbeitszeiten werden geladen...</div>
        ) : filteredSessions.length === 0 ? (
          <div className="empty-state">Keine Arbeitszeiten gefunden.</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Datum</th>

                  {Array.from({ length: maxWorkIntervals }, (_, index) => (
                    <React.Fragment key={index}>
                      <th>Beginn {index + 1}</th>
                      <th>Ende {index + 1}</th>
                    </React.Fragment>
                  ))}

                  <th>Arbeitszeit</th>
                  <th>Pause</th>
                  <th>Status</th>
                  <th>Arbeitsort</th>
                  <th>Aktionen</th>
                </tr>
              </thead>

              <tbody>
                {filteredSessions.map((session) => {
                  console.log("DEBUG – gesamte Session:", session);
                  console.log("DEBUG – workIntervals:", session.workIntervals);
                  console.log(
                    "DEBUG – Anzahl Intervalle:",
                    session.workIntervals?.length ?? 0,
                  );

                  console.log(
                    "Arbeitsintervalle in der Tabelle:",
                    session.workIntervals,
                  );
                  const status = getStatus(session);

                  return (
                    <tr key={session.id}>
                      <td>
                        {new Date(session.date).toLocaleDateString("de-DE")}

                        {hasApprovedVacation(session.date) && (
                          <div className="vacation-indicator">
                            Urlaub genehmigt
                          </div>
                        )}
                      </td>

                      {Array.from({ length: maxWorkIntervals }, (_, index) => {
                        const interval = session.workIntervals?.[index];

                        return (
                          <React.Fragment key={index}>
                            <td>{formatTime(interval?.start ?? undefined)}</td>
                            <td>{formatTime(interval?.end ?? undefined)}</td>
                          </React.Fragment>
                        );
                      })}

                      <td>
                        <strong>
                          {formatMinutes(session.totalWorkMinutes)}
                        </strong>
                      </td>

                      <td>{formatMinutes(session.totalPauseMinutes)}</td>

                      <td>
                        {session.workLocation === "homeoffice"
                          ? "🏠 Homeoffice"
                          : "🏢 Vor Ort"}
                      </td>

                      <td>
                        <span className={`status-badge ${status.className}`}>
                          {status.text}
                        </span>
                      </td>

                      <td>
                        <div className="actions">
                          <button
                            className="edit-btn"
                            onClick={() =>
                              setEditingSession({
                                ...session,
                              })
                            }
                          >
                            ✏️
                          </button>

                          <button
                            className="delete-btn"
                            onClick={() => handleDelete(session)}
                          >
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingSession && (
        <EditSessionModal
          session={editingSession}
          onCancel={() => setEditingSession(null)}
          onSave={handleSave}
        />
      )}

      {showExcelImport && (
        <div className="modal-overlay">
          <div className="modal excel-import-modal">
            <div className="modal-header">
              <div>
                <h2>Arbeitszeiten aus Excel importieren</h2>
                <p>
                  Excel-Datei auswählen und die erkannten Arbeitszeiten prüfen.
                </p>
              </div>

              <button
                type="button"
                className="close-btn"
                onClick={closeExcelImport}
              >
                ×
              </button>
            </div>

            <div className="excel-import-content">
              <div className="excel-import-duplicate-mode">
                <label htmlFor="excel-duplicate-mode">
                  Umgang mit bereits vorhandenen Arbeitstagen
                </label>

                <select
                  id="excel-duplicate-mode"
                  value={excelDuplicateMode}
                  onChange={(event) =>
                    setExcelDuplicateMode(
                      event.target.value as "skip" | "replace",
                    )
                  }
                >
                  <option value="skip">
                    Vorhandene Arbeitstage überspringen
                  </option>
                  <option value="replace">
                    Vorhandene Arbeitstage ersetzen
                  </option>
                </select>
              </div>

              <div className="excel-import-file">
                <label htmlFor="excel-worktime-file">
                  Excel-Datei auswählen
                </label>

                <input
                  id="excel-worktime-file"
                  type="file"
                  accept=".xls,.xlsx"
                  onChange={handleExcelFileChange}
                />
              </div>

              {excelImportError && (
                <div className="excel-import-error">{excelImportError}</div>
              )}

              {excelLoading && (
                <div className="loading">Excel-Datei wird eingelesen...</div>
              )}

              {excelPreview && (
                <>
                  {excelPreview.sheetNames.length > 1 && (
                    <div className="excel-import-sheet">
                      <label htmlFor="excel-sheet-select">Tabellenblatt</label>

                      <select
                        id="excel-sheet-select"
                        value={excelPreview.selectedSheet}
                        onChange={(event) =>
                          handleSheetChange(event.target.value)
                        }
                      >
                        {excelPreview.sheetNames.map((sheet) => (
                          <option key={sheet} value={sheet}>
                            {sheet}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="excel-import-info">
                    {excelPreview.rows.length} Arbeitstage erkannt.{" "}
                    {excelPreview.monthlySummaries.length} Monatssummen erkannt.
                    Arbeitsintervalle: beliebig viele.
                    {excelDuplicateDates.size > 0 && (
                      <p className="excel-import-warning">
                        {excelDuplicateDates.size} Arbeitstag(e) sind bereits
                        vorhanden.
                        {excelDuplicateMode === "skip"
                          ? " Diese werden beim Import übersprungen."
                          : " Diese werden beim Import ersetzt."}
                      </p>
                    )}
                  </div>

                  {excelPreview.monthlySummaries.length > 0 && (
                    <div className="excel-import-monthly">
                      <h3>Monatssummen und Pausenkontrolle</h3>

                      <div className="excel-import-table-wrapper">
                        <table className="excel-import-table">
                          <thead>
                            <tr>
                              <th>Monat</th>
                              <th>Ist</th>
                              <th>Soll</th>
                              <th>Berechnete Pause</th>
                              <th>Saldo</th>
                              <th>Excel-Zeile</th>
                            </tr>
                          </thead>

                          <tbody>
                            {excelPreview.monthlySummaries.map((summary) => (
                              <tr key={`${summary.month}-${summary.excelRow}`}>
                                <td>
                                  {new Date(
                                    `${summary.month}-01T00:00:00`,
                                  ).toLocaleDateString("de-DE", {
                                    month: "long",
                                    year: "numeric",
                                  })}
                                </td>
                                <td>
                                  {formatImportedMinutes(summary.istMinutes)}
                                </td>
                                <td>
                                  {formatImportedMinutes(summary.sollMinutes)}
                                </td>
                                <td>
                                  {formatImportedMinutes(summary.pauseMinutes)}
                                </td>
                                <td>
                                  {formatImportedMinutes(summary.saldoMinutes)}
                                </td>
                                <td>{summary.excelRow}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {excelPreview.rows.length === 0 ? (
                    <div className="excel-import-empty">
                      Keine Arbeitszeitdaten gefunden.
                    </div>
                  ) : (
                    <div className="excel-import-table-wrapper">
                      <table className="excel-import-table">
                        <thead>
                          <tr>
                            <th>Excel-Zeile</th>
                            <th>Datum</th>
                            <th>Arbeitsintervalle</th>
                            <th>Ist</th>
                            <th>Soll</th>
                            <th>Saldo</th>
                            <th>Hinweise</th>
                          </tr>
                        </thead>

                        <tbody>
                          {excelPreview.rows.map((row) => (
                            <tr key={row.excelRow}>
                              <td>{row.excelRow}</td>

                              <td>
                                {row.date
                                  ? new Date(
                                      `${row.date}T00:00:00`,
                                    ).toLocaleDateString("de-DE")
                                  : "Ungültig"}
                                {excelDuplicateDates.has(row.date) && (
                                  <span className="excel-duplicate-warning">
                                    Bereits vorhanden
                                  </span>
                                )}
                              </td>

                              <td>
                                {row.intervals.length > 0
                                  ? row.intervals.map((interval, index) => (
                                      <div key={index}>
                                        {interval.start} – {interval.end}
                                      </div>
                                    ))
                                  : "Keine Intervalle"}
                              </td>

                              <td>{formatImportedMinutes(row.istMinutes)}</td>
                              <td>{formatImportedMinutes(row.sollMinutes)}</td>
                              <td>{formatImportedMinutes(row.saldoMinutes)}</td>

                              <td className="excel-import-warnings">
                                {row.warnings.length > 0
                                  ? row.warnings.join(" ")
                                  : "Keine"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="cancel-btn"
                onClick={closeExcelImport}
                disabled={excelLoading}
              >
                Schließen
              </button>

              <button
                type="button"
                className="save-btn"
                onClick={handleExcelImport}
                disabled={
                  excelLoading ||
                  !excelPreview ||
                  excelPreview.rows.length === 0
                }
              >
                {excelLoading ? "Import läuft..." : "Excel-Daten importieren"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatImportedMinutes(minutes: number | null): string {
  if (minutes === null) return "–";

  const sign = minutes < 0 ? "-" : "";
  const absoluteMinutes = Math.abs(minutes);

  const hours = Math.floor(absoluteMinutes / 60);
  const remainingMinutes = absoluteMinutes % 60;

  return `${sign}${hours}:${remainingMinutes.toString().padStart(2, "0")} Std.`;
}

interface EditSessionModalProps {
  session: WorkSession;
  onCancel: () => void;
  onSave: (session: WorkSession) => void;
}

type EditableInterval = {
  id: string;
  start: string;
  end: string;
};

function EditSessionModal({
  session,
  onCancel,
  onSave,
}: EditSessionModalProps) {
  const [date, setDate] = useState(session.date);

  const [intervals, setIntervals] = useState<EditableInterval[]>(() => {
    const savedIntervals = session.workIntervals?.length
      ? session.workIntervals
      : session.workStart
        ? [
            {
              id: crypto.randomUUID(),
              start: session.workStart,
              end: session.workEnd,
            },
          ]
        : [];

    const mappedIntervals = savedIntervals.map((interval) => ({
      id: interval.id ?? crypto.randomUUID(),
      start: interval.start ? toTimeInput(interval.start) : "",
      end: interval.end ? toTimeInput(interval.end) : "",
    }));

    return mappedIntervals.length > 0
      ? mappedIntervals
      : [{ id: crypto.randomUUID(), start: "", end: "" }];
  });

  function removeInterval(index: number) {
    setIntervals((previous) => {
      const remaining = previous.filter((_, i) => i !== index);

      return remaining.length > 0
        ? remaining
        : [{ id: crypto.randomUUID(), start: "", end: "" }];
    });
  }

  function addInterval() {
    setIntervals((previous) => [
      ...previous,
      { id: crypto.randomUUID(), start: "", end: "" },
    ]);
  }

  const [location, setLocation] = useState<WorkSession["workLocation"]>(
    session.workLocation,
  );

  const [status, setStatus] = useState<WorkSessionStatus>(
    session.status ?? "completed",
  );

  const [error, setError] = useState("");

  function updateInterval(
    index: number,
    field: "start" | "end",
    value: string,
  ) {
    setIntervals((previous) =>
      previous.map((interval, i) =>
        i === index ? { ...interval, [field]: value } : interval,
      ),
    );
  }

  function getDateWithTime(day: Date, time: string): Date {
    const [hours, minutes] = time.split(":").map(Number);

    const result = new Date(day);
    result.setHours(hours, minutes, 0, 0);

    return result;
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (!date) {
      setError("Bitte gib ein Datum an.");
      return;
    }

    const baseDate = new Date(`${date}T00:00:00`);

    if (Number.isNaN(baseDate.getTime())) {
      setError("Das Datum ist ungültig.");
      return;
    }

    const enteredIntervals = intervals.filter(
      (interval) => interval.start || interval.end,
    );

    if (enteredIntervals.some((interval) => !interval.start || !interval.end)) {
      setError(
        "Jedes angefangene Intervall benötigt einen Beginn und ein Ende.",
      );
      return;
    }

    if (
      enteredIntervals.length === 0 &&
      status !== "sick" &&
      location !== "sick"
    ) {
      setError("Bitte gib mindestens ein Arbeitsintervall an.");
      return;
    }

    const workIntervals: WorkInterval[] = [];

    let previousEnd: Date | undefined;

    try {
      for (const interval of enteredIntervals) {
        let intervalStart = getDateWithTime(baseDate, interval.start);

        let intervalEnd = getDateWithTime(baseDate, interval.end);

        // Ein Intervall darf über Mitternacht laufen.
        if (intervalEnd <= intervalStart) {
          intervalEnd.setDate(intervalEnd.getDate() + 1);
        }

        // Folgeintervalle zeitlich hinter dem vorherigen einordnen.
        if (previousEnd && intervalStart < previousEnd) {
          throw new Error(
            "Die Arbeitsintervalle überschneiden sich oder sind nicht chronologisch sortiert.",
          );
        }

        if (intervalEnd <= intervalStart) {
          throw new Error("Ein Arbeitsintervall hat eine ungültige Dauer.");
        }

        workIntervals.push({
          id: interval.id,
          start: intervalStart,
          end: intervalEnd,
        });

        previousEnd = intervalEnd;
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Die Arbeitsintervalle sind ungültig.",
      );
      return;
    }

    // Pausen aus den Lücken zwischen den Arbeitsintervallen bilden.
    const pauses: WorkPause[] = [];

    for (let i = 0; i < workIntervals.length - 1; i++) {
      const current = workIntervals[i];
      const next = workIntervals[i + 1];

      if (!current.end) continue;

      const gapMinutes = Math.round(
        (next.start.getTime() - current.end.getTime()) / 60000,
      );

      if (gapMinutes < 0) {
        setError("Die Arbeitsintervalle überschneiden sich.");
        return;
      }

      if (gapMinutes > 0) {
        pauses.push({
          id: crypto.randomUUID(),
          start: new Date(current.end),
          end: new Date(next.start),
        });
      }
    }

    const totalWorkMinutes = workIntervals.reduce((total, interval) => {
      if (!interval.end) return total;

      return (
        total +
        Math.round((interval.end.getTime() - interval.start.getTime()) / 60000)
      );
    }, 0);

    const totalPauseMinutes = pauses.reduce((total, pause) => {
      if (!pause.end) return total;

      return (
        total +
        Math.round((pause.end.getTime() - pause.start.getTime()) / 60000)
      );
    }, 0);

    const firstInterval = workIntervals[0];
    const lastInterval = workIntervals[workIntervals.length - 1];

    onSave({
      ...session,
      date,

      workStart: firstInterval?.start ?? baseDate,
      workEnd: lastInterval?.end,
      loginTime: firstInterval?.start ?? session.loginTime,
      logoutTime: lastInterval?.end,

      workIntervals,
      pauses,

      pauseStart: pauses[0]?.start,
      pauseEnd: pauses[pauses.length - 1]?.end,

      totalWorkMinutes,
      totalPauseMinutes,

      workLocation: location,
      status,
    });
  }

  const pauseMinutes = intervals.reduce((total, interval, index) => {
    if (index === 0 || !interval.start || !interval.end) {
      return total;
    }

    const previous = intervals[index - 1];

    if (!previous.end) return total;

    const currentStart = getDateWithTime(
      new Date(`${date}T00:00:00`),
      interval.start,
    );

    const previousEnd = getDateWithTime(
      new Date(`${date}T00:00:00`),
      previous.end,
    );

    if (currentStart < previousEnd) {
      currentStart.setDate(currentStart.getDate() + 1);
    }

    return (
      total +
      Math.max(
        0,
        Math.round((currentStart.getTime() - previousEnd.getTime()) / 60000),
      )
    );
  }, 0);

  const workMinutes = intervals.reduce((total, interval) => {
    if (!interval.start || !interval.end) return total;

    const start = interval.start.split(":").map(Number);
    const end = interval.end.split(":").map(Number);

    let minutes = end[0] * 60 + end[1] - (start[0] * 60 + start[1]);

    if (minutes <= 0) minutes += 1440;

    return total + minutes;
  }, 0);

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div>
            <h2>Arbeitszeit bearbeiten</h2>
            <p>Alle Arbeitsintervalle können bearbeitet werden.</p>
          </div>

          <button type="button" className="close-btn" onClick={onCancel}>
            ×
          </button>
        </div>

        {error && <div className="modal-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-group">
              <label>Datum</label>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Arbeitsort</label>
              <select
                value={location}
                onChange={(event) =>
                  setLocation(event.target.value as WorkSession["workLocation"])
                }
              >
                <option value="office">Vor Ort</option>
                <option value="homeoffice">Homeoffice</option>
                <option value="business_trip">Dienstreise</option>
                <option value="sick">Krank</option>
              </select>
            </div>

            <div className="form-group">
              <label>Status</label>
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as WorkSessionStatus)
                }
              >
                <option value="in_progress">Läuft</option>
                <option value="completed">Erfasst</option>
                <option value="auto_closed">Automatisch beendet</option>
                <option value="needs_correction">Korrektur erforderlich</option>
                <option value="sick">Krank</option>
              </select>
            </div>
          </div>

          <h3>Arbeitsintervalle</h3>

          <div className="interval-edit-grid">
            {intervals.map((interval, index) => (
              <div className="interval-row" key={interval.id}>
                <div className="form-group">
                  <label>Beginn</label>
                  <input
                    type="time"
                    value={interval.start}
                    onChange={(event) =>
                      updateInterval(index, "start", event.target.value)
                    }
                  />
                </div>

                <div className="form-group">
                  <label>Ende</label>
                  <input
                    type="time"
                    value={interval.end}
                    onChange={(event) =>
                      updateInterval(index, "end", event.target.value)
                    }
                  />
                </div>

                <button
                  type="button"
                  className="delete-interval-btn"
                  onClick={() => removeInterval(index)}
                  title="Arbeitsintervall löschen"
                  aria-label="Arbeitsintervall löschen"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="M19 6l-1 14H6L5 6" />
                    <path d="M10 11v5" />
                    <path d="M14 11v5" />
                  </svg>
                </button>
              </div>
            ))}

            <button
              type="button"
              className="add-interval-btn"
              onClick={addInterval}
            >
              + Arbeitsintervall hinzufügen
            </button>
          </div>

          <div className="interval-summary">
            <div>
              <span>Arbeitszeit</span>
              <strong>
                {Math.floor(workMinutes / 60)}:
                {(workMinutes % 60).toString().padStart(2, "0")} Std.
              </strong>
            </div>

            <div>
              <span>Pausenzeit</span>
              <strong>
                {Math.floor(pauseMinutes / 60)}:
                {(pauseMinutes % 60).toString().padStart(2, "0")} Std.
              </strong>
            </div>
          </div>

          <p className="form-hint">
            Die Pausen werden automatisch aus den zeitlichen Abständen zwischen
            den Arbeitsintervallen berechnet.
          </p>

          <div className="modal-actions">
            <button type="button" className="cancel-btn" onClick={onCancel}>
              Abbrechen
            </button>

            <button type="submit" className="save-btn">
              Speichern
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function toTimeInput(date?: Date): string {
  if (!date) return "";

  return `${date.getHours().toString().padStart(2, "0")}:${date
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}

export default WorkTimeManagement;
