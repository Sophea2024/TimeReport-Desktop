import Database from "better-sqlite3";
import { WorkSession } from "../../src/types/WorkSession";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { Vacation } from "../../src/types/Vacation";
import { Sickness } from "../../src/types/Sickness";
import type { OvertimeTransaction } from "../../src/types/OvertimeTransaction";
import bcrypt from "bcryptjs";

export interface UserSettings {
  userId: string;
  weeklyWorkMinutes: number;
  federalState: string;
}

export interface User {
  id: string;
  username: string;
  password: string;
  displayName: string;
  role: string;
}

class DatabaseService {
  private db: Database.Database;
  private dbPath: string;

  constructor() {
    this.dbPath = path.join(app.getPath("userData"), "timereport.db");

    console.log("process.cwd():", process.cwd());
    console.log("dbPath:", this.dbPath);
    console.log("Vorher vorhanden:", fs.existsSync(this.dbPath));

    this.db = new Database(this.dbPath);

    console.log("Nachher vorhanden:", fs.existsSync(this.dbPath));

    this.initialize();
  }

  public async backupDatabase(destinationPath: string): Promise<void> {
    await this.db.backup(destinationPath);
  }

  public getDatabasePath(): string {
    return this.dbPath;
  }

  public closeDatabase(): void {
    if (this.db.open) {
      this.db.close();
      console.log("Datenbank wurde geschlossen.");
    }
  }

  private initialize() {
    // ==================================================
    // Benutzer
    // ==================================================

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        displayName TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'Mitarbeiter'
      );
    `);

    // ==================================================
    // WorkSessions
    // ==================================================

    this.db.exec(`
  CREATE TABLE IF NOT EXISTS work_sessions (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    date TEXT NOT NULL,
    workLocation TEXT NOT NULL,
    loginTime TEXT,
    logoutTime TEXT,
    workStart TEXT,
    workEnd TEXT,
    pauseStart TEXT,
    pauseEnd TEXT,
    totalPauseMinutes INTEGER,
    totalWorkMinutes INTEGER,
    status TEXT DEFAULT 'completed'
  );

