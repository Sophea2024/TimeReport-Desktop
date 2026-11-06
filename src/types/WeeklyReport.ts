import { DailyReport } from "./DailyReport";

export interface WeeklyReport {
  week: number;
  year: number;

  days: DailyReport[];

  totalWorkMinutes: number;
  totalPauseMinutes: number;

  overtimeMinutes: number;
  targetMinutes: number;
  deficitMinutes: number;
  sickMinutes: number;

  officeMinutes: number;
  homeofficeMinutes: number;

  officeDays: number;
  homeofficeDays: number;
  businessTripMinutes: number;
  businessTripDays: number;
}
