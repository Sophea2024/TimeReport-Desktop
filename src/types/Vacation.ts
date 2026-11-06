export interface Vacation {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  totalDays: number;

  // Genehmigung
  status?: "pending" | "approved" | "rejected";
  requestedAt?: string;
  decidedAt?: string;
  decidedBy?: string;
  rejectionReason?: string;
}
