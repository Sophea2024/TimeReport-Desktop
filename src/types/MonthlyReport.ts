import { DailyReport } from "./DailyReport";

export interface MonthlyReport {
  month: number;
  year: number;

  days: DailyReport[];

  // Tatsächlich geleistete Arbeitszeit
  totalWorkMinutes: number;

  // Tatsächliche Pausenzeit
  totalPauseMinutes: number;

  // Monatliche Sollzeit
  targetMinutes: number;
  overtimeMinutes: number;
  deficitMinutes: number;
  sickMinutes: number;

  // Arbeitszeit nach Arbeitsort
  officeMinutes: number;
  homeofficeMinutes: number;

  // Anzahl Tage nach Arbeitsort
  officeDays: number;
  homeofficeDays: number;

  businessTripMinutes: number;
  businessTripDays: number;
}
