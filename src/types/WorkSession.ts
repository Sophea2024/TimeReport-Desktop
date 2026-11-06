export type WorkSessionStatus =
  | "in_progress"
  | "completed"
  | "auto_closed"
  | "needs_correction"
  | "sick"
  | "vacation";

export interface WorkPause {
  id: string;
  start: Date;
  end?: Date;
}

export interface WorkInterval {
  id: string;
  start: Date;
  end?: Date;
}

export interface WorkSession {
  id: string;

  userId: string;

  date: string;

  workLocation: "office" | "homeoffice" | "business_trip" | "sick";

  loginTime: Date;

  logoutTime?: Date;

  workStart: Date;

  workEnd?: Date;

  pauseStart?: Date;

  pauseEnd?: Date;
  // Neue Unterstützung für mehrere Pausen
  pauses?: WorkPause[];

  // Mehrere Arbeitsintervalle zwischen den Pausen
  workIntervals?: WorkInterval[];

  totalPauseMinutes: number;

  totalWorkMinutes: number;

  status?: WorkSessionStatus;
}
