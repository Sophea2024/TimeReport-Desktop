export type OvertimeTransactionType = "earned" | "time_off" | "payout";

export interface OvertimeTransaction {
  id: string;
  userId: string;
  date: string;
  minutes: number;
  type: OvertimeTransactionType;
  days: number;
  note?: string;
  status?: "pending" | "approved" | "rejected";
  requestedAt?: string;
  decidedAt?: string;
  decidedBy?: string;
  rejectionReason?: string;
}
