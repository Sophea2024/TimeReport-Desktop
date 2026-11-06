import { MonthlyReport } from "./MonthlyReport";

export interface YearlyReport {
  year: number;

  totalWorkMinutes: number;
  totalPauseMinutes: number;

  targetMinutes: number;
  overtimeMinutes: number;
  deficitMinutes: number;
  sickMinutes: number;

  officeMinutes: number;
  homeofficeMinutes: number;

  officeDays: number;
  homeofficeDays: number;

  businessTripMinutes: number;
  businessTripDays: number;

  months: MonthlyReport[];
}
