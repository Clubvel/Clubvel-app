import { PersonalContribution } from './contributions';

export function homeContributions(records: PersonalContribution[]) {
  return {
    totalPaid: Math.round(records.reduce((total, record) => total + record.amount_paid, 0) * 100) / 100,
    outstanding: records.filter(record => record.outstanding_amount > 0 &&
      ['pending', 'due', 'late', 'proof_uploaded'].includes(record.status)),
  };
}

export type PersonalClaim = { club_name: string; payout_date: string | null; amount: number | null; position: number | null };

export function personalClaims(data: unknown): PersonalClaim[] {
  if (!data || typeof data !== 'object' || !('schedules' in data) || !Array.isArray(data.schedules)) {
    throw new Error('Claim records unavailable');
  }
  return data.schedules.map(row => {
    if (!row || typeof row.club_name !== 'string' || !row.club_name.trim() ||
      !(row.payout_date === null || typeof row.payout_date === 'string') ||
      !(row.amount === null || typeof row.amount === 'number' && Number.isFinite(row.amount) && row.amount >= 0) ||
      !(row.position === null || Number.isInteger(row.position) && row.position > 0)) {
      throw new Error('Could not verify claim records');
    }
    return row;
  });
}
