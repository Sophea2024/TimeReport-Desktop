import type { User } from "./User";
import type { WorkSession } from "./WorkSession";
import type { OvertimeTransaction } from "./OvertimeTransaction";
import type { Vacation } from "./Vacation";
import type { Sickness } from "./Sickness";
import type { PublicHoliday } from "./PublicHoliday";

export {};

declare global {
  interface Window {
    database: {
      saveWorkSession(session: WorkSession): Promise<boolean>;
      getWorkSessions(): Promise<WorkSession[]>;
      getWorkSessionsByUser(userId: string): Promise<WorkSession[]>;
      updateWorkSession(session: WorkSession): Promise<boolean>;
      deleteWorkSession(id: string): Promise<boolean>;
      migrateAdminWorkSessions(): Promise<number>;

      getWeeklyWorkMinutes(userId: string): Promise<number>;
      saveWeeklyWorkMinutes(
        userId: string,
        weeklyWorkMinutes: number,
      ): Promise<boolean>;

      getFederalState(userId: string): Promise<string>;
      saveFederalState(userId: string, federalState: string): Promise<boolean>;
      hasUserSettings(userId: string): Promise<boolean>;

      getUsers(): Promise<Omit<User, "password">[]>;
      getUserByUsername(username: string): Promise<User | undefined>;

      needsInitialSetup(): Promise<boolean>;

      createInitialAdmin(input: {
        username: string;
        displayName: string;
        password: string;
      }): Promise<Omit<User, "password">>;

      authenticateUser(
        username: string,
        password: string,
      ): Promise<Omit<User, "password"> | null>;
      createUser(user: unknown): Promise<boolean>;
      updateUser(user: unknown): Promise<boolean>;
      deleteUser(id: string): Promise<boolean>;

      saveVacation(vacation: Vacation): Promise<boolean>;
      getVacations(userId: string): Promise<Vacation[]>;
      updateVacation(vacation: Vacation): Promise<boolean>;
      deleteVacation(id: string): Promise<boolean>;
      getVacationAllowance(userId: string, year: number): Promise<number>;
      saveVacationAllowance(
        userId: string,
        year: number,
        days: number,
      ): Promise<boolean>;

      saveSickness(sickness: Sickness): Promise<boolean>;
      getSicknesses(): Promise<Sickness[]>;
      updateSickness(sickness: Sickness): Promise<boolean>;
      deleteSickness(id: string): Promise<boolean>;

      savePublicHoliday(holiday: PublicHoliday): Promise<boolean>;
      getPublicHolidays(): Promise<PublicHoliday[]>;
      deletePublicHoliday(id: string): Promise<boolean>;

      saveOvertimeTransaction(
        transaction: OvertimeTransaction,
      ): Promise<{ success: boolean; message?: string }>;

      getOvertimeTransactionsByUser(
        userId: string,
      ): Promise<OvertimeTransaction[]>;

      deleteOvertimeTransaction(id: string): Promise<{ success: boolean }>;

      updateOvertimeApproval(
        id: string,
        status: "approved" | "rejected",
        decidedBy?: string,
        rejectionReason?: string,
      ): Promise<{ success: boolean; message?: string }>;

      updateVacationApproval(
        id: string,
        status: "approved" | "rejected",
        decidedBy?: string,
        rejectionReason?: string,
      ): Promise<{ success: boolean; message?: string }>;
    };
  }
}
