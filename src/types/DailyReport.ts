import { WorkSession } from "./WorkSession";

export type DayStatus =
  | "work"
  | "vacation"
  | "sick"
  | "publicHoliday"
  | "weekend";

export interface DailyReport {
  date: string;
  status: DayStatus;

  sessions: WorkSession[];

  totalWorkMinutes: number;
  totalPauseMinutes: number;

  // Sollzeit für diesen Arbeitstag
  targetMinutes: number;

  // Überstunden dieses Tages
  overtimeMinutes: number;

  // Fehlzeit dieses Tages
  deficitMinutes: number;
  isHoliday: boolean;
  isApprovedVacation: boolean;
  holidayName?: string;

  sickMinutes: number;

  homeofficeMinutes: number;
  officeMinutes: number;
  businessTripMinutes: number;
  businessTripDays: number;
}
