export const summaryLabels = {
  'membership.active_memberships': 'Active memberships',
  'contributions.recorded_expected_cents': 'Recorded expected contributions',
  'contributions.confirmed_cents': 'Confirmed contributions',
  'contributions.outstanding_cents': 'Outstanding',
  'contributions.awaiting_review_count': 'Contributions awaiting review',
  'contributions.awaiting_review_cents': 'Awaiting-review amount',
  'claims.submitted_count': 'Claims submitted',
  'claims.submitted_amount_cents': 'Submitted claim amount',
  'claims.approved_count': 'Claims approved',
  'claims.approved_amount_cents': 'Approved claim amount',
  'payouts.recorded_in_period_cents': 'Paid this month',
  'payouts.current_approved_remaining_cents': 'Still to be paid',
} as const;
export type Metric = keyof typeof summaryLabels;
export const warningCopy: Record<string, string> = {
  INVALID_AMOUNT: 'A recorded amount needs checking.',
  MISSING_REQUIRED_FIELD: 'A record is missing information needed for these figures.',
  DUPLICATE_RECORD: 'A record identifier is repeated; affected figures need checking.',
  UNSUPPORTED_RECORD_STATUS: 'A record has a status this summary cannot interpret.',
  INVALID_PAYOUT_HISTORY: 'A claim’s payment history cannot be read reliably.',
  INCOMPLETE_PAYOUT_HISTORY: 'A claim’s payment history does not fully reconcile with its recorded paid amount.',
  SUBMISSION_DATE_UNAVAILABLE: 'A claim cannot be assigned to its submission month.',
  APPROVAL_DATE_UNAVAILABLE: 'An approved claim cannot be assigned to its approval month.',
  PAYOUT_DATE_UNAVAILABLE: 'A payment cannot be assigned to its payment month.',
  CLAIM_PAYMENT_STATE_MISMATCH: 'A claim’s payment amount and status disagree.',
  CONFIRMATION_DATE_UNAVAILABLE: 'A confirmed contribution has no recorded confirmation date. Its obligation month is still used.',
  UNCONFIRMED_RECORDED_PAYMENT: 'A recorded payment amount has not been confirmed.',
  SETTLED_AMOUNT_MISMATCH: 'A settled contribution records less paid than expected.',
  SCHEDULED_DATE_INVALID: 'A scheduled payout date needs checking.',
};
export const explainWarning = (code: string) => warningCopy[code] || 'Some source information needs checking.';
export interface Summary {
  schema_version: '1'; scope: 'club_admin';
  club: { id: string; name: string };
  period: { year: number; month: number; timezone: 'Africa/Johannesburg' };
  membership: Record<string, number | null>; contributions: Record<string, number | null>;
  claims: Record<string, number | null>; payouts: Record<string, number | null>;
  availability: Record<Metric, { status: 'AVAILABLE' | 'UNAVAILABLE'; reasons: { code: string }[] }>;
  warnings: { code: string; fields: Metric[] }[];
  basis: { version: '1'; definitions: Record<Metric, object>; awaiting_review_overlaps_outstanding: true;
    liability_state: 'current_not_historical_month_end'; verified_bank_balance: false; bank_receipt_timing_used_for_period: false };
}
export function metricValue(data: Summary, field: Metric): number | null {
  const [family, name] = field.split('.');
  return (data[family as 'membership' | 'contributions' | 'claims' | 'payouts'])[name];
}
export function validateSummary(raw: unknown, clubId: string, year: number, month: number): Summary {
  const data = raw as Summary;
  const invalid = () => { throw new Error('Unexpected Club Summary response. Please retry.'); };
  if (!data || data.schema_version !== '1' || data.scope !== 'club_admin' || data.club?.id !== clubId || typeof data.club.name !== 'string'
    || data.period?.year !== year || data.period.month !== month || data.period.timezone !== 'Africa/Johannesburg'
    || data.basis?.version !== '1' || data.basis.awaiting_review_overlaps_outstanding !== true
    || data.basis.liability_state !== 'current_not_historical_month_end' || data.basis.verified_bank_balance !== false
    || data.basis.bank_receipt_timing_used_for_period !== false) invalid();
  const reasonsValid = (items: unknown) => Array.isArray(items) && items.every(r => r && typeof r.code === 'string');
  for (const field of Object.keys(summaryLabels) as Metric[]) {
    const [family] = field.split('.');
    if (!data[family as 'membership'] || !data.basis.definitions?.[field]) invalid();
    const value = metricValue(data, field), availability = data.availability?.[field];
    if (!availability || !reasonsValid(availability.reasons)) invalid();
    if (availability.status === 'AVAILABLE') {
      if (!Number.isSafeInteger(value) || (value as number) < 0 || availability.reasons.length) invalid();
    } else if (availability.status !== 'UNAVAILABLE' || value !== null || !availability.reasons.length) invalid();
  }
  if (!Array.isArray(data.warnings) || !data.warnings.every(w => w && typeof w.code === 'string'
    && Array.isArray(w.fields) && w.fields.length && w.fields.every(f => Object.hasOwn(summaryLabels, f)))) invalid();
  return data;
}
export function displayMetric(data: Summary, field: Metric): string {
  if (data.availability[field].status === 'UNAVAILABLE') return 'Unavailable';
  const value = metricValue(data, field) as number;
  return field.endsWith('_cents') ? `R${(value / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}` : String(value);
}
export function summaryError(status?: number): string {
  return ({ 401: 'Please sign in again to view Club Summary.', 403: 'Your account does not have access to this Clubvel summary.',
    404: 'This Clubvel summary is unavailable.', 422: 'Please select a valid month and year.' } as Record<number, string>)[status as number]
    || 'Unable to load Club Summary. Check your connection and retry.';
}
