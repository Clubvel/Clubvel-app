export type RecordedPayout = {
  claim_id: string;
  club_name: string;
  recipient: string | null;
  payout_date: string | null;
  amount: number | null;
  status: string | null;
};

export function recordedPayouts(data: unknown): RecordedPayout[] {
  if (!data || typeof data !== 'object' || !('schedules' in data) || !Array.isArray(data.schedules)) {
    throw new Error('Payout records unavailable');
  }
  const ids = new Set<string>();
  return data.schedules.map(row => {
    if (!row || typeof row.claim_id !== 'string' || !row.claim_id.trim() || ids.has(row.claim_id) ||
      typeof row.club_name !== 'string' || !row.club_name.trim() ||
      !(row.recipient === null || typeof row.recipient === 'string') ||
      !(row.payout_date === null || /^\d{4}-\d{2}-\d{2}$/.test(row.payout_date)) ||
      !(row.amount === null || typeof row.amount === 'number' && Number.isFinite(row.amount) && row.amount >= 0) ||
      !(row.status === null || typeof row.status === 'string')) {
      throw new Error('Could not verify a recorded payout');
    }
    ids.add(row.claim_id);
    return row;
  });
}
