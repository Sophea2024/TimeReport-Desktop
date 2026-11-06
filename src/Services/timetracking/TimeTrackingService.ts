import { WorkSession, WorkSessionStatus } from "../../types/WorkSession";

const MAX_WORK_MINUTES = 600; // 10 Stunden

const REQUIRED_REST_MINUTES = 11 * 60;

class TimeTrackingService {
  private currentSession: WorkSession | null = null;

  // ==================================================
  // AKTUELLE SITZUNG
  // ==================================================

  getCurrentSession(): WorkSession | null {
    return this.currentSession;
  }

  // ==================================================
  // 11 STUNDEN RUHEZEIT PRÜFEN
  // ==================================================

  async canStartWork(userId: string): Promise<{
    allowed: boolean;
    message?: string;
    earliestStart?: Date;
  }> {
    try {
      const sessions = await this.getWorkSessions(userId);

      const finishedSessions = sessions.filter(
        (session) =>
          session.status !== "sick" &&
          Boolean(session.workEnd ?? session.logoutTime),
      );

      if (finishedSessions.length === 0) {
        return {
          allowed: true,
        };
      }

      const lastSession = finishedSessions.reduce<WorkSession | null>(
        (latest, session) => {
          if (!latest) {
            return session;
          }

          const latestEnd = latest.workEnd ?? latest.logoutTime;
          const sessionEnd = session.workEnd ?? session.logoutTime;

          if (!latestEnd) {
            return session;
          }

          if (!sessionEnd) {
            return latest;
          }

          return sessionEnd.getTime() > latestEnd.getTime() ? session : latest;
        },
        null,
      );

      if (!lastSession) {
        return {
          allowed: true,
        };
      }

      const lastWorkEnd = lastSession.workEnd ?? lastSession.logoutTime;

      if (!lastWorkEnd) {
        return {
          allowed: true,
        };
      }

      const earliestStart = new Date(
        lastWorkEnd.getTime() + REQUIRED_REST_MINUTES * 60 * 1000,
      );

      const now = new Date();

      if (now < earliestStart) {
        const earliestTime = earliestStart.toLocaleString("de-DE", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });

        return {
          allowed: false,
          earliestStart,
          message:
            `Der Arbeitsbeginn ist noch nicht möglich. ` +
            `Zwischen zwei Arbeitstagen müssen mindestens ` +
            `11 Stunden Ruhezeit liegen.\n\n` +
            `Letztes Arbeitsende: ${lastWorkEnd.toLocaleString("de-DE", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })} Uhr\n` +
            `Frühester Arbeitsbeginn: ${earliestTime} Uhr`,
        };
      }

      return {
        allowed: true,
      };
    } catch (error) {
      console.error("Ruhezeit konnte nicht geprüft werden:", error);

      return {
        allowed: false,
        message: "Die vorgeschriebene Ruhezeit konnte nicht geprüft werden.",
      };
    }
  }

  // ==================================================
  // NEUE ARBEITSSITZUNG STARTEN
  // ==================================================

  createSession(
    userId: string,
    workLocation: "office" | "homeoffice" | "business_trip",
  ): WorkSession {
    if (this.currentSession) {
      return this.currentSession;
    }

    const now = new Date();

    const session: WorkSession = {
      id: crypto.randomUUID(),
      userId,
      date: this.formatDate(now),
      workLocation,
      loginTime: now,
      workStart: now,

      // Erstes Arbeitsintervall direkt beim Arbeitsbeginn anlegen
      workIntervals: [
        {
          id: crypto.randomUUID(),
          start: now,
        },
      ],

      pauses: [],
      totalPauseMinutes: 0,
      totalWorkMinutes: 0,
      status: "in_progress",
    };

    console.log("DEBUG – Session vor Zuweisung:", {
      date: session.date,
      workStart: session.workStart,
      workIntervals: session.workIntervals,
    });

    this.currentSession = session;
    this.saveCurrentSession();

    console.log("=================================");
    console.log("ARBEITSBEGINN");
    console.log("Start:", now);
    console.log("Arbeitsort:", workLocation);
    console.log("=================================");

    return session;
  }

  // ==================================================
  // KRANKHEITSTAG ERSTELLEN
  // ==================================================

  async createSickDay(userId: string, date: Date): Promise<boolean> {
    try {
      const sickDay: WorkSession = {
        id: crypto.randomUUID(),
        userId,
        date: this.formatDate(date),
        workLocation: "sick",
        loginTime: date,
        workStart: date,
        workEnd: date,
        logoutTime: date,
        totalPauseMinutes: 0,
        totalWorkMinutes: 0,
        status: "sick",
      };

      const result = await window.database.saveWorkSession(sickDay);

      console.log("=================================");
      console.log("KRANKHEITSTAG GESPEICHERT");
      console.log("Datum:", sickDay.date);
      console.log("Status:", sickDay.status);
      console.log("=================================");

      return !!result;
    } catch (error) {
      console.error("Krankheitstag konnte nicht gespeichert werden:", error);

      return false;
    }
  }

  async hasSickDay(userId: string, date: Date): Promise<boolean> {
    const dateString = this.formatDate(date);
    const sessions = await this.getWorkSessions(userId);

    return sessions.some(
      (session) => session.date === dateString && session.status === "sick",
    );
  }

  // ==================================================
  // PAUSE STARTEN
  // ==================================================

  startPause(): boolean {
    if (!this.currentSession) {
      return false;
    }

    const session = this.currentSession;
    const pauses = session.pauses ?? [];

    // Keine neue Pause starten, solange eine andere offen ist
    if (pauses.some((pause) => !pause.end)) {
      return false;
    }

    // Kompatibilität mit alten, noch offenen Pausen
    if (session.pauseStart && !session.pauseEnd) {
      return false;
    }

    const now = new Date();

    // Arbeitsintervall abschließen
    const intervals = [...(session.workIntervals ?? [])];

    if (intervals.length === 0) {
      if (!session.workStart) {
        console.error("Kein Arbeitsbeginn für das Intervall vorhanden.");
        return false;
      }

      intervals.push({
        id: crypto.randomUUID(),
        start: session.workStart,
        end: now,
      });
    } else {
      const lastInterval = intervals[intervals.length - 1];

      if (!lastInterval.end) {
        intervals[intervals.length - 1] = {
          ...lastInterval,
          end: now,
        };
      }
    }

    session.workIntervals = intervals;

    session.workIntervals = [...intervals];
    console.log("Arbeitsintervalle nach Pausenstart:", session.workIntervals);
    console.log(
      "Arbeitsintervalle nach Pausenstart:",
      JSON.stringify(session.workIntervals),
    );

    // Neue Pause anlegen
    session.pauses = [
      ...pauses,
      {
        id: crypto.randomUUID(),
        start: now,
      },
    ];

    // Legacy-Felder beibehalten
    session.pauseStart = now;
    session.pauseEnd = undefined;

    this.saveCurrentSession();

    console.log("Arbeitsintervalle nach Pausenstart:", session.workIntervals);

    console.log("Pause gestartet:", now);

    return true;
  }

  // ==================================================
  // PAUSE BEENDEN
  // ==================================================

  endPause(): boolean {
    if (!this.currentSession) {
      return false;
    }

    const session = this.currentSession;
    const now = new Date();
    const pauses = session.pauses ?? [];

    const openPause = [...pauses].reverse().find((pause) => !pause.end);

    if (openPause) {
      if (now.getTime() < new Date(openPause.start).getTime()) {
        console.error("Ungültige Pausenzeit.");
        return false;
      }

      // Pause beenden
      session.pauses = pauses.map((pause) =>
        pause.id === openPause.id ? { ...pause, end: now } : pause,
      );

      // Neues Arbeitsintervall beginnen
      session.workIntervals = [
        ...(session.workIntervals ?? []),
        {
          id: crypto.randomUUID(),
          start: now,
        },
      ];

      // Legacy-Felder synchronisieren
      session.pauseEnd = now;

      // Gesamte Pausenzeit neu berechnen
      session.totalPauseMinutes = session.pauses.reduce((total, pause) => {
        if (!pause.end) return total;

        return (
          total +
          Math.max(
            0,
            Math.round(
              (new Date(pause.end).getTime() -
                new Date(pause.start).getTime()) /
                60000,
            ),
          )
        );
      }, 0);

      this.saveCurrentSession();

      console.log("Pause beendet:", now);
      console.log("Gesamte Pausenzeit:", session.totalPauseMinutes);

      return true;
    }

    // Kompatibilität mit älteren Sitzungen ohne Pausenliste
    if (!session.pauseStart || session.pauseEnd) {
      return false;
    }

    const pauseStart = session.pauseStart;

    if (now.getTime() < pauseStart.getTime()) {
      console.error("Ungültige Pausenzeit.");
      return false;
    }

    session.pauseEnd = now;

    session.pauses = [
      ...pauses,
      {
        id: crypto.randomUUID(),
        start: pauseStart,
        end: now,
      },
    ];

    session.workIntervals = [
      ...(session.workIntervals ?? []),
      {
        id: crypto.randomUUID(),
        start: now,
      },
    ];

    session.totalPauseMinutes = session.pauses.reduce((total, pause) => {
      if (!pause.end) return total;

      return (
        total +
        Math.max(
          0,
          Math.round(
            (new Date(pause.end).getTime() - new Date(pause.start).getTime()) /
              60000,
          ),
        )
      );
    }, 0);

    this.saveCurrentSession();

    console.log("Pause beendet:", now);
    console.log("Gesamte Pausenzeit:", session.totalPauseMinutes);

    return true;
  }

  // ==================================================
  // ARBEIT BEENDEN
  // ==================================================

  endWork(): {
    success: boolean;
    status?: WorkSessionStatus;
    message?: string;
  } {
    if (!this.currentSession) {
      return {
        success: false,
        message: "Keine aktive Arbeitszeit vorhanden.",
      };
    }

    const session = this.currentSession;
    const now = new Date();

    // ------------------------------------------------
    // Falls gerade eine Pause läuft
    // ------------------------------------------------

    if (session.pauseStart && !session.pauseEnd) {
      this.endPause();
    }

    const workMinutes = this.calculateWorkMinutesUntil(session, now);

    const pauseValidation = this.validatePauseRequirement(
      workMinutes,
      session.totalPauseMinutes,
    );

    if (!pauseValidation.valid) {
      return {
        success: false,
        message: pauseValidation.message,
      };
    }

    // ------------------------------------------------
    // NORMALES ARBEITSENDE
    // ------------------------------------------------

    const intervals = session.workIntervals ?? [];

    if (intervals.length > 0) {
      const lastInterval = intervals[intervals.length - 1];

      if (!lastInterval.end) {
        lastInterval.end = now;
      }
    } else {
      session.workIntervals = [
        {
          id: crypto.randomUUID(),
          start: session.workStart,
          end: now,
        },
      ];
    }

    session.workEnd = now;
    session.logoutTime = now;

    session.totalWorkMinutes = Math.max(0, workMinutes);

    session.status =
      workMinutes > MAX_WORK_MINUTES || !pauseValidation.valid
        ? "needs_correction"
        : "completed";

    this.saveCurrentSession();
    window.database.saveWorkSession(session);

    return {
      success: true,
      status: session.status,
      message:
        session.status === "needs_correction"
          ? "Arbeitszeit gespeichert. Es besteht Prüf- bzw. Korrekturbedarf."
          : "Arbeitszeit erfolgreich beendet.",
    };
  }

  // ==================================================
  // AUTOMATISCHES ARBEITSENDE
  // ==================================================

  /**
   * Prüft eine offene Arbeitszeit.
   *
   * Wenn der Benutzer vergessen hat,
   * auf "Arbeitsende" zu klicken, wird die
   * Arbeitszeit automatisch nach spätestens
   * 10 Stunden geschlossen.
   */

  checkAutomaticEnd(): boolean {
    if (!this.currentSession || this.currentSession.workEnd) {
      return false;
    }

    const now = new Date();

    const workMinutes = this.calculateWorkMinutesUntil(
      this.currentSession,
      now,
    );

    if (workMinutes < MAX_WORK_MINUTES) {
      return false;
    }

    return this.autoCloseCurrentSession();

    return false;
  }

  // ==================================================
  // AKTUELLE SITZUNG AUTOMATISCH SCHLIESSEN
  // ==================================================

  private autoCloseCurrentSession(): boolean {
    if (!this.currentSession) {
      return false;
    }

    const session = this.currentSession;

    if (!session.workStart) {
      return false;
    }

    /*
     * Wir suchen den Zeitpunkt, an dem genau
     * 10 Stunden Nettoarbeitszeit erreicht wurden.
     *
     * Die bereits genommenen Pausen werden dabei
     * berücksichtigt.
     */

    const automaticEnd = this.calculateAutomaticEndTime(session);

    session.workEnd = automaticEnd;
    session.logoutTime = automaticEnd;

    session.totalWorkMinutes = this.calculateWorkMinutesUntil(
      session,
      automaticEnd,
    );

    // Sicherheit: niemals > 600
    session.totalWorkMinutes = Math.min(
      MAX_WORK_MINUTES,
      Math.max(0, session.totalWorkMinutes),
    );

    session.status = "auto_closed";

    this.saveCurrentSession();

    window.database.saveWorkSession(session);

    console.log("=================================");
    console.log("ARBEITSZEIT AUTOMATISCH BEENDET");
    console.log("Automatisches Ende:", automaticEnd);
    console.log("Arbeitszeit:", this.formatMinutes(session.totalWorkMinutes));
    console.log("Pause:", session.totalPauseMinutes);
    console.log("Status:", "auto_closed");
    console.log("=================================");

    return true;
  }

  // ==================================================
  // AUTOMATISCHES ENDE BERECHNEN
  // ==================================================

  private calculateAutomaticEndTime(session: WorkSession): Date {
    if (!session.workStart) {
      return new Date();
    }

    /*
     * Netto = Brutto - Pause
     *
     * Für 10 Stunden Nettoarbeitszeit:
     *
     * Ende = Beginn
     *      + 600 Minuten
     *      + bereits genommene Pausen
     */

    const endTime = new Date(
      session.workStart.getTime() +
        (MAX_WORK_MINUTES + session.totalPauseMinutes) * 60 * 1000,
    );

    return endTime;
  }

  // ==================================================
  // ARBEITSZEIT BIS ZU EINEM ZEITPUNKT
  // ==================================================

  private calculateWorkMinutesUntil(
    session: WorkSession,
    endTime: Date,
  ): number {
    if (!session.workStart || endTime.getTime() < session.workStart.getTime()) {
      return 0;
    }

    // Neue Arbeitsintervalle verwenden, wenn vorhanden
    if (session.workIntervals && session.workIntervals.length > 0) {
      return session.workIntervals.reduce((total, interval) => {
        const intervalStart = new Date(interval.start).getTime();

        if (intervalStart >= endTime.getTime()) {
          return total;
        }

        const intervalEnd = interval.end
          ? Math.min(new Date(interval.end).getTime(), endTime.getTime())
          : endTime.getTime();

        return (
          total + Math.max(0, Math.round((intervalEnd - intervalStart) / 60000))
        );
      }, 0);
    }

    // Kompatibilität mit älteren Sitzungen ohne Arbeitsintervalle
    const grossMinutes = Math.round(
      (endTime.getTime() - new Date(session.workStart).getTime()) / 60000,
    );

    let pauseMinutes = 0;

    if (session.pauses && session.pauses.length > 0) {
      pauseMinutes = session.pauses.reduce((total, pause) => {
        const pauseStart = new Date(pause.start).getTime();

        if (pauseStart >= endTime.getTime()) {
          return total;
        }

        const pauseEnd = pause.end
          ? Math.min(new Date(pause.end).getTime(), endTime.getTime())
          : endTime.getTime();

        return total + Math.max(0, Math.round((pauseEnd - pauseStart) / 60000));
      }, 0);
    } else {
      pauseMinutes = session.totalPauseMinutes ?? 0;

      if (session.pauseStart && !session.pauseEnd) {
        pauseMinutes += Math.max(
          0,
          Math.round(
            (endTime.getTime() - new Date(session.pauseStart).getTime()) /
              60000,
          ),
        );
      }
    }

    return Math.max(0, grossMinutes - pauseMinutes);
  }

  // ==================================================
  // ARBEITSZEIT BERECHNEN
  // ==================================================

  calculateWorkMinutes(session: WorkSession): number {
    if (!session.workStart || !session.workEnd) {
      return 0;
    }

    return Math.max(
      0,
      this.calculateWorkMinutesUntil(session, session.workEnd),
    );
  }

  // ==================================================
  // ERFORDERLICHE PAUSE
  // ==================================================

  private getRequiredPauseMinutes(workMinutes: number): number {
    if (workMinutes > 9 * 60) {
      return 45;
    }

    if (workMinutes > 6 * 60) {
      return 30;
    }

    return 0;
  }

  // ==================================================
  // PAUSENPRÜFUNG
  // ==================================================

  private validatePauseRequirement(
    workMinutes: number,
    pauseMinutes: number,
  ): {
    valid: boolean;
    requiredPauseMinutes: number;
    missingPauseMinutes: number;
    message?: string;
  } {
    const requiredPauseMinutes = this.getRequiredPauseMinutes(workMinutes);

    const missingPauseMinutes = Math.max(
      0,
      requiredPauseMinutes - pauseMinutes,
    );

    if (missingPauseMinutes > 0) {
      return {
        valid: false,
        requiredPauseMinutes,
        missingPauseMinutes,
        message:
          workMinutes > 9 * 60
            ? `Bei mehr als 9 Stunden Arbeitszeit sind insgesamt 45 Minuten Pause erforderlich. Es fehlen noch ${missingPauseMinutes} Minuten.`
            : `Bei mehr als 6 Stunden Arbeitszeit sind insgesamt 30 Minuten Pause erforderlich. Es fehlen noch ${missingPauseMinutes} Minuten.`,
      };
    }

    return {
      valid: true,
      requiredPauseMinutes,
      missingPauseMinutes: 0,
    };
  }

  // ==================================================
  // VALIDIERUNG
  // ==================================================

  validateWorkSession(session: WorkSession): {
    valid: boolean;
    message?: string;
  } {
    // Krankheitstage benötigen keine Arbeitsintervalle.
    if (session.status === "sick" || session.workLocation === "sick") {
      return { valid: true };
    }

    if (!session.workStart || !session.workEnd) {
      return {
        valid: false,
        message: "Arbeitsbeginn oder Arbeitsende fehlt.",
      };
    }

    const start = session.workStart.getTime();
    const end = session.workEnd.getTime();

    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return {
        valid: false,
        message: "Arbeitsende muss nach Arbeitsbeginn liegen.",
      };
    }

    if (
      !Number.isFinite(session.totalPauseMinutes) ||
      session.totalPauseMinutes < 0
    ) {
      return {
        valid: false,
        message: "Die Pausenzeit ist ungültig.",
      };
    }

    if (session.totalPauseMinutes > 24 * 60) {
      return {
        valid: false,
        message: "Die Pausenzeit ist unrealistisch.",
      };
    }

    const workMinutes = this.calculateWorkMinutes(session);

    if (!Number.isFinite(workMinutes) || workMinutes < 0) {
      return {
        valid: false,
        message: "Die berechnete Arbeitszeit ist ungültig.",
      };
    }

    return { valid: true };
  }

  // ==================================================
  // ARBEITSZEIT AKTUALISIEREN
  // ==================================================

  async updateWorkSession(session: WorkSession): Promise<boolean> {
    try {
      const normalized = this.deserializeSession(session);

      const validation = this.validateWorkSession(normalized);

      if (!validation.valid) {
        console.error(validation.message);
        return false;
      }

      // Arbeitszeit anhand der gespeicherten Intervalle neu berechnen.
      normalized.totalWorkMinutes = this.calculateWorkMinutes(normalized);

      // Den vom Benutzer ausgewählten Status beibehalten.
      // Nicht automatisch auf "completed" zurücksetzen.
      normalized.status = session.status ?? "completed";

      const result = await window.database.updateWorkSession(normalized);

      return !!result;
    } catch (error) {
      console.error("Arbeitszeit konnte nicht aktualisiert werden:", error);
      return false;
    }
  }

  // ==================================================
  // ARBEITSZEIT LÖSCHEN
  // ==================================================

  async deleteWorkSession(sessionId: string): Promise<boolean> {
    try {
      const result = await window.database.deleteWorkSession(sessionId);

      return !!result;
    } catch (error) {
      console.error("Arbeitszeit konnte nicht gelöscht werden:", error);

      return false;
    }
  }

  // ==================================================
  // ALLE ARBEITSZEITEN LADEN
  // ==================================================

  async getWorkSessions(userId?: string): Promise<WorkSession[]> {
    try {
      let sessions: WorkSession[];

      if (userId) {
        sessions = await window.database.getWorkSessionsByUser(userId);
      } else {
        sessions = await window.database.getWorkSessions();
      }

      return sessions.map((session: WorkSession) =>
        this.deserializeSession(session),
      );
    } catch (error) {
      console.error("Arbeitszeiten konnten nicht geladen werden:", error);

      return [];
    }
  }

  // ==================================================
  // OFFENE SITZUNG SPEICHERN
  // ==================================================

  private saveCurrentSession(): void {
    if (!this.currentSession) {
      return;
    }

    const session = { ...this.currentSession };

    console.log("DEBUG – currentSession vor dem Speichern:", {
      date: this.currentSession.date,
      workStart: this.currentSession.workStart,
      workEnd: this.currentSession.workEnd,
      workIntervals: this.currentSession.workIntervals,
      pauses: this.currentSession.pauses,
    });

    localStorage.setItem("currentSession", JSON.stringify(session));

    console.log(
      "DEBUG – Session-Kopie:",
      session.date,
      session.id,
      session.workIntervals,
    );

    // Zusätzlich sofort in SQLite speichern
    void Promise.resolve(window.database.saveWorkSession(session)).catch(
      (error) => {
        console.error(
          "Aktuelle Arbeitssitzung konnte nicht gespeichert werden:",
          error,
        );
      },
    );
  }

  // ==================================================
  // SITZUNG LADEN
  // ==================================================

  loadSession(): WorkSession | null {
    const data = localStorage.getItem("currentSession");

    if (!data) {
      this.currentSession = null;
      return null;
    }

    try {
      const session = JSON.parse(data);

      this.currentSession = this.deserializeSession(session);

      // Prüfen, ob die Sitzung automatisch beendet werden muss
      const wasAutoClosed = this.checkAutomaticEnd();

      /*
       * Wenn die alte Sitzung automatisch beendet wurde,
       * wurde sie bereits in SQLite gespeichert.
       *
       * Sie darf NICHT mehr als aktuelle Arbeitssitzung
       * bestehen bleiben.
       *
       * Dadurch kann der Benutzer direkt einen neuen
       * Arbeitstag starten.
       */
      if (wasAutoClosed) {
        console.log("Alte Arbeitszeit wurde automatisch beendet.");

        this.clearSession();

        return null;
      }

      return this.currentSession;
    } catch (error) {
      console.error("Arbeitszeit konnte nicht geladen werden:", error);

      this.currentSession = null;

      localStorage.removeItem("currentSession");

      return null;
    }
  }

  // ==================================================
  // SITZUNG LÖSCHEN
  // ==================================================

  clearSession(): void {
    this.currentSession = null;

    localStorage.removeItem("currentSession");
  }

  getLastEndedSession(): WorkSession | null {
    return this.currentSession;
  }

  restoreSession(session: WorkSession): void {
    this.currentSession = session;

    localStorage.setItem("currentSession", JSON.stringify(session));
  }

  // ==================================================
  // SESSION DESERIALISIEREN
  // ==================================================

  private deserializeSession(session: WorkSession): WorkSession {
    return {
      ...session,

      loginTime: new Date(session.loginTime),

      workStart: new Date(session.workStart),

      logoutTime: session.logoutTime ? new Date(session.logoutTime) : undefined,

      workEnd: session.workEnd ? new Date(session.workEnd) : undefined,

      pauseStart: session.pauseStart ? new Date(session.pauseStart) : undefined,

      pauseEnd: session.pauseEnd ? new Date(session.pauseEnd) : undefined,

      pauses: Array.isArray(session.pauses)
        ? session.pauses.map(
            (pause: {
              id: string;
              start: Date | string;
              end?: Date | string | null;
            }) => ({
              id: pause.id,
              start: new Date(pause.start),
              end: pause.end ? new Date(pause.end) : undefined,
            }),
          )
        : typeof session.pauses === "string"
          ? JSON.parse(session.pauses).map(
              (pause: { id: string; start: string; end?: string | null }) => ({
                id: pause.id,
                start: new Date(pause.start),
                end: pause.end ? new Date(pause.end) : undefined,
              }),
            )
          : [],

      workIntervals: (() => {
        try {
          const intervals =
            typeof session.workIntervals === "string"
              ? JSON.parse(session.workIntervals)
              : session.workIntervals;

          if (!Array.isArray(intervals)) {
            return [];
          }

          return intervals.map(
            (interval: {
              id?: string;
              start: Date | string;
              end?: Date | string | null;
            }) => ({
              id:
                typeof interval.id === "string" && interval.id.length > 0
                  ? interval.id
                  : crypto.randomUUID(),
              start: new Date(interval.start),
              end: interval.end ? new Date(interval.end) : undefined,
            }),
          );
        } catch (error) {
          console.error(
            "Arbeitsintervalle konnten nicht umgewandelt werden:",
            error,
          );
          return [];
        }
      })(),

      totalPauseMinutes: session.totalPauseMinutes ?? 0,

      totalWorkMinutes: session.totalWorkMinutes ?? 0,

      status: session.status ?? (session.workEnd ? "completed" : "in_progress"),
    };
  }

  // ==================================================
  // DATUM YYYY-MM-DD
  // ==================================================

  private formatDate(date: Date): string {
    const year = date.getFullYear();

    const month = String(date.getMonth() + 1).padStart(2, "0");

    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  // ==================================================
  // MINUTEN -> HH:MM
  // ==================================================

  private formatMinutes(minutes: number): string {
    const hours = Math.floor(minutes / 60);

    const remainingMinutes = minutes % 60;

    return `${hours}h ${String(remainingMinutes).padStart(2, "0")}min`;
  }
}

export const timeTrackingService = new TimeTrackingService();
