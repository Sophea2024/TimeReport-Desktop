import { useEffect, useState } from "react";
import "./OvertimeAccount.css";
import { reportService } from "../../Services/reports/ReportService";

import { useAuth } from "../../context/AuthContext";
import { overtimeService } from "../../Services/OvertimeService";
import type {
  OvertimeTransaction,
  OvertimeTransactionType,
} from "../../types/OvertimeTransaction";

function OvertimeAccount() {
  const { user } = useAuth();

  const [balance, setBalance] = useState(0);

  const currentDate = new Date();

  const [periodType, setPeriodType] = useState<"year" | "month">("year");

  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());

  const [selectedMonth, setSelectedMonth] = useState(
    currentDate.getMonth() + 1,
  );

  const [transactions, setTransactions] = useState<
    Awaited<ReturnType<typeof window.database.getOvertimeTransactionsByUser>>
  >([]);

  const [transactionType, setTransactionType] =
    useState<OvertimeTransactionType>("time_off");

  const [hours, setHours] = useState("");

  const [date, setDate] = useState(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  });

  const [note, setNote] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [timeOffDays, setTimeOffDays] = useState("");

  const [approvalDialog, setApprovalDialog] = useState<{
    id: string;
    status: "approved" | "rejected";
  } | null>(null);

  const [decidedBy, setDecidedBy] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [approvalSaving, setApprovalSaving] = useState(false);

  async function loadData() {
    if (!user?.id) return;

    try {
      setLoading(true);

      const currentBalance = await overtimeService.getBalance(
        user.id,
        periodType,
        selectedYear,
        selectedMonth,
      );

      const allTransactions =
        await window.database.getOvertimeTransactionsByUser(user.id);

      const periodPrefix =
        periodType === "month"
          ? `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-`
          : `${selectedYear}-`;

      const filteredTransactions = allTransactions.filter((transaction) =>
        transaction.date.startsWith(periodPrefix),
      );

      setBalance(currentBalance);
      setTransactions(filteredTransactions);
    } catch (error) {
      console.error("Überstundenkonto konnte nicht geladen werden:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [user?.id, periodType, selectedYear, selectedMonth]);

  async function handleSave() {
    if (!user?.id) return;

    if (!hours.trim()) {
      alert("Bitte gib die Anzahl der Stunden ein.");
      return;
    }

    const selectedHours = Number(hours.replace(",", "."));

    if (!Number.isFinite(selectedHours) || selectedHours <= 0) {
      alert("Bitte eine gültige Stundenanzahl eingeben.");
      return;
    }

    const minutes = Math.round(selectedHours * 60);

    if (minutes > balance) {
      alert(
        "Die ausgewählte Zeit ist größer als dein verfügbares Überstundenkonto.",
      );
      return;
    }

    const days =
      transactionType === "time_off" && timeOffDays.trim()
        ? Number(timeOffDays)
        : 0;

    if (transactionType === "time_off" && !timeOffDays.trim()) {
      alert("Bitte gib die Anzahl der Freizeittage ein.");
      return;
    }

    if (
      transactionType === "time_off" &&
      (!Number.isFinite(days) || days <= 0)
    ) {
      alert("Die Anzahl der Freizeittage muss größer als 0 sein.");
      return;
    }

    if (!date) {
      alert("Bitte ein Datum auswählen.");
      return;
    }

    try {
      setSaving(true);

      if (transactionType === "time_off") {
        await overtimeService.useTimeOff(
          user.id,
          minutes,
          date,
          days,
          note || undefined,
        );
      } else {
        await overtimeService.payout(user.id, minutes, date, note || undefined);
      }

      setHours("");
      setTimeOffDays("");
      setNote("");

      await loadData();
    } catch (error) {
      console.error(
        "Überstundenbuchung konnte nicht gespeichert werden:",
        error,
      );

      alert(
        error instanceof Error
          ? error.message
          : "Die Überstundenbuchung konnte nicht gespeichert werden.",
      );
    } finally {
      setSaving(false);
    }
  }

  function getTransactionLabel(type: OvertimeTransactionType) {
    switch (type) {
      case "earned":
        return "Angesammelt";

      case "time_off":
        return "Freizeitausgleich";

      case "payout":
        return "Auszahlung";

      default:
        return type;
    }
  }

  function openApprovalDialog(id: string, status: "approved" | "rejected") {
    setDecidedBy("");
    setRejectionReason("");
    setApprovalDialog({ id, status });
  }

  async function handleApproval() {
    if (!approvalDialog || approvalSaving) return;

    if (!decidedBy.trim()) {
      alert("Bitte gib den Namen der entscheidenden Person ein.");
      return;
    }

    try {
      setApprovalSaving(true);

      const result = await window.database.updateOvertimeApproval(
        approvalDialog.id,
        approvalDialog.status,
        decidedBy.trim(),
        rejectionReason.trim() || undefined,
      );

      if (!result.success) {
        alert(
          result.message ?? "Die Entscheidung konnte nicht gespeichert werden.",
        );
        return;
      }

      setApprovalDialog(null);
      await loadData();
    } catch (error) {
      console.error("Entscheidung konnte nicht gespeichert werden:", error);

      alert(
        error instanceof Error
          ? error.message
          : "Die Entscheidung konnte nicht gespeichert werden.",
      );
    } finally {
      setApprovalSaving(false);
    }
  }

  function getApprovalStatus(
    transaction: OvertimeTransaction,
  ): "pending" | "approved" | "rejected" {
    // Bei Freizeitausgleich und Auszahlung zählt eine
    // Entscheidung erst, wenn ein Entscheidungszeitpunkt vorliegt.
    if (
      (transaction.type === "time_off" || transaction.type === "payout") &&
      !transaction.decidedAt
    ) {
      return "pending";
    }

    return transaction.status ?? "approved";
  }

  function getStatusLabel(transaction: OvertimeTransaction): string {
    switch (getApprovalStatus(transaction)) {
      case "pending":
        return "Ausstehend";
      case "approved":
        return "Genehmigt";
      case "rejected":
        return "Abgelehnt";
    }
  }

  if (loading) {
    return (
      <div className="overtime-page">
        <div className="overtime-loading">Überstundenkonto wird geladen...</div>
      </div>
    );
  }

  return (
    <div className="overtime-page">
      <div className="overtime-header">
        <div>
          <h1>Überstundenkonto</h1>
          <p>Verwaltung deiner Gleitzeit und Überstunden</p>
        </div>
      </div>

      <div className="overtime-period-card">
        <label className="overtime-field">
          <span>Zeitraum</span>

          <select
            value={periodType}
            onChange={(e) => setPeriodType(e.target.value as "year" | "month")}
          >
            <option value="year">Jahr</option>
            <option value="month">Monat</option>
          </select>
        </label>

        <label className="overtime-field">
          <span>Jahr</span>

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
          >
            {Array.from({ length: 5 }, (_, index) => {
              const year = currentDate.getFullYear() - 2 + index;

              return (
                <option key={year} value={year}>
                  {year}
                </option>
              );
            })}
          </select>
        </label>

        {periodType === "month" && (
          <label className="overtime-field">
            <span>Monat</span>

            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, index) => (
                <option key={index + 1} value={index + 1}>
                  {reportService.formatMonth(index + 1)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="overtime-balance-card">
        <span>Aktueller Gleitzeit-Saldo</span>

        <strong
          className={
            balance > 0
              ? "overtime-positive"
              : balance < 0
                ? "overtime-negative"
                : ""
          }
        >
          {overtimeService.formatMinutes(balance)}
        </strong>

        <small>Verfügbare Zeit für Freizeitausgleich oder Auszahlung</small>
      </div>

      <section className="overtime-card">
        <div className="overtime-card-header">
          <div>
            <h2>Überstunden verwenden</h2>
            <p>Wähle selbst, wie du dein Zeitguthaben verwenden möchtest.</p>
          </div>
        </div>

        <div className="overtime-choice-grid">
          <label
            className={`overtime-choice ${
              transactionType === "time_off" ? "selected" : ""
            }`}
          >
            <input
              type="radio"
              name="transactionType"
              value="time_off"
              checked={transactionType === "time_off"}
              onChange={() => setTransactionType("time_off")}
            />

            <div>
              <strong>Freizeitausgleich</strong>
              <span>Überstunden als freie Zeit verwenden</span>
            </div>
          </label>

          <label
            className={`overtime-choice ${
              transactionType === "payout" ? "selected" : ""
            }`}
          >
            <input
              type="radio"
              name="transactionType"
              value="payout"
              checked={transactionType === "payout"}
              onChange={() => setTransactionType("payout")}
            />

            <div>
              <strong>Auszahlung</strong>
              <span>Überstunden zur Auszahlung erfassen</span>
            </div>
          </label>
        </div>

        <div className="overtime-form-grid">
          <label className="overtime-field">
            <span>Datum</span>

            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>

          <label className="overtime-field">
            <span>Stunden</span>

            <input
              type="text"
              inputMode="decimal"
              placeholder="z. B. 7,6"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </label>

          {transactionType === "time_off" && (
            <label className="overtime-field">
              <span>Freizeittage</span>

              <input
                type="number"
                min="1"
                step="1"
                placeholder="z. B. 2"
                value={timeOffDays}
                onChange={(e) => setTimeOffDays(e.target.value)}
              />
            </label>
          )}

          <label className="overtime-field">
            <span>Notiz</span>

            <input
              type="text"
              placeholder="Optional"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </div>

        <div className="overtime-form-footer">
          <span>
            Verfügbar: <strong>{overtimeService.formatMinutes(balance)}</strong>
          </span>

          <button
            type="button"
            className="overtime-save-button"
            onClick={handleSave}
            disabled={
              saving ||
              balance <= 0 ||
              !hours.trim() ||
              (transactionType === "time_off" && !timeOffDays.trim())
            }
          >
            {saving
              ? "Speichern..."
              : transactionType === "time_off"
                ? "Freizeitausgleich speichern"
                : "Auszahlung speichern"}
          </button>
        </div>
      </section>

      <section className="overtime-card">
        <div className="overtime-card-header">
          <div>
            <h2>Historie</h2>
            <p>
              Deine Gleitzeitbuchungen{" "}
              {periodType === "month"
                ? `im ${reportService.formatMonth(selectedMonth)} ${selectedYear}`
                : `im Jahr ${selectedYear}`}
            </p>
          </div>
        </div>

        {transactions.length === 0 ? (
          <div className="overtime-empty">Noch keine Buchungen vorhanden.</div>
        ) : (
          <div className="overtime-table-wrapper">
            <table className="overtime-table">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Art</th>
                  <th>Freizeittage</th>
                  <th>Notiz</th>
                  <th>Status</th>
                  <th className="overtime-right">Zeit</th>
                  <th>Aktion</th>
                </tr>
              </thead>

              <tbody>
                {transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>
                      {new Date(
                        `${transaction.date}T12:00:00`,
                      ).toLocaleDateString("de-DE")}
                    </td>

                    <td>{getTransactionLabel(transaction.type)}</td>

                    <td>
                      {transaction.days && transaction.days > 0
                        ? `${transaction.days} ${
                            transaction.days === 1 ? "Tag" : "Tage"
                          }`
                        : "—"}
                    </td>

                    <td>{transaction.note || "—"}</td>

                    <td>
                      <span
                        className={`overtime-status overtime-status-${getApprovalStatus(transaction)}`}
                      >
                        {getStatusLabel(transaction)}
                      </span>
                    </td>

                    <td
                      className={`overtime-right ${
                        transaction.minutes >= 0
                          ? "overtime-positive"
                          : "overtime-negative"
                      }`}
                    >
                      {transaction.minutes > 0 ? "+" : ""}
                      {overtimeService.formatMinutes(transaction.minutes)}
                    </td>

                    <td>
                      {(transaction.type === "time_off" ||
                        transaction.type === "payout") &&
                      getApprovalStatus(transaction) === "pending" ? (
                        <div className="overtime-approval-actions">
                          <button
                            type="button"
                            onClick={() =>
                              openApprovalDialog(transaction.id, "approved")
                            }
                          >
                            Genehmigen
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              openApprovalDialog(transaction.id, "rejected")
                            }
                          >
                            Ablehnen
                          </button>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Genehmigungsdialog – HIER EINFÜGEN */}
      {approvalDialog && (
        <div className="overtime-modal-backdrop">
          <section
            className="overtime-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="approval-dialog-title"
          >
            <h2 id="approval-dialog-title">
              {approvalDialog.status === "approved"
                ? "Antrag genehmigen"
                : "Antrag ablehnen"}
            </h2>

            <label className="overtime-field">
              <span>Name der entscheidenden Person *</span>
              <input
                type="text"
                value={decidedBy}
                onChange={(e) => setDecidedBy(e.target.value)}
                placeholder="Name oder E-Mail"
                required
              />
            </label>

            {approvalDialog.status === "rejected" && (
              <label className="overtime-field">
                <span>Ablehnungsgrund (optional)</span>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Grund für die Ablehnung"
                  rows={3}
                />
              </label>
            )}

            <div className="overtime-modal-actions">
              <button
                type="button"
                disabled={approvalSaving}
                onClick={() => setApprovalDialog(null)}
              >
                Abbrechen
              </button>

              <button
                type="button"
                disabled={approvalSaving || !decidedBy.trim()}
                onClick={handleApproval}
              >
                {approvalSaving ? "Speichern..." : "Entscheidung speichern"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default OvertimeAccount;
