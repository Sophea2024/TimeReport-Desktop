import type { OvertimeTransaction } from "../types/OvertimeTransaction";
import { reportService } from "./reports/ReportService";

class OvertimeService {
  /**
   * Berechnet den aktuellen Gleitzeit-Saldo eines Jahres.
   *
   * Beispiel:
   * Sollzeit:  160:00 h
   * Istzeit:   168:30 h
   * -------------------
   * Gleitzeit: +8:30 h
   *
   * Davon bereits genommen:
   * Freizeitausgleich: -4:00 h
   * Auszahlung:        -2:00 h
   *
   * Verbleibend: +2:30 h
   */

  async getBalance(
    userId: string,
    periodType: "year" | "month" = "year",
    year: number = new Date().getFullYear(),
    month: number = new Date().getMonth() + 1,
  ): Promise<number> {
    let earnedMinutes = 0;

    if (periodType === "month") {
      const monthlyReport = await reportService.getMonthlyReport(
        month,
        year,
        userId,
      );

      earnedMinutes = monthlyReport.overtimeMinutes;
    } else {
      const yearlyReport = await reportService.getYearlyReport(year, userId);

      earnedMinutes = yearlyReport.overtimeMinutes;
    }

    const transactions =
      await window.database.getOvertimeTransactionsByUser(userId);

    const periodPrefix =
      periodType === "month"
        ? `${year}-${String(month).padStart(2, "0")}-`
        : `${year}-`;

    const usedMinutes = transactions
      .filter((transaction) => {
        const isInPeriod = transaction.date.startsWith(periodPrefix);
        const isApproved =
          transaction.status === "approved" && !!transaction.decidedAt;
        const isUsage =
          transaction.type === "time_off" || transaction.type === "payout";

        return isInPeriod && isApproved && isUsage;
      })
      .reduce((sum, transaction) => sum + Math.abs(transaction.minutes), 0);

    return Math.max(0, earnedMinutes - usedMinutes);
  }

  /**
   * Gleitzeit als Freizeit verwenden.
   *
   * Die Minuten werden automatisch negativ gespeichert.
   */
  async useTimeOff(
    userId: string,
    minutes: number,
    date: string,
    days: number,
    note?: string,
  ): Promise<void> {
    console.log("USE TIME OFF - ERHALTENE TAGE:", days);

    const transaction: OvertimeTransaction = {
      id: crypto.randomUUID(),
      userId,
      date,
      minutes: -Math.abs(Math.round(minutes)),
      type: "time_off",
      days: Math.round(days),
      note,
      status: "pending",
      requestedAt: new Date().toISOString(),
    };

    console.log("ÜBERSTUNDEN-TRANSAKTION VOR DEM SPEICHERN:", transaction);

    await window.database.saveOvertimeTransaction(transaction);
  }

  /**
   * Gleitzeit auszahlen.
   *
   * Die Minuten werden automatisch negativ gespeichert.
   */

  /**
   * Gleitzeit zur Auszahlung beantragen.
   * Die Minuten werden negativ gespeichert.
   * Die Auszahlung muss genehmigt werden.
   */
  async payout(
    userId: string,
    minutes: number,
    date: string,
    note?: string,
  ): Promise<void> {
    const safeMinutes = Math.round(Math.abs(minutes));

    if (!Number.isFinite(minutes) || safeMinutes <= 0) {
      throw new Error("Die Anzahl der Minuten muss größer als 0 sein.");
    }

    if (!userId.trim()) {
      throw new Error("Es wurde kein Benutzer ausgewählt.");
    }

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error("Bitte ein gültiges Datum angeben.");
    }

    const transaction: OvertimeTransaction = {
      id: crypto.randomUUID(),
      userId,
      date,
      minutes: -safeMinutes,
      type: "payout",
      days: 0,
      note: note?.trim() || undefined,
      status: "pending",
      requestedAt: new Date().toISOString(),
    };

    await window.database.saveOvertimeTransaction(transaction);
  }

  formatMinutes(minutes: number): string {
    const sign = minutes < 0 ? "-" : "";
    const absoluteMinutes = Math.abs(Math.round(minutes));

    const hours = Math.floor(absoluteMinutes / 60);

    const remainingMinutes = absoluteMinutes % 60;

    return `${sign}${hours}h ${String(remainingMinutes).padStart(2, "0")}min`;
  }
}

export const overtimeService = new OvertimeService();
