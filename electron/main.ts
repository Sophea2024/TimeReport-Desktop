import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import type { OvertimeTransaction } from "../src/types/OvertimeTransaction";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Testpfad setzen, BEVOR DatabaseService importiert und initialisiert wird.
if (process.env.TIMEREPORT_SETUP_TEST === "1") {
  const testDataPath = path.join(
    app.getPath("appData"),
    "TimeReport-Setup-Test",
  );

  fs.mkdirSync(testDataPath, { recursive: true });
  app.setPath("userData", testDataPath);

  console.log("⚠️ SETUP-TEST: Separate Datenbank:", testDataPath);
}

// DatabaseService erst laden, nachdem der Datenbankpfad feststeht.
const { databaseService } = await import("./services/DatabaseService");

const dbPath = path.join(app.getPath("userData"), "timereport.db");

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, "..");

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST;

let win: BrowserWindow | null;

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
    },
  });

  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", new Date().toLocaleString());
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(createWindow);

ipcMain.handle("save-work-session", async (_event, session) => {
  try {
    databaseService.saveWorkSession(session);

    console.log("WorkSession in SQLite gespeichert.");

    return true;
  } catch (error) {
    console.error("Fehler beim Speichern der WorkSession:", error);

    return false;
  }
});

ipcMain.handle("get-work-sessions", async () => {
  return databaseService.getWorkSessions();
});

ipcMain.handle("update-work-session", async (_event, session) => {
  return databaseService.updateWorkSession(session);
});

ipcMain.handle("get-work-sessions-by-user", async (_event, userId: string) => {
  console.log("DEBUG MAIN: IPC-Aufruf angekommen");

  const sessions = databaseService.getWorkSessionsByUser(userId);

  console.log(
    "DEBUG MAIN: Daten aus Datenbank",
    sessions.map((session) => ({
      date: session.date,
      workIntervals: session.workIntervals,
    })),
  );

  return sessions;
});

ipcMain.handle("delete-work-session", async (_event, id: string) => {
  return databaseService.deleteWorkSession(id);
});

ipcMain.handle("migrate-admin-work-sessions", async () => {
  const changes = databaseService.migrateAdminWorkSessions();
  console.log("Alte Admin-WorkSessions migriert:", changes);
  return changes;
});

ipcMain.handle(
  "prepare-email",
  async (_event, to: string, subject: string, body: string) => {
    try {
      const email = String(to ?? "").trim();

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return {
          success: false,
          message: "Bitte eine gültige E-Mail-Adresse eingeben.",
        };
      }

      const mailtoUrl =
        `mailto:${email}` +
        `?subject=${encodeURIComponent(String(subject ?? ""))}` +
        `&body=${encodeURIComponent(String(body ?? ""))}`;

      await shell.openExternal(mailtoUrl);
      return { success: true };
    } catch (error) {
      console.error("E-Mail konnte nicht vorbereitet werden:", error);

      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Das E-Mail-Programm konnte nicht geöffnet werden.",
      };
    }
  },
);

/**
 * ==============================
 * User Settings laden
 * ==============================
 */
ipcMain.handle("get-user-settings", async (_event, userId: string) => {
  return databaseService.getUserSettings(userId);
});

ipcMain.handle("get-weekly-work-minutes", async (_event, userId: string) => {
  return databaseService.getWeeklyWorkMinutes(userId);
});

ipcMain.handle(
  "save-weekly-work-minutes",
  async (_event, userId: string, weeklyWorkMinutes: number) => {
    databaseService.saveWeeklyWorkMinutes(userId, weeklyWorkMinutes);
    return true;
  },
);

ipcMain.handle("get-federal-state", async (_event, userId: string) => {
  return databaseService.getFederalState(userId);
});

ipcMain.handle(
  "save-federal-state",
  async (_event, userId: string, federalState: string) => {
    databaseService.saveFederalState(userId, federalState);
    return true;
  },
);

ipcMain.handle("has-user-settings", async (_event, userId: string) => {
  return databaseService.hasUserSettings(userId);
});

ipcMain.handle("get-users", async () => {
  return databaseService.getUsers();
});

ipcMain.handle("get-user-by-username", async (_event, username: string) => {
  return databaseService.getUserByUsername(username);
});

ipcMain.handle(
  "authenticate-user",
  async (_event, username: string, password: string) =>
    databaseService.authenticateUser(username, password),
);

ipcMain.handle("create-user", async (_event, user) => {
  await databaseService.createUser(user);
  return true;
});

