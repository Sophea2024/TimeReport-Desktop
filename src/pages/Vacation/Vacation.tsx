import { useEffect, useState } from "react";
import { Pencil, Save, Trash2, X } from "lucide-react";

import { Vacation as VacationType } from "../../types/Vacation";
import { useAuth } from "../../context/AuthContext";

import "./Vacation.css";

export default function VacationPage() {
  const { user } = useAuth();

  // =========================================
  // Hilfsfunktion: Datum formatieren
  // =========================================

  const formatDate = (date: string) => {
    const [year, month, day] = date.split("-");

    return `${day}.${month}.${year}`;
  };

  // =========================================
  // State
  // =========================================

  const [vacations, setVacations] = useState<VacationType[]>([]);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [vacationAllowance, setVacationAllowance] = useState(30);

  const [editingVacationId, setEditingVacationId] = useState<string | null>(
    null,
  );

  // =========================================
  // Aktuelles Jahr
  // =========================================

  const currentYear = new Date().getFullYear();

  // =========================================
  // Urlaubstage eines Zeitraums für ein Jahr
  // berechnen
  // =========================================

  const getVacationDaysForYear = (
    startDate: string,
    endDate: string,
    year: number,
  ): number => {
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);

    const yearStart = new Date(`${year}-01-01T00:00:00`);
    const yearEnd = new Date(`${year}-12-31T00:00:00`);

    // Kein Überschneiden mit diesem Jahr
    if (end < yearStart || start > yearEnd) {
      return 0;
    }

    const calculationStart = start > yearStart ? start : yearStart;
    const calculationEnd = end < yearEnd ? end : yearEnd;

    let vacationDays = 0;

    const current = new Date(calculationStart);

    while (current <= calculationEnd) {
      const dayOfWeek = current.getDay();

      // Samstag = 6, Sonntag = 0
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      if (!isWeekend) {
        vacationDays++;
      }

      current.setDate(current.getDate() + 1);
    }

    return vacationDays;
  };

  const getVacationApprovalStatus = (
    vacation: VacationType,
  ): "pending" | "approved" | "rejected" => {
    if (vacation.status === "rejected") {
      return "rejected";
    }

    if (vacation.status === "pending") {
      return "pending";
    }

    const now = new Date();
    const today =
      `${now.getFullYear()}-` +
      `${String(now.getMonth() + 1).padStart(2, "0")}-` +
      `${String(now.getDate()).padStart(2, "0")}`;

    // Zukünftiger Urlaub ohne erfasste Entscheidung:
    // als ausstehend behandeln.
    if (!vacation.decidedAt && vacation.startDate >= today) {
      return "pending";
    }

    return "approved";
  };

  // =========================================
  // Genommene Urlaubstage im aktuellen Jahr
  // =========================================

  const usedVacationDays = vacations.reduce((total, vacation) => {
    const status = vacation.status ?? "approved";

    if (status !== "approved") {
      return total;
    }

    return (
      total +
      getVacationDaysForYear(vacation.startDate, vacation.endDate, currentYear)
    );
  }, 0);

  // =========================================
  // Verbleibende Urlaubstage
  // =========================================

  const remainingVacationDays = Math.max(
    vacationAllowance - usedVacationDays,
    0,
  );

  // =========================================
  // Urlaube aus SQLite laden
  // =========================================

  const loadVacations = async () => {
    if (!user) {
      return;
    }

    try {
      const result = await window.database.getVacations(user.id);

      setVacations(result);
    } catch (error) {
      console.error("Fehler beim Laden der Urlaube:", error);
    }
  };

  // =========================================
  // Urlaubsanspruch laden
  // =========================================

  const loadVacationAllowance = async () => {
    if (!user) {
      return;
    }

    try {
      const result = await window.database.getVacationAllowance(
        user.id,
        currentYear,
      );

      setVacationAllowance(result);
    } catch (error) {
      console.error("Fehler beim Laden des Urlaubsanspruchs:", error);

      // Falls kein Eintrag in der Datenbank vorhanden ist
      setVacationAllowance(30);
    }
  };

  // =========================================
  // Beim Öffnen der Seite laden
  // =========================================

  useEffect(() => {
    if (!user) {
      return;
    }

    loadVacations();
    loadVacationAllowance();
  }, [user]);

  // =========================================
  // Urlaubstage eines kompletten Zeitraums
  // berechnen
  // =========================================

  const calculateVacationDays = (
    startDate: string,
    endDate: string,
  ): number => {
    const startYear = new Date(`${startDate}T00:00:00`).getFullYear();
    const endYear = new Date(`${endDate}T00:00:00`).getFullYear();

    let totalDays = 0;

    for (let year = startYear; year <= endYear; year++) {
      totalDays += getVacationDaysForYear(startDate, endDate, year);
    }

    return totalDays;
  };

  // =========================================
  // Urlaub speichern / aktualisieren
  // =========================================

  const handleSaveVacation = async () => {
    if (!user) {
      alert("Kein Benutzer angemeldet.");
      return;
    }

    if (!startDate || !endDate) {
      alert("Bitte Start- und Enddatum auswählen.");
      return;
    }

    if (endDate < startDate) {
      alert("Das Enddatum darf nicht vor dem Startdatum liegen.");
      return;
    }

    const totalDays = calculateVacationDays(startDate, endDate);

    try {
      // =========================================
      // Bestehenden Urlaub aktualisieren
      // =========================================

      if (editingVacationId) {
        const vacation: VacationType = {
          id: editingVacationId,
          userId: user.id,
          startDate,
          endDate,
          totalDays,
        };

        await window.database.updateVacation(vacation);

        console.log("Urlaub aktualisiert:", vacation);
      } else {
        // =========================================
        // Neuen Urlaub speichern
        // =========================================

        const vacation: VacationType = {
          id: crypto.randomUUID(),
          userId: user.id,
          startDate,
          endDate,
          totalDays,
        };

        await window.database.saveVacation({
          ...vacation,
          status: "pending",
          requestedAt: new Date().toISOString(),
          decidedAt: undefined,
          decidedBy: undefined,
          rejectionReason: undefined,
        });

        console.log("Urlaub gespeichert:", vacation);
      }

      // Liste neu laden
      await loadVacations();

      // Formular zurücksetzen
      resetForm();
    } catch (error) {
      console.error("Fehler beim Speichern des Urlaubs:", error);

      if (editingVacationId) {
        alert("Der Urlaub konnte nicht aktualisiert werden.");
      } else {
        alert("Der Urlaub konnte nicht gespeichert werden.");
      }
    }
  };

  // =========================================
  // Urlaub bearbeiten
  // =========================================

  const handleEditVacation = (vacation: VacationType) => {
    setEditingVacationId(vacation.id);
    setStartDate(vacation.startDate);
    setEndDate(vacation.endDate);
  };

  // =========================================
  // Bearbeiten abbrechen
  // =========================================

  const handleCancelEdit = () => {
    resetForm();
  };

  // =========================================
  // Formular zurücksetzen
  // =========================================

  const resetForm = () => {
    setStartDate("");
    setEndDate("");
    setEditingVacationId(null);
  };

  // =========================================
  // Urlaub löschen
  // =========================================

  const handleDeleteVacation = async (id: string) => {
    const confirmed = window.confirm(
      "Möchtest du diesen Urlaub wirklich löschen?",
    );

    if (!confirmed) {
      return;
    }

    try {
      await window.database.deleteVacation(id);

      console.log("Urlaub gelöscht:", id);

      await loadVacations();

      // Falls gerade dieser Urlaub bearbeitet wurde
      if (editingVacationId === id) {
        resetForm();
      }
    } catch (error) {
      console.error("Fehler beim Löschen des Urlaubs:", error);

      alert("Der Urlaub konnte nicht gelöscht werden.");
    }
  };

  // =========================================
  // Ausgabe
  // =========================================

  async function handleVacationApproval(
    id: string,
    status: "approved" | "rejected",
  ) {
    const confirmed = window.confirm(
      status === "approved"
        ? "Hast du die Genehmigung deines Chefs per E-Mail erhalten?"
        : "Hast du die Ablehnung deines Chefs per E-Mail erhalten?",
    );

    if (!confirmed) return;

    try {
      const result = await window.database.updateVacationApproval(
        id,
        status,
        undefined,
        undefined,
      );

      if (!result.success) {
        alert(
          result.message ?? "Die Entscheidung konnte nicht gespeichert werden.",
        );
        return;
      }

      setVacations((current) =>
        current.map((vacation) =>
          vacation.id === id
            ? {
                ...vacation,
                status,
                decidedAt: new Date().toISOString(),
                decidedBy: undefined,
                rejectionReason: undefined,
              }
            : vacation,
        ),
      );
    } catch (error) {
      console.error(
        "Urlaubsentscheidung konnte nicht gespeichert werden:",
        error,
      );
      alert("Die Entscheidung konnte nicht gespeichert werden.");
    }
  }
  /*
  async function handlePrepareVacationEmail(vacation: VacationType) {
    const to = window.prompt("E-Mail-Adresse deines Chefs eingeben:");

    if (to === null) return;

    if (!to.trim()) {
      alert("Bitte eine E-Mail-Adresse eingeben.");
      return;
    }

    const subject =
      `Urlaubsantrag: ${formatDate(vacation.startDate)} – ` +
      `${formatDate(vacation.endDate)}`;

    const body = [
      "Hallo,",
      "",
      "hiermit beantrage ich Urlaub für folgenden Zeitraum:",
      `Beginn: ${formatDate(vacation.startDate)}`,
      `Ende: ${formatDate(vacation.endDate)}`,
      `Urlaubstage: ${vacation.totalDays}`,
      "",
      "Bitte gib mir eine kurze Rückmeldung, ob du den Urlaub genehmigst.",
      "",
      "Viele Grüße",
    ].join("\n");

    try {
      const result = await window.database.prepareEmail(
        to.trim(),
        subject,
        body,
      );

      if (!result.success) {
        alert(result.message ?? "Die E-Mail konnte nicht vorbereitet werden.");
      }
    } catch (error) {
      console.error("E-Mail konnte nicht vorbereitet werden:", error);
      alert("Die E-Mail konnte nicht vorbereitet werden.");
    }
  }*/

  return (
    <div className="vacation-page">
      <h1>Urlaub</h1>

      {/* =====================================
          Urlaub Zusammenfassung
          ===================================== */}

      <div className="vacation-summary">
        <div className="vacation-summary-card">
          <span>Gesamt: </span>

          <strong>{vacationAllowance} </strong>

          <small>Tage</small>
        </div>

        <div className="vacation-summary-card">
          <span>Genommen: </span>

          <strong>{usedVacationDays} </strong>

          <small>Tage</small>
        </div>

        <div className="vacation-summary-card">
          <span>Verbleibend: </span>

          <strong>{remainingVacationDays} </strong>

          <small>Tage</small>
        </div>
      </div>

      {/* =====================================
          Urlaub hinzufügen / bearbeiten
          ===================================== */}

      <section className="vacation-form">
        <h2>{editingVacationId ? "Urlaub bearbeiten" : "Urlaub hinzufügen"}</h2>

        <div className="vacation-form-grid">
          {/* Startdatum */}

          <div className="vacation-field">
            <label htmlFor="vacation-start-date">Startdatum</label>

            <input
              id="vacation-start-date"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>

          {/* Enddatum */}

          <div className="vacation-field">
            <label htmlFor="vacation-end-date">Enddatum</label>

            <input
              id="vacation-end-date"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>
        </div>

        {/* =====================================
            Formular Buttons
            ===================================== */}

        <div className="vacation-form-actions">
          <button
            type="button"
            className="vacation-button vacation-button-primary"
            onClick={handleSaveVacation}
          >
            <Save size={16} />

            <span>
              {editingVacationId ? "Urlaub aktualisieren" : "Urlaub speichern"}
            </span>
          </button>

          {editingVacationId && (
            <button
              type="button"
              className="vacation-button vacation-button-secondary"
              onClick={handleCancelEdit}
            >
              <X size={16} />

              <span>Abbrechen</span>
            </button>
          )}
        </div>
      </section>

      {/* =====================================
          Urlaubsliste
          ===================================== */}

      <section className="vacation-list-section">
        <h2>Meine Urlaube</h2>

        {vacations.length === 0 ? (
          <div className="vacation-list vacation-empty">
            Keine Urlaube vorhanden.
          </div>
        ) : (
          <div className="vacation-list">
            {/* Tabellenkopf */}
            <div className="vacation-list-header">
              <span>Zeitraum</span>
              <span>Tage</span>
              <span>Status</span>
              <span>Aktionen</span>
            </div>

            {/* Urlaubseinträge */}
            {vacations.map((vacation) => {
              const status = getVacationApprovalStatus(vacation);

              const statusLabel =
                status === "pending"
                  ? "Ausstehend"
                  : status === "approved"
                    ? "Genehmigt"
                    : "Abgelehnt";

              return (
                <div className="vacation-list-row" key={vacation.id}>
                  <div className="vacation-date">
                    <div className="vacation-date-range">
                      <span>{formatDate(vacation.startDate)}</span>
                      <span>–</span>
                      <span>{formatDate(vacation.endDate)}</span>
                    </div>
                  </div>

                  <div className="vacation-days">
                    {vacation.totalDays}{" "}
                    {vacation.totalDays === 1 ? "Tag" : "Tage"}
                  </div>

                  <div className="vacation-status">
                    <span
                      className={`vacation-status-badge vacation-status-${status}`}
                    >
                      {statusLabel}
                    </span>
                  </div>

                  <div className="vacation-actions">
                    {status === "pending" && (
                      <>
                        <button
                          type="button"
                          className="vacation-approval-button vacation-approve-button"
                          onClick={() =>
                            handleVacationApproval(vacation.id, "approved")
                          }
                        >
                          Genehmigen
                        </button>

                        <button
                          type="button"
                          className="vacation-approval-button vacation-reject-button"
                          onClick={() =>
                            handleVacationApproval(vacation.id, "rejected")
                          }
                        >
                          Ablehnen
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      className="vacation-action-button vacation-edit-button"
                      onClick={() => handleEditVacation(vacation)}
                      title="Urlaub bearbeiten"
                    >
                      <Pencil size={15} />
                      <span>Bearbeiten</span>
                    </button>

                    <button
                      type="button"
                      className="vacation-action-button vacation-delete-button"
                      onClick={() => handleDeleteVacation(vacation.id)}
                      title="Urlaub löschen"
                    >
                      <Trash2 size={15} />
                      <span>Löschen</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
