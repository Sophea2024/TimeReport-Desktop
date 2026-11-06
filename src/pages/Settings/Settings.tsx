import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { federalStates } from "../../data/federalStates";
import "./setting.css";

function Settings() {
  const { user } = useAuth();

  const [weeklyHours, setWeeklyHours] = useState("");
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [federalState, setFederalState] = useState("");

  useEffect(() => {
    if (user?.id) {
      loadSettings();
    }
  }, [user?.id]);

  /**
   * Wochenarbeitszeit aus SQLite laden
   */

  async function loadSettings() {
    if (!user?.id) return;

    try {
      const minutes = await window.database.getWeeklyWorkMinutes(user.id);

      const savedFederalState = await window.database.getFederalState(user.id);

      const hours = minutes / 60;

      setWeeklyHours(String(hours));
      setFederalState(savedFederalState);
    } catch (error) {
      console.error("Einstellungen konnten nicht geladen werden:", error);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Wochenarbeitszeit speichern
   */
  async function saveSettings() {
    if (!user) return;

    const hours = Number(weeklyHours.replace(",", "."));

    if (!Number.isFinite(hours) || hours <= 0 || hours > 168) {
      alert(
        "Bitte eine gültige Wochenarbeitszeit zwischen 1 und 168 Stunden eingeben.",
      );
      return;
    }

    if (!federalState) {
      alert("Bitte ein Bundesland auswählen.");
      return;
    }

    const minutes = Math.round(hours * 60);

    try {
      // Wochenarbeitszeit speichern
      await window.database.saveWeeklyWorkMinutes(user.id, minutes);

      // Bundesland speichern
      await window.database.saveFederalState(user.id, federalState);

      setSaved(true);

      setTimeout(() => {
        setSaved(false);
      }, 2000);
    } catch (error) {
      console.error("Einstellungen konnten nicht gespeichert werden:", error);

      alert("Die Einstellungen konnten nicht gespeichert werden.");
    }
  }

  if (loading) {
    return (
      <div className="settings-loading">
        <h1>Einstellungen</h1>
        <p>Einstellungen werden geladen...</p>
      </div>
    );
  }

  return (
    <div className="settings-container">
      <h1>Einstellungen</h1>

      <h2>Zeiterfassung</h2>

      <div className="settings-field">
        <label htmlFor="weeklyHours">Wochenarbeitszeit:</label>
        <input
          id="weeklyHours"
          type="number"
          min="1"
          max="168"
          step="0.25"
          value={weeklyHours}
          onChange={(e) => setWeeklyHours(e.target.value)}
        />

        <span> Stunden</span>
      </div>

      <div className="settings-field">
        <label htmlFor="federalState">Bundesland:</label>

        <select
          id="federalState"
          value={federalState}
          onChange={(e) => setFederalState(e.target.value)}
        >
          <option value="">Bitte auswählen</option>

          {federalStates.map((state) => (
            <option key={state.code} value={state.code}>
              {state.name}
            </option>
          ))}
        </select>
      </div>
      <br />

      <button className="settings-save-button" onClick={saveSettings}>
        Speichern
      </button>

      {saved && (
        <p className="settings-success">
          ✅ Wochenarbeitszeit und Bundesland wurden gespeichert.
        </p>
      )}
    </div>
  );
}

export default Settings;