ipcMain.handle("update-user", async (_event, user) => {
  await databaseService.updateUser(user);
  return true;
});

ipcMain.handle("delete-user", async (_event, id: string) => {
  databaseService.deleteUser(id);
  return true;
});

ipcMain.handle("save-vacation", async (_event, vacation) => {
  databaseService.saveVacation(vacation);
  console.log("Vacation in SQLite gespeichert.");
  return true;
});

ipcMain.handle("get-vacations", async (_event, userId: string) => {
  return databaseService.getVacations(userId);
});

ipcMain.handle("delete-vacation", async (_event, id: string) => {
  return databaseService.deleteVacation(id);
});

ipcMain.handle("update-vacation", async (_event, vacation) => {
  return databaseService.updateVacation(vacation);
});

ipcMain.handle(
  "get-vacation-allowance",
  async (_event, userId: string, year: number) => {
    return databaseService.getVacationAllowance(userId, year);
  },
);

ipcMain.handle(
  "save-vacation-allowance",
  async (_event, userId: string, year: number, days: number) => {
    databaseService.saveVacationAllowance(userId, year, days);
    return true;
  },
);

ipcMain.handle("save-sickness", (_event, sickness) => {
  databaseService.saveSickness(sickness);
});

ipcMain.handle("get-sickness", (_event, userId, year) => {
  return databaseService.getSickness(userId, year);
});

ipcMain.handle("update-sickness", (_event, sickness) => {
  return databaseService.updateSickness(sickness);
});

ipcMain.handle("delete-sickness", (_event, id) => {
  return databaseService.deleteSickness(id);
});

// ==================================================
// PDF-EXPORT
// ==================================================

