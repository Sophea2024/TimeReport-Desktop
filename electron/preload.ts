import { ipcRenderer, contextBridge } from "electron";
import type { OvertimeTransaction } from "../src/types/OvertimeTransaction";

// --------- IPC Renderer API ---------

contextBridge.exposeInMainWorld("ipcRenderer", {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args;

    return ipcRenderer.on(channel, (event, ...args) =>
      listener(event, ...args),
    );
  },

  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args;

    return ipcRenderer.off(channel, ...omit);
  },

  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args;

    return ipcRenderer.send(channel, ...omit);
  },

  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args;

    return ipcRenderer.invoke(channel, ...omit);
  },
});

// --------- Database API ---------

contextBridge.exposeInMainWorld("database", {
  needsInitialSetup: () => ipcRenderer.invoke("needs-initial-setup"),

  createInitialAdmin: (input: {
    username: string;
    displayName: string;
    password: string;
  }) => ipcRenderer.invoke("create-initial-admin", input),
  // ==============================
  // Arbeitszeiten
  // ==============================

  saveWorkSession: (session: unknown) =>
    ipcRenderer.invoke("save-work-session", session),

  getWorkSessions: () => ipcRenderer.invoke("get-work-sessions"),

  updateWorkSession: (session: unknown) =>
    ipcRenderer.invoke("update-work-session", session),

  deleteWorkSession: (id: string) =>
    ipcRenderer.invoke("delete-work-session", id),

  migrateAdminWorkSessions: () =>
    ipcRenderer.invoke("migrate-admin-work-sessions"),

  getWorkSessionsByUser: (userId: string) =>
    ipcRenderer.invoke("get-work-sessions-by-user", userId),

  // ==============================
  // Wochenarbeitszeit
  // ==============================

  getWeeklyWorkMinutes: (userId: string) =>
    ipcRenderer.invoke("get-weekly-work-minutes", userId),

  saveWeeklyWorkMinutes: (userId: string, weeklyWorkMinutes: number) =>
    ipcRenderer.invoke("save-weekly-work-minutes", userId, weeklyWorkMinutes),

  saveFederalState: (userId: string, federalState: string) =>
    ipcRenderer.invoke("save-federal-state", userId, federalState),

  getFederalState: (userId: string) =>
    ipcRenderer.invoke("get-federal-state", userId),

  // ==============================
  // Benutzereinstellungen
  // ==============================

  hasUserSettings: (userId: string) =>
    ipcRenderer.invoke("has-user-settings", userId),

  // ==============================
  // Benutzer
  // ==============================

  getUsers: () => ipcRenderer.invoke("get-users"),

  getUserByUsername: (username: string) =>
    ipcRenderer.invoke("get-user-by-username", username),

  authenticateUser: (username: string, password: string) =>
    ipcRenderer.invoke("authenticate-user", username, password),

  createUser: (user: unknown) => ipcRenderer.invoke("create-user", user),

  updateUser: (user: unknown) => ipcRenderer.invoke("update-user", user),

  deleteUser: (id: string) => ipcRenderer.invoke("delete-user", id),

  // ==============================
  // Urlaub
  // ==============================

  saveVacation: (vacation: unknown) =>
    ipcRenderer.invoke("save-vacation", vacation),

  getVacations: (userId: string) => ipcRenderer.invoke("get-vacations", userId),

  deleteVacation: (id: string) => ipcRenderer.invoke("delete-vacation", id),

  updateVacation: (vacation: unknown) =>
    ipcRenderer.invoke("update-vacation", vacation),

  // ==============================
  // Krankheit
  // ==============================

  saveSickness: (sickness: unknown) =>
    ipcRenderer.invoke("save-sickness", sickness),

  getSicknesses: () => ipcRenderer.invoke("get-sicknesses"),

  updateSickness: (sickness: unknown) =>
    ipcRenderer.invoke("update-sickness", sickness),

  deleteSickness: (id: string) => ipcRenderer.invoke("delete-sickness", id),

  // ==============================
  // Feiertage
  // ==============================

  savePublicHoliday: (holiday: unknown) =>
    ipcRenderer.invoke("save-public-holiday", holiday),

  getPublicHolidays: () => ipcRenderer.invoke("get-public-holidays"),

  deletePublicHoliday: (id: string) =>
    ipcRenderer.invoke("delete-public-holiday", id),

  // ==============================
  // Urlaubstage
  // ==============================

  getVacationAllowance: (userId: string, year: number) =>
    ipcRenderer.invoke("get-vacation-allowance", userId, year),

  saveVacationAllowance: (userId: string, year: number, days: number) =>
    ipcRenderer.invoke("save-vacation-allowance", userId, year, days),

  saveOvertimeTransaction: (transaction: OvertimeTransaction) =>
    ipcRenderer.invoke("save-overtime-transaction", transaction),

  updateOvertimeApproval: (
    id: string,
    status: "approved" | "rejected",
    decidedBy?: string,
    rejectionReason?: string,
  ) =>
    ipcRenderer.invoke(
      "update-overtime-approval",
      id,
      status,
      decidedBy,
      rejectionReason,
    ),

  updateVacationApproval: (
    id: string,
    status: "approved" | "rejected",
    decidedBy?: string,
    rejectionReason?: string,
  ) =>
    ipcRenderer.invoke(
      "update-vacation-approval",
      id,
      status,
      decidedBy,
      rejectionReason,
    ),

  getOvertimeTransactionsByUser: (userId: string) =>
    ipcRenderer.invoke("get-overtime-transactions", userId),

  deleteOvertimeTransaction: (id: string) =>
    ipcRenderer.invoke("delete-overtime-transaction", id),

  prepareEmail: (
    to: string,
    subject: string,
    body: string,
  ): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke("prepare-email", to, subject, body),
});
