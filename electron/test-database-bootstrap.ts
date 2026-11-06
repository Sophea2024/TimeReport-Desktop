import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

// Nur für einen ausdrücklich aktivierten Setup-Test.
// Ohne diese Umgebungsvariable bleibt der normale Datenbankpfad erhalten.
if (process.env.TIMEREPORT_SETUP_TEST === "1") {
  const testDataPath = path.join(
    app.getPath("appData"),
    "TimeReport-Setup-Test",
  );

  fs.mkdirSync(testDataPath, { recursive: true });
  app.setPath("userData", testDataPath);

  console.log("⚠️ SETUP-TEST: Separate Datenbank:", testDataPath);
}