ipcMain.handle(
  "create-report-pdf",
  async (_event, html: string, defaultFilename: string) => {
    try {
      if (!win) {
        return {
          success: false,
          message: "Das Hauptfenster ist nicht verfügbar.",
        };
      }

      const result = await dialog.showSaveDialog(win, {
        title: "PDF-Bericht speichern",
        defaultPath: defaultFilename,
        filters: [{ name: "PDF-Datei", extensions: ["pdf"] }],
      });

      if (result.canceled || !result.filePath) {
        return {
          success: false,
          message: "PDF-Export abgebrochen.",
        };
      }

      const pdfWindow = new BrowserWindow({
        show: false,
        width: 1200,
        height: 900,
        webPreferences: { sandbox: true },
      });

      try {
        const dataUrl =
          "data:text/html;charset=utf-8," + encodeURIComponent(html);

        await pdfWindow.loadURL(dataUrl);

        const pdfData = await pdfWindow.webContents.printToPDF({
          printBackground: true,
          landscape: false,
          pageSize: "A4",
          margins: {
            top: 0.5,
            bottom: 0.5,
            left: 0.5,
            right: 0.5,
          },
        });

        fs.writeFileSync(result.filePath, pdfData);
        console.log("PDF erfolgreich gespeichert:", result.filePath);

        return {
          success: true,
          message: "PDF erfolgreich gespeichert.",
          filePath: result.filePath,
        };
      } finally {
        if (!pdfWindow.isDestroyed()) {
          pdfWindow.close();
        }
      }
    } catch (error) {
      console.error("Fehler beim PDF-Export:", error);

      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  },
);

ipcMain.handle("backup-database", async () => {
  try {
    console.log("Datenbankpfad:", dbPath);
    console.log("Datenbank vorhanden:", fs.existsSync(dbPath));

    if (!fs.existsSync(dbPath)) {
      return {
        success: false,
        message: `Datenbank nicht gefunden:\n${dbPath}`,
      };
    }

    const result = await dialog.showSaveDialog({
      title: "Datenbank-Backup speichern",
      defaultPath: `timereport-backup-${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.db`,
      filters: [{ name: "SQLite Datenbank", extensions: ["db"] }],
    });

    if (result.canceled || !result.filePath) {
      return {
        success: false,
        message: "Backup abgebrochen.",
      };
    }

    console.log("Backup-Ziel:", result.filePath);
    await databaseService.backupDatabase(result.filePath);

    const backupExists = fs.existsSync(result.filePath);
    console.log("Backup vorhanden:", backupExists);

    if (!backupExists) {
      return {
        success: false,
        message: `Backup wurde nicht erstellt.\n\nZiel:\n${result.filePath}`,
      };
    }

    return {
      success: true,
      message: `Backup erfolgreich gespeichert:\n\n${result.filePath}`,
    };
  } catch (error) {
    console.error("Fehler beim Datenbank-Backup:", error);

    return {
      success: false,
      message: `Die Datenbank konnte nicht gesichert werden.\n\n${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
});

ipcMain.handle("restore-database", async () => {
  try {
    if (!win) {
      return {
        success: false,
        message: "Das Hauptfenster ist nicht verfügbar.",
      };
    }

    const result = await dialog.showOpenDialog(win, {
      title: "Datenbank wiederherstellen",
      properties: ["openFile"],
      filters: [
        {
          name: "SQLite-Datenbank",
          extensions: ["db", "sqlite", "sqlite3"],
        },
      ],
    });

    if (result.canceled || !result.filePaths[0]) {
      return {
        success: false,
        message: "Wiederherstellung abgebrochen.",
      };
    }

    const backupPath = result.filePaths[0];
    const databasePath = databaseService.getDatabasePath();

    const confirm = await dialog.showMessageBox(win, {
      type: "warning",
      buttons: ["Abbrechen", "Wiederherstellen"],
      defaultId: 1,
      cancelId: 0,
      title: "Datenbank wiederherstellen",
      message: "Die aktuelle Datenbank wird ersetzt.",
      detail:
        "Alle aktuell gespeicherten Daten werden durch die ausgewählte Backup-Datei ersetzt. " +
        "Vorher wird automatisch eine Sicherung der aktuellen Datenbank erstellt.",
    });

    if (confirm.response !== 1) {
      return {
        success: false,
        message: "Wiederherstellung abgebrochen.",
      };
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safetyBackupPath = `${databasePath}.before-restore-${timestamp}.db`;

    databaseService.closeDatabase();

    if (fs.existsSync(databasePath)) {
      fs.copyFileSync(databasePath, safetyBackupPath);
    }

    fs.copyFileSync(backupPath, databasePath);

    await dialog.showMessageBox(win, {
      type: "info",
      buttons: ["OK"],
      title: "Wiederherstellung erfolgreich",
      message: "Die Datenbank wurde erfolgreich wiederhergestellt.",
      detail: "TimeReport wird jetzt neu gestartet.",
    });

    app.relaunch();
    app.exit(0);

    return {
      success: true,
      message: "Datenbank erfolgreich wiederhergestellt.",
    };
  } catch (error) {
    console.error("Fehler beim Wiederherstellen der Datenbank:", error);

    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
});

ipcMain.handle("get-overtime-transactions", async (_event, userId: string) => {
  try {
    return databaseService.getOvertimeTransactionsByUser(userId);
  } catch (error) {
    console.error("Überstundenbuchungen konnten nicht geladen werden:", error);
    return [];
  }
});

ipcMain.handle(
  "save-overtime-transaction",
  async (_event, transaction: OvertimeTransaction) => {
    try {
      databaseService.saveOvertimeTransaction(transaction);
      return { success: true };
    } catch (error) {
      console.error(
        "Überstundenbuchung konnte nicht gespeichert werden:",
        error,
      );

      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  },
);

ipcMain.handle("delete-overtime-transaction", async (_event, id: string) => {
  try {
    return {
      success: databaseService.deleteOvertimeTransaction(id),
    };
  } catch (error) {
    console.error("Überstundenbuchung konnte nicht gelöscht werden:", error);

    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
});

ipcMain.handle(
  "update-overtime-approval",
  async (
    _event,
    id: string,
    status: "approved" | "rejected",
    decidedBy?: string,
    rejectionReason?: string,
  ) => {
    try {
      return {
        success: databaseService.updateOvertimeApproval(
          id,
          status,
          decidedBy,
          rejectionReason,
        ),
      };
    } catch (error) {
      console.error(
        "Genehmigung der Überstundenbuchung fehlgeschlagen:",
        error,
      );

      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  },
);

ipcMain.handle(
  "update-vacation-approval",
  async (
    _event,
    id: string,
    status: "approved" | "rejected",
    decidedBy?: string,
    rejectionReason?: string,
  ) => {
    try {
      return {
        success: databaseService.updateVacationApproval(
          id,
          status,
          decidedBy,
          rejectionReason,
        ),
      };
    } catch (error) {
      console.error("Genehmigung des Urlaubsantrags fehlgeschlagen:", error);

      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  },
);

ipcMain.handle("needs-initial-setup", () => {
  return databaseService.needsInitialSetup();
});

ipcMain.handle(
  "create-initial-admin",
  async (
    _event,
    input: {
      username: string;
      displayName: string;
      password: string;
    },
  ) => {
    return await databaseService.createInitialAdmin(input);
  },
);