  CREATE TABLE IF NOT EXISTS overtime_transactions (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    date TEXT NOT NULL,
    minutes INTEGER NOT NULL,
    type TEXT NOT NULL,
    days INTEGER NOT NULL DEFAULT 0,
    note TEXT
  );
`);

    try {
      this.db.exec(`
    ALTER TABLE work_sessions
    ADD COLUMN status TEXT DEFAULT 'completed';
  `);
    } catch {
      // Spalte existiert bereits
    }

    // Mehrere Pausen pro Arbeitstag speichern können
    const workSessionColumns = this.db
      .prepare("PRAGMA table_info(work_sessions)")
      .all() as Array<{ name: string }>;

    if (!workSessionColumns.some((column) => column.name === "pauses")) {
      this.db.exec(`
        ALTER TABLE work_sessions
        ADD COLUMN pauses TEXT;
      `);
    }

    const workSessionColumnsAfterPauses = this.db
      .prepare("PRAGMA table_info(work_sessions)")
      .all() as Array<{ name: string }>;

    if (
      !workSessionColumnsAfterPauses.some(
        (column) => column.name === "workIntervals",
      )
    ) {
      this.db.exec(`
    ALTER TABLE work_sessions
    ADD COLUMN workIntervals TEXT;
  `);
    }

    // ==================================================
    // Urlaub
    // ==================================================

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vacations (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        startDate TEXT NOT NULL,
        endDate TEXT NOT NULL,
        totalDays INTEGER NOT NULL
      );
    `);

    // =============================================
    // Genehmigungsfelder für Urlaub und Überstunden
    // =============================================

    const approvalColumns: Array<{
      table: "overtime_transactions" | "vacations";
      column: string;
      definition: string;
    }> = [
      {
        table: "overtime_transactions",
        column: "status",
        definition: "TEXT NOT NULL DEFAULT 'approved'",
      },
      {
        table: "overtime_transactions",
        column: "requestedAt",
        definition: "TEXT",
      },
      {
        table: "overtime_transactions",
        column: "decidedAt",
        definition: "TEXT",
      },
      {
        table: "overtime_transactions",
        column: "decidedBy",
        definition: "TEXT",
      },
      {
        table: "overtime_transactions",
        column: "rejectionReason",
        definition: "TEXT",
      },
      {
        table: "vacations",
        column: "status",
        definition: "TEXT NOT NULL DEFAULT 'approved'",
      },
      {
        table: "vacations",
        column: "requestedAt",
        definition: "TEXT",
      },
      {
        table: "vacations",
        column: "decidedAt",
        definition: "TEXT",
      },
      {
        table: "vacations",
        column: "decidedBy",
        definition: "TEXT",
      },
      {
        table: "vacations",
        column: "rejectionReason",
        definition: "TEXT",
      },
    ];

    for (const { table, column, definition } of approvalColumns) {
      const columns = this.db
        .prepare(`PRAGMA table_info(${table})`)
        .all() as Array<{ name: string }>;

      if (!columns.some((item) => item.name === column)) {
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      }
    }

    // ==================================================
    // Urlaubstage pro Benutzer und Jahr
    // ==================================================

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vacation_allowances (
        userId TEXT NOT NULL,
        year INTEGER NOT NULL,
        totalDays INTEGER NOT NULL DEFAULT 30,
        PRIMARY KEY (userId, year)
      );
    `);

    // Alte vacation_allowances-Struktur prüfen
    const vacationAllowanceColumns = this.db
      .prepare(`PRAGMA table_info(vacation_allowances)`)
      .all() as Array<{
      name: string;
    }>;

    const hasDaysColumn = vacationAllowanceColumns.some(
      (column) => column.name === "days",
    );

    const hasTotalDaysColumn = vacationAllowanceColumns.some(
      (column) => column.name === "totalDays",
    );

    // Alte Datenbankstruktur migrieren
    if (hasDaysColumn && !hasTotalDaysColumn) {
      this.db.exec(`
        ALTER TABLE vacation_allowances
        RENAME TO vacation_allowances_old;
      `);

      this.db.exec(`
        CREATE TABLE vacation_allowances (
          userId TEXT NOT NULL,
          year INTEGER NOT NULL,
          totalDays INTEGER NOT NULL DEFAULT 30,
          PRIMARY KEY (userId, year)
        );
      `);

      this.db.exec(`
        INSERT INTO vacation_allowances (
          userId,
          year,
          totalDays
        )
        SELECT
          userId,
          year,
          days
        FROM vacation_allowances_old;
      `);

      this.db.exec(`
        DROP TABLE vacation_allowances_old;
      `);

      console.log("Tabelle vacation_allowances wurde auf totalDays migriert.");
    }

    console.log("Tabelle vacation_allowances geprüft.");

    // ==================================================
    // Benutzereinstellungen
    // ==================================================

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_settings (
        userId TEXT PRIMARY KEY,
        weeklyWorkMinutes INTEGER,
        federalState TEXT
      );
    `);

    try {
      this.db.exec(`
        ALTER TABLE user_settings
        ADD COLUMN federalState TEXT;
      `);
    } catch (error) {
      // Spalte existiert bereits
    }

    const columns = this.db
      .prepare(`PRAGMA table_info(user_settings)`)
      .all() as Array<{
      name: string;
    }>;

    const hasFederalState = columns.some(
      (column) => column.name === "federalState",
    );

    if (!hasFederalState) {
      this.db.exec(`
        ALTER TABLE user_settings
        ADD COLUMN federalState TEXT
        NOT NULL DEFAULT 'Hessen';
      `);

      console.log("Spalte federalState wurde hinzugefügt.");
    }

    const hasWeeklyWorkMinutes = columns.some(
      (column) => column.name === "weeklyWorkMinutes",
    );

    if (!hasWeeklyWorkMinutes) {
      this.db.exec(`
        ALTER TABLE user_settings
        ADD COLUMN weeklyWorkMinutes INTEGER
        NOT NULL DEFAULT 2400;
      `);

      console.log("Spalte weeklyWorkMinutes wurde hinzugefügt.");
    }

    // ==================================================
    // Krankheit
    // ==================================================

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sickness (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        startDate TEXT NOT NULL,
        endDate TEXT NOT NULL,
        totalDays INTEGER NOT NULL
      );
    `);

    console.log("Tabelle sickness geprüft.");

    console.log("Tabelle work_sessions und user_settings geprüft.");
  }

  // ==================================================
  // USER SETTINGS
  // ==================================================

  hasUserSettings(userId: string): boolean {
    const stmt = this.db.prepare(`
      SELECT userId
      FROM user_settings
      WHERE userId = ?
    `);

    const row = stmt.get(userId);

    return !!row;
  }

  getUserSettings(userId: string): UserSettings {
    const stmt = this.db.prepare(`
      SELECT
        userId,
        weeklyWorkMinutes,
        federalState
      FROM user_settings
      WHERE userId = ?
    `);

    const result = stmt.get(userId) as UserSettings | undefined;

    if (!result) {
      const defaultSettings: UserSettings = {
        userId,
        weeklyWorkMinutes: 2400,
        federalState: "Hessen",
      };

      const insertStmt = this.db.prepare(`
        INSERT INTO user_settings (
          userId,
          weeklyWorkMinutes,
          federalState
        )
        VALUES (
          @userId,
          @weeklyWorkMinutes,
          @federalState
        )
      `);

      insertStmt.run(defaultSettings);

      return defaultSettings;
    }

    return result;
  }

  saveWeeklyWorkMinutes(userId: string, minutes: number): void {
    const stmt = this.db.prepare(`
      INSERT INTO user_settings (
        userId,
        weeklyWorkMinutes
      )
      VALUES (
        @userId,
        @weeklyWorkMinutes
      )
      ON CONFLICT(userId)
      DO UPDATE SET
        weeklyWorkMinutes = excluded.weeklyWorkMinutes;
    `);

    stmt.run({
      userId,
      weeklyWorkMinutes: minutes,
    });

    console.log(
      `Wochenarbeitszeit gespeichert: ${userId} = ${minutes} Minuten`,
    );
  }

  saveFederalState(userId: string, federalState: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO user_settings (
        userId,
        federalState
      )
      VALUES (
        @userId,
        @federalState
      )
      ON CONFLICT(userId)
      DO UPDATE SET
        federalState = excluded.federalState;
    `);

    stmt.run({
      userId,
      federalState,
    });

    console.log(`Bundesland gespeichert: ${userId} = ${federalState}`);
  }

  getWeeklyWorkMinutes(userId: string): number {
    const stmt = this.db.prepare(`
      SELECT weeklyWorkMinutes
      FROM user_settings
      WHERE userId = ?
    `);

    const row = stmt.get(userId) as { weeklyWorkMinutes: number } | undefined;

    console.log("WOCHENARBEITSZEIT AUS DB:", userId, row?.weeklyWorkMinutes);

    return row?.weeklyWorkMinutes ?? 2400;
  }

  getFederalState(userId: string): string {
    const stmt = this.db.prepare(`
      SELECT federalState
      FROM user_settings
      WHERE userId = ?
    `);

    const row = stmt.get(userId) as { federalState: string } | undefined;

    return row?.federalState ?? "";
  }

  // ==================================================
  // WORK SESSIONS
  // ==================================================

  saveWorkSession(session: WorkSession) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO work_sessions (
        id,
        userId,
        date,
        workLocation,
        loginTime,
        logoutTime,
        workStart,
        workEnd,
        pauseStart,
        pauseEnd,
        pauses,
        workIntervals,
        totalPauseMinutes,
        totalWorkMinutes,
        status
      )
      VALUES (
        @id,
        @userId,
        @date,
        @workLocation,
        @loginTime,
        @logoutTime,
        @workStart,
        @workEnd,
        @pauseStart,
        @pauseEnd,
        @pauses,
        @workIntervals,
        @totalPauseMinutes,
        @totalWorkMinutes,
        @status
      );
    `);

    if (!session.workIntervals?.length) {
      console.warn("WARNUNG: Keine Arbeitsintervalle beim Speichern!", {
        date: session.date,
        workStart: session.workStart,
        workEnd: session.workEnd,
        totalWorkMinutes: session.totalWorkMinutes,
        totalPauseMinutes: session.totalPauseMinutes,
      });
    }

    console.log("DEBUG – Session vor SQLite-Speicherung:", {
      date: session.date,
      workStart: session.workStart,
      workEnd: session.workEnd,
      workIntervals: session.workIntervals,
      pauses: session.pauses,
      totalPauseMinutes: session.totalPauseMinutes,
      totalWorkMinutes: session.totalWorkMinutes,
    });

    stmt.run({
      id: session.id,
      userId: session.userId,
      date: session.date,
      workLocation: session.workLocation,

      loginTime: session.loginTime?.toISOString() ?? null,
      logoutTime: session.logoutTime?.toISOString() ?? null,
      workStart: session.workStart?.toISOString() ?? null,
      workEnd: session.workEnd?.toISOString() ?? null,
      pauseStart: session.pauseStart?.toISOString() ?? null,
      pauseEnd: session.pauseEnd?.toISOString() ?? null,
      pauses: JSON.stringify(
        (session.pauses ?? []).map((pause) => ({
          id: pause.id,
          start: pause.start?.toISOString(),
          end: pause.end?.toISOString() ?? null,
        })),
      ),

      workIntervals: JSON.stringify(
        (session.workIntervals ?? []).map((interval) => ({
          id: interval.id,
          start: interval.start?.toISOString(),
          end: interval.end?.toISOString() ?? null,
        })),
      ),

      totalPauseMinutes: session.totalPauseMinutes,
      totalWorkMinutes: session.totalWorkMinutes,
      status: session.status,
    });

    console.log("WorkSession in SQLite gespeichert.");
  }

  getWorkSessions(): WorkSession[] {
    const stmt = this.db.prepare(`
    SELECT *
    FROM work_sessions
    ORDER BY date DESC;
  `);

    const sessions = stmt.all() as WorkSession[];
    console.log("WORK SESSIONS AUS SQLITE:", sessions);

    console.log(
      "WORK SESSIONS AUS SQLITE:",
      sessions.map((session) => ({
        date: session.date,
        totalPauseMinutes: session.totalPauseMinutes,
        totalWorkMinutes: session.totalWorkMinutes,
        status: session.status,
        workIntervals: session.workIntervals,
      })),
    );

    return sessions;
  }

  getWorkSessionsByUser(userId: string): WorkSession[] {
    const stmt = this.db.prepare(`
    SELECT *
    FROM work_sessions
    WHERE userId = ?
    ORDER BY date DESC;
  `);

    const sessions = stmt.all(userId) as WorkSession[];

    console.log(
      "DEBUG – Daten direkt aus der Datenbank:",
      sessions.map((session) => ({
        id: session.id,
        date: session.date,
        workStart: session.workStart,
        workEnd: session.workEnd,
        workIntervals: session.workIntervals,
      })),
    );

    return sessions;
  }

  migrateAdminWorkSessions() {
    const stmt = this.db.prepare(`
      UPDATE work_sessions
      SET userId = @newUserId
      WHERE userId = 'admin';
    `);

    const result = stmt.run({
      newUserId: "2015a358-69ce-4c83-8790-e86c5a3e6d33",
    });

    console.log("Alte Admin-Sessions migriert:", result.changes);

    return result.changes;
  }

  updateWorkSession(session: WorkSession): boolean {
    const stmt = this.db.prepare(`
    UPDATE work_sessions
    SET
      date = @date,
      workLocation = @workLocation,
      loginTime = @loginTime,
      logoutTime = @logoutTime,
      workStart = @workStart,
      workEnd = @workEnd,
      pauseStart = @pauseStart,
      pauseEnd = @pauseEnd,
      pauses = @pauses,
      workIntervals = @workIntervals,
      totalPauseMinutes = @totalPauseMinutes,
      totalWorkMinutes = @totalWorkMinutes,
      status = @status
    WHERE id = @id
  `);

    const result = stmt.run({
      id: session.id,
      date: session.date,
      workLocation: session.workLocation,

      loginTime: session.loginTime?.toISOString() ?? null,
      logoutTime: session.logoutTime?.toISOString() ?? null,
      workStart: session.workStart?.toISOString() ?? null,
      workEnd: session.workEnd?.toISOString() ?? null,
      pauseStart: session.pauseStart?.toISOString() ?? null,
      pauseEnd: session.pauseEnd?.toISOString() ?? null,

      pauses: JSON.stringify(
        (session.pauses ?? []).map((pause) => ({
          id: pause.id,
          start: pause.start?.toISOString(),
          end: pause.end?.toISOString() ?? null,
        })),
      ),

      workIntervals: JSON.stringify(
        (session.workIntervals ?? []).map((interval) => ({
          id: interval.id,
          start: interval.start?.toISOString(),
          end: interval.end?.toISOString() ?? null,
        })),
      ),

      totalPauseMinutes: session.totalPauseMinutes,
      totalWorkMinutes: session.totalWorkMinutes,
      status: session.status ?? "completed",
    });

    console.log(
      "WorkSession aktualisiert:",
      session.id,
      "Änderungen:",
      result.changes,
    );

    return result.changes > 0;
  }

  deleteWorkSession(id: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM work_sessions
      WHERE id = ?
    `);

    const result = stmt.run(id);

    console.log("WorkSession gelöscht:", id, "Änderungen:", result.changes);

    return result.changes > 0;
  }

  public needsInitialSetup(): boolean {
    const result = this.db
      .prepare("SELECT COUNT(*) AS count FROM users")
      .get() as { count: number };

    console.log("### DATABASE CHECK ###", "Benutzeranzahl:", result.count);

    return result.count === 0;
  }

  public async createInitialAdmin(input: {
    username: string;
    displayName: string;
    password: string;
  }): Promise<Omit<User, "password">> {
    const username = input.username.trim();
    const displayName = input.displayName.trim();

    if (username.length < 3 || username.length > 50) {
      throw new Error("Der Benutzername muss 3–50 Zeichen lang sein.");
    }

    if (!displayName || displayName.length > 100) {
      throw new Error("Bitte einen gültigen Namen eingeben.");
    }

    if (input.password.length < 12 || input.password.length > 128) {
      throw new Error("Das Passwort muss 12–128 Zeichen lang sein.");
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    const createAdmin = this.db.transaction(() => {
      const result = this.db
        .prepare("SELECT COUNT(*) AS count FROM users")
        .get() as { count: number };

      if (result.count !== 0) {
        throw new Error("Die Ersteinrichtung wurde bereits abgeschlossen.");
      }

      const user: User = {
        id: crypto.randomUUID(),
        username,
        password: passwordHash,
        displayName,
        role: "Administrator",
      };

      this.db
        .prepare(
          `
      INSERT INTO users (
        id, username, password, displayName, role
      )
      VALUES (
        @id, @username, @password, @displayName, @role
      )
    `,
        )
        .run(user);

      return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      };
    });

    return createAdmin.immediate();
  }

  // ==================================================
  // USERS
  // ==================================================

  getUsers(): Omit<User, "password">[] {
    const stmt = this.db.prepare(`
      SELECT
        id,
        username,
        displayName,
        role
      FROM users
      ORDER BY displayName ASC
    `);

    return stmt.all() as Omit<User, "password">[];
  }

  getUserByUsername(username: string): User | undefined {
    const stmt = this.db.prepare(`
      SELECT
        id,
        username,
        password,
        displayName,
        role
      FROM users
      WHERE username = ?
    `);

    return stmt.get(username) as User | undefined;
  }

  public debugListUsers(): void {
    const users = this.db
      .prepare("SELECT id, username, displayName, role FROM users")
      .all();

    console.log("### GESPEICHERTE BENUTZER ###", users);
  }

  public async authenticateUser(
    usernameInput: string,
    password: string,
  ): Promise<Omit<User, "password"> | null> {
    const user = this.getUserByUsername(usernameInput.trim());

    console.log("Login-Benutzer gefunden:", Boolean(user));

    if (!user || !password) {
      return null;
    }

    let valid = false;

    try {
      valid = await bcrypt.compare(password, user.password);
    } catch {
      // Altes Passwort ist möglicherweise noch Klartext.
      valid = false;
    }

    // Übergang für bestehende Klartext-Passwörter
    if (!valid && user.password === password) {
      const passwordHash = await bcrypt.hash(password, 12);

      this.db
        .prepare("UPDATE users SET password = ? WHERE id = ?")
        .run(passwordHash, user.id);

      valid = true;
    }

    if (!valid) {
      return null;
    }

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    };
  }

  async createUser(user: User): Promise<void> {
    const passwordHash = await bcrypt.hash(user.password, 12);

    this.db
      .prepare(
        `
    INSERT INTO users (
      id, username, password, displayName, role
    )
    VALUES (
      @id, @username, @password, @displayName, @role
    )
  `,
      )
      .run({
        ...user,
        username: user.username.trim(),
        displayName: user.displayName.trim(),
        password: passwordHash,
      });
  }

  async updateUser(user: User): Promise<void> {
    const existing = this.db
      .prepare("SELECT password FROM users WHERE id = ?")
      .get(user.id) as { password: string } | undefined;

    if (!existing) {
      throw new Error("Benutzer wurde nicht gefunden.");
    }

    let passwordToSave = existing.password;

    // Leeres Passwort bedeutet: bisheriges Passwort beibehalten.
    if (user.password?.trim()) {
      passwordToSave = await bcrypt.hash(user.password, 12);
    }

    this.db
      .prepare(
        `
    UPDATE users
    SET username = @username,
        password = @password,
        displayName = @displayName,
        role = @role
    WHERE id = @id
  `,
      )
      .run({
        ...user,
        username: user.username.trim(),
        displayName: user.displayName.trim(),
        password: passwordToSave,
      });
  }

  deleteUser(id: string): void {
    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          `
          DELETE FROM work_sessions
          WHERE userId = ?
        `,
        )
        .run(id);

      this.db
        .prepare(
          `
          DELETE FROM user_settings
          WHERE userId = ?
        `,
        )
        .run(id);

      this.db
        .prepare(
          `
          DELETE FROM vacations
          WHERE userId = ?
        `,
        )
        .run(id);

      this.db
        .prepare(
          `
          DELETE FROM vacation_allowances
          WHERE userId = ?
        `,
        )
        .run(id);

      // Krankmeldungen ebenfalls löschen
      this.db
        .prepare(
          `
          DELETE FROM sickness
          WHERE userId = ?
        `,
        )
        .run(id);

      this.db
        .prepare(
          `
          DELETE FROM users
          WHERE id = ?
        `,
        )
        .run(id);
    });

    transaction();

    console.log(`Benutzer und zugehörige Daten gelöscht: ${id}`);
  }

  // ==================================================
  // VACATION
  // ==================================================

  saveVacation(vacation: Vacation): void {
    const stmt = this.db.prepare(`
    INSERT OR REPLACE INTO vacations (
      id,
      userId,
      startDate,
      endDate,
      totalDays,
      status,
      requestedAt,
      decidedAt,
      decidedBy,
      rejectionReason
    )
    VALUES (
      @id,
      @userId,
      @startDate,
      @endDate,
      @totalDays,
      @status,
      @requestedAt,
      @decidedAt,
      @decidedBy,
      @rejectionReason
    )
  `);

    stmt.run({
      id: vacation.id,
      userId: vacation.userId,
      startDate: vacation.startDate,
      endDate: vacation.endDate,
      totalDays: vacation.totalDays,
      status: vacation.status ?? "approved",
      requestedAt: vacation.requestedAt ?? null,
      decidedAt: vacation.decidedAt ?? null,
      decidedBy: vacation.decidedBy ?? null,
      rejectionReason: vacation.rejectionReason ?? null,
    });

    console.log("Urlaub in SQLite gespeichert:", vacation);
  }

  getVacations(userId: string, year?: number): Vacation[] {
    if (year !== undefined) {
      const stmt = this.db.prepare(`
      SELECT
        id,
        userId,
        startDate,
        endDate,
        totalDays,
        status,
        requestedAt,
        decidedAt,
        decidedBy,
        rejectionReason
      FROM vacations
      WHERE userId = ?
        AND substr(startDate, 1, 4) = ?
      ORDER BY startDate DESC
    `);

      return stmt.all(userId, String(year)) as Vacation[];
    }

    const stmt = this.db.prepare(`
    SELECT
      id,
      userId,
      startDate,
      endDate,
      totalDays,
      status,
      requestedAt,
      decidedAt,
      decidedBy,
      rejectionReason
    FROM vacations
    WHERE userId = ?
    ORDER BY startDate DESC
  `);

    return stmt.all(userId) as Vacation[];
  }

  deleteVacation(id: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM vacations
      WHERE id = ?
    `);

    const result = stmt.run(id);

    console.log("Urlaub gelöscht:", id, "Änderungen:", result.changes);

    return result.changes > 0;
  }

  updateVacation(vacation: Vacation): boolean {
    const stmt = this.db.prepare(`
      UPDATE vacations
      SET
        startDate = @startDate,
        endDate = @endDate,
        totalDays = @totalDays
      WHERE id = @id
        AND userId = @userId
    `);

    const result = stmt.run({
      id: vacation.id,
      userId: vacation.userId,
      startDate: vacation.startDate,
      endDate: vacation.endDate,
      totalDays: vacation.totalDays,
    });

    console.log(
      "Urlaub aktualisiert:",
      vacation.id,
      "Änderungen:",
      result.changes,
    );

    return result.changes > 0;
  }

  updateVacationApproval(
    id: string,
    status: "approved" | "rejected",
    decidedBy?: string,
    rejectionReason?: string,
  ): boolean {
    const stmt = this.db.prepare(`
    UPDATE vacations
    SET
      status = @status,
      decidedAt = @decidedAt,
      decidedBy = @decidedBy,
      rejectionReason = @rejectionReason
    WHERE id = @id
  `);

    const result = stmt.run({
      id,
      status,
      decidedAt: new Date().toISOString(),
      decidedBy: decidedBy ?? null,
      rejectionReason: status === "rejected" ? (rejectionReason ?? null) : null,
    });

    return result.changes > 0;
  }

  getVacationAllowance(userId: string, year: number): number {
    const selectStmt = this.db.prepare(`
      SELECT totalDays
      FROM vacation_allowances
      WHERE userId = ?
        AND year = ?
    `);

    const result = selectStmt.get(userId, year) as
      | { totalDays: number }
      | undefined;

    if (result) {
      return result.totalDays;
    }

    const defaultDays = 30;

    const insertStmt = this.db.prepare(`
      INSERT INTO vacation_allowances (
        userId,
        year,
        totalDays
      )
      VALUES (
        @userId,
        @year,
        @totalDays
      )
    `);

    insertStmt.run({
      userId,
      year,
      totalDays: defaultDays,
    });

    console.log(
      `Urlaubsanspruch angelegt: ${userId} / ${year} = ${defaultDays} Tage`,
    );

    return defaultDays;
  }

  saveVacationAllowance(userId: string, year: number, totalDays: number): void {
    const stmt = this.db.prepare(`
      INSERT INTO vacation_allowances (
        userId,
        year,
        totalDays
      )
      VALUES (
        @userId,
        @year,
        @totalDays
      )
      ON CONFLICT(userId, year)
      DO UPDATE SET
        totalDays = excluded.totalDays;
    `);

    stmt.run({
      userId,
      year,
      totalDays,
    });

    console.log(
      `Urlaubsanspruch gespeichert: ${userId} / ${year} = ${totalDays} Tage`,
    );
  }

  // ==================================================
  // SICKNESS / KRANKHEIT
  // ==================================================

  /**
   * Krankmeldung speichern
   */
  saveSickness(sickness: Sickness): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sickness (
        id,
        userId,
        startDate,
        endDate,
        totalDays
      )
      VALUES (
        @id,
        @userId,
        @startDate,
        @endDate,
        @totalDays
      )
    `);

    stmt.run({
      id: sickness.id,
      userId: sickness.userId,
      startDate: sickness.startDate,
      endDate: sickness.endDate,
      totalDays: sickness.totalDays,
    });

    console.log("Krankmeldung in SQLite gespeichert:", sickness);
  }

  /**
   * Alle Krankmeldungen eines Benutzers laden
   */
  getSickness(userId: string, year?: number): Sickness[] {
    if (year !== undefined) {
      const stmt = this.db.prepare(`
        SELECT
          id,
          userId,
          startDate,
          endDate,
          totalDays
        FROM sickness
        WHERE userId = ?
          AND substr(startDate, 1, 4) = ?
        ORDER BY startDate DESC
      `);

      return stmt.all(userId, String(year)) as Sickness[];
    }

    const stmt = this.db.prepare(`
      SELECT
        id,
        userId,
        startDate,
        endDate,
        totalDays
      FROM sickness
      WHERE userId = ?
      ORDER BY startDate DESC
    `);

    return stmt.all(userId) as Sickness[];
  }

  /**
   * Krankmeldung aktualisieren
   */
  updateSickness(sickness: Sickness): boolean {
    const stmt = this.db.prepare(`
      UPDATE sickness
      SET
        startDate = @startDate,
        endDate = @endDate,
        totalDays = @totalDays
      WHERE id = @id
        AND userId = @userId
    `);

    const result = stmt.run({
      id: sickness.id,
      userId: sickness.userId,
      startDate: sickness.startDate,
      endDate: sickness.endDate,
      totalDays: sickness.totalDays,
    });

    console.log(
      "Krankmeldung aktualisiert:",
      sickness.id,
      "Änderungen:",
      result.changes,
    );

    return result.changes > 0;
  }

  /**
   * Krankmeldung löschen
   */
  deleteSickness(id: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM sickness
      WHERE id = ?
    `);

    const result = stmt.run(id);

    console.log("Krankmeldung gelöscht:", id, "Änderungen:", result.changes);

    return result.changes > 0;
  }

  saveOvertimeTransaction(transaction: OvertimeTransaction): void {
    const stmt = this.db.prepare(`
    INSERT OR REPLACE INTO overtime_transactions (
      id,
      userId,
      date,
      minutes,
      type,
      days,
      note,
      status,
      requestedAt,
      decidedAt,
      decidedBy,
      rejectionReason
    )
    VALUES (
      @id,
      @userId,
      @date,
      @minutes,
      @type,
      @days,
      @note,
      @status,
      @requestedAt,
      @decidedAt,
      @decidedBy,
      @rejectionReason
    );
  `);

    stmt.run({
      id: transaction.id,
      userId: transaction.userId,
      date: transaction.date,
      minutes: transaction.minutes,
      type: transaction.type,
      days: transaction.days ?? 0,
      note: transaction.note ?? null,
      status: transaction.status ?? "approved",
      requestedAt: transaction.requestedAt ?? null,
      decidedAt: transaction.decidedAt ?? null,
      decidedBy: transaction.decidedBy ?? null,
      rejectionReason: transaction.rejectionReason ?? null,
    });

    console.log("GESPEICHERTE ÜBERSTUNDEN:", transaction);
  }

  getOvertimeTransactionsByUser(userId: string): OvertimeTransaction[] {
    const stmt = this.db.prepare(`
    SELECT *
    FROM overtime_transactions
    WHERE userId = ?
    ORDER BY date DESC;
  `);

    return stmt.all(userId) as OvertimeTransaction[];
  }

  updateOvertimeApproval(
    id: string,
    status: "approved" | "rejected",
    decidedBy?: string,
    rejectionReason?: string,
  ): boolean {
    const stmt = this.db.prepare(`
    UPDATE overtime_transactions
    SET
      status = @status,
      decidedAt = @decidedAt,
      decidedBy = @decidedBy,
      rejectionReason = @rejectionReason
    WHERE id = @id
  `);

    const result = stmt.run({
      id,
      status,
      decidedAt: new Date().toISOString(),
      decidedBy: decidedBy ?? null,
      rejectionReason: status === "rejected" ? (rejectionReason ?? null) : null,
    });

    return result.changes > 0;
  }

  deleteOvertimeTransaction(id: string): boolean {
    const stmt = this.db.prepare(`
    DELETE FROM overtime_transactions
    WHERE id = ?
  `);

    const result = stmt.run(id);

    console.log(
      "Überstundenbuchung gelöscht:",
      id,
      "Änderungen:",
      result.changes,
    );

    return result.changes > 0;
  }
}
export const databaseService = new DatabaseService();
