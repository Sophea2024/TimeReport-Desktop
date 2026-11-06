import { useEffect, useState } from "react";
import "./TimeTracking.css";
import { timeTrackingService } from "../../Services/timetracking/TimeTrackingService";
import { useAuth } from "../../context/AuthContext";

type WorkLocation = "office" | "homeoffice" | "business_trip";

function TimeTracking() {
  const [startTime, setStartTime] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [pauseStart, setPauseStart] = useState("");
  const [isPaused, setIsPaused] = useState(false);
  const [hasSickDay, setHasSickDay] = useState(false);

  const [pauseEnd, setPauseEnd] = useState("");
  const [pauseMinutes, setPauseMinutes] = useState(0);

  const [workLocation, setWorkLocation] = useState<WorkLocation>("office");

  //const [undoSession, setUndoSession] = useState<WorkSession | null>(null);

  const { user } = useAuth();

  useEffect(() => {
    async function loadTimeTracking() {
      timeTrackingService.loadSession();
      refreshUI();

      if (!user) return;

      const today = new Date();

      const sickDayExists = await timeTrackingService.hasSickDay(
        user.id,
        today,
      );

      setHasSickDay(sickDayExists);
    }

    loadTimeTracking();
  }, [user]);

  function refreshUI() {
    const session = timeTrackingService.getCurrentSession();

    if (!session) {
      setIsWorking(false);
      setIsPaused(false);
      setStartTime("");
      setPauseStart("");
      setPauseEnd("");
      setPauseMinutes(0);
      return;
    }

    setIsWorking(true);

    setStartTime(
      session.workStart?.toLocaleTimeString("de-DE", {
        hour: "2-digit",
        minute: "2-digit",
      }) ?? "",
    );

    setPauseStart(
      session.pauseStart?.toLocaleTimeString("de-DE", {
        hour: "2-digit",
        minute: "2-digit",
      }) ?? "",
    );

    setPauseEnd(
      session.pauseEnd?.toLocaleTimeString("de-DE", {
        hour: "2-digit",
        minute: "2-digit",
      }) ?? "",
    );

    setPauseMinutes(session.totalPauseMinutes);

    setIsPaused(
      !!session.pauseStart &&
        (!session.pauseEnd ||
          session.pauseEnd.getTime() < session.pauseStart.getTime()),
    );

    if (session.workLocation) {
      setWorkLocation(session.workLocation as WorkLocation);
    }
  }

  async function handleStart() {
    if (isWorking) return;

    if (!user) {
      alert("Kein Benutzer angemeldet.");
      return;
    }

    const vacations = await window.database.getVacations(user.id);

    const today = new Date();
    const todayString =
      `${today.getFullYear()}-` +
      `${String(today.getMonth() + 1).padStart(2, "0")}-` +
      `${String(today.getDate()).padStart(2, "0")}`;

    const approvedVacation = vacations.find(
      (vacation) =>
        vacation.status === "approved" &&
        vacation.startDate <= todayString &&
        vacation.endDate >= todayString,
    );

    if (approvedVacation) {
      const confirmed = window.confirm(
        "Für heute ist bereits Urlaub genehmigt.\n\n" +
          "Möchtest du trotzdem die Arbeit beginnen?",
      );

      if (!confirmed) {
        return;
      }
    }

    const restCheck = await timeTrackingService.canStartWork(user.id);

    if (!restCheck.allowed) {
      alert(
        restCheck.message ?? "Der Arbeitsbeginn ist derzeit nicht möglich.",
      );

      return;
    }

    timeTrackingService.createSession(user.id, workLocation);

    refreshUI();
  }

  function handlePause() {
    if (!isWorking) return;

    if (isPaused) {
      timeTrackingService.endPause();
    } else {
      timeTrackingService.startPause();
    }

    refreshUI();
  }

  function handleStop() {
    if (!isWorking) return;

    const session = timeTrackingService.getCurrentSession();

    if (!session) return;

    const result = timeTrackingService.endWork();

    if (!result.success) {
      alert(result.message ?? "Arbeitszeit konnte nicht beendet werden.");
      return;
    }

    // Dieselbe Sitzung für eine mögliche Korrektur aufbewahren.
    //setUndoSession({ ...session });

    timeTrackingService.clearSession();
    refreshUI();
  }

  async function handleSickDay() {
    if (isWorking) return;

    if (!user) {
      alert("Kein Benutzer angemeldet.");
      return;
    }

    const today = new Date();

    const success = await timeTrackingService.createSickDay(user.id, today);

    if (success) {
      setHasSickDay(true);
      alert("Krankheitstag wurde erfolgreich erfasst.");
    }
  }

  return (
    <div className="tracker-card">
      <h2>Zeiterfassung</h2>

      <div className="work-location">
        <p>
          <strong>Arbeitsort</strong>
        </p>

        <div className="work-location-options">
          <label>
            <input
              type="radio"
              value="office"
              checked={workLocation === "office"}
              onChange={() => setWorkLocation("office")}
              disabled={isWorking}
            />
            🏢 Vor Ort
          </label>

          <label>
            <input
              type="radio"
              value="homeoffice"
              checked={workLocation === "homeoffice"}
              onChange={() => setWorkLocation("homeoffice")}
              disabled={isWorking}
            />
            🏠 Homeoffice
          </label>

          <label>
            <input
              type="radio"
              value="business_trip"
              checked={workLocation === "business_trip"}
              onChange={() => setWorkLocation("business_trip")}
              disabled={isWorking}
            />
            🚗 Dienstreise
          </label>
        </div>
      </div>

      <button className="start-btn" onClick={handleStart} disabled={isWorking}>
        ▶ Arbeitsbeginn
      </button>

      {startTime && (
        <div className="time-info">
          <strong>Arbeitsbeginn:</strong> {startTime} Uhr
        </div>
      )}

      {pauseStart && (
        <div className="time-info">
          <strong>Pausenbeginn:</strong> {pauseStart} Uhr
        </div>
      )}

      <button className="pause-btn" onClick={handlePause} disabled={!isWorking}>
        {isPaused ? "▶ Pause beenden" : "⏸ Pause starten"}
      </button>

      {pauseEnd && (
        <div className="time-info">
          <strong>Pausenende:</strong> {pauseEnd} Uhr
        </div>
      )}

      {pauseMinutes > 0 && (
        <div className="time-info">
          <strong>Pausendauer:</strong> {pauseMinutes} Minuten
        </div>
      )}

      <button className="stop-btn" onClick={handleStop} disabled={!isWorking}>
        ■ Arbeitsende
      </button>

      <button
        className="sick-day-button"
        onClick={handleSickDay}
        disabled={isWorking || hasSickDay}
      >
        {hasSickDay ? "Heute als krank erfasst" : "Krankheitstag erfassen"}
      </button>
    </div>
  );
}

export default TimeTracking;
