// Mirrors the existing monthly Payments summary eligibility; never recalculates its cards.
export type PaymentSummaryRecord = {
  amount_due: number | null;
  amount_paid: number;
  contribution_status: string | null;
  status: string;
};
export function paymentRemaining(record: PaymentSummaryRecord): number | null {
  const due = record.amount_due, paid = record.amount_paid;
  if (typeof due !== 'number' || typeof paid !== 'number' || !Number.isFinite(due) || !Number.isFinite(paid) || due < 0 || paid < 0) return null;
  if (['confirmed', 'paid', 'excused'].includes(record.contribution_status || '')) return 0;
  return Math.round(Math.max(0, due - paid) * 100) / 100;
}
export function paymentSummaryRecords<T extends PaymentSummaryRecord>(records: T[], summary: { collected: number; outstanding: number }) {
  const eligible = records.filter(record => record.status !== 'excused' && paymentRemaining(record) !== null);
  const collected = eligible.filter(record => record.amount_paid > 0);
  const outstanding = eligible.filter(record => (paymentRemaining(record) || 0) > 0);
  const matches = (actual: number, expected: number) => Number.isFinite(expected) && Math.abs(actual - expected) < 0.005;
  return {
    collected, outstanding,
    collectedMatches: matches(collected.reduce((sum, record) => sum + record.amount_paid, 0), summary.collected),
    outstandingMatches: matches(outstanding.reduce((sum, record) => sum + (paymentRemaining(record) || 0), 0), summary.outstanding),
  };
}
