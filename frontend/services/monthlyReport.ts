export const REPORT_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export interface ReportPeriod { year: number; month: number }
export function currentReportPeriod(now = new Date()): ReportPeriod {
  const parts = new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: 'numeric' }).formatToParts(now);
  return { year: Number(parts.find(p => p.type === 'year')!.value), month: Number(parts.find(p => p.type === 'month')!.value) };
}
export function moveReportMonth(period: ReportPeriod, delta: number): ReportPeriod {
  const index = period.year * 12 + period.month - 1 + delta;
  return { year: Math.floor(index / 12), month: index % 12 + 1 };
}
// Matches the existing Reports PDF Rand convention without changing export generation.
export const reportRand = (amount: number) => `R${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
interface Person { member_id: string | null; member_name: string }
interface ClaimRow extends Person { claim_id: string; claim_amount: number; status: string }
export interface MonthlyReportData {
  schema_version: number;
  club: { id: string; name: string };
  period: ReportPeriod & { timezone: string };
  generated_at: string;
  basis: string;
  summary: { expected: number; confirmed: number; outstanding: number; awaiting_review: number;
    claims_submitted_count: number; claims_submitted_amount: number; claims_approved_count: number;
    claims_approved_amount: number; actual_payouts: number; current_commitments: number };
  contributions: (Person & { id: string; expected: number; confirmed: number; outstanding: number; status: string; proof_review_status: string | null; confirmation_date: string | null })[];
  claim_activity: { submitted: (ClaimRow & { submitted_at: string })[]; approved: (ClaimRow & { reviewed_at: string })[] };
  payout_payments: (ClaimRow & { id: string; amount: number; actual_payment_date: string })[];
  current_commitments: (ClaimRow & { actual_amount_paid: number; remaining: number; scheduled_claim_date: string | null })[];
  unallocated_activity: (ClaimRow & { activity: string; amount?: number })[];
  warnings: { code: string; record_id: string; message: string }[];
  empty_period: boolean;
}
