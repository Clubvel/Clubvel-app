import type { ActivityRow } from '../components/ClubDashboard';
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export type ActivityRecord = { contribution_id: string; group_id: string; month: number; year: number; payment_state?: string; payment_date?: string | null; user_id?: string; id?: string | null; member_name?: string; proof_uploaded?: boolean; proof_review_status?: string | null; contribution_status?: string | null };
export function personalActivity(data: unknown): ActivityRecord[] {
  const records = (data as { contributions?: ActivityRecord[] })?.contributions;
  if (!Array.isArray(records) || records.some(r => !r || typeof r.contribution_id !== 'string' || typeof r.group_id !== 'string' || !Number.isInteger(r.month) || r.month < 1 || r.month > 12 || !Number.isInteger(r.year) || r.year < 1 || r.year > 9999) || new Set(records.map(r => r.contribution_id)).size !== records.length) throw new Error('Invalid personal contributions');
  return records;
}
export function activityRows(records: ActivityRecord[], groupId: string, clubName: string, userId: string, open: (record: ActivityRecord) => void): ActivityRow[] {
  if (records.some(r => r.user_id && r.user_id !== userId)) throw new Error('Personal ownership mismatch');
  return records.filter(r => r.group_id === groupId).sort((a,b) => b.year-a.year || b.month-a.month).slice(0,3).map(r => {
    const title = ({ confirmed: 'Payment confirmed', awaiting_confirmation: 'Proof awaiting review', proof_declined: 'Proof declined', awaiting_payment: 'Awaiting payment', excused: 'Contribution excused', missing_record: 'Missing record', invalid_amount: 'Amount needs checking' } as Record<string,string>)[r.payment_state || ''] || 'Contribution recorded';
    const state: ActivityRow['state'] = r.payment_state === 'confirmed' ? 'paid' : r.payment_state === 'proof_declined' || r.payment_state === 'invalid_amount' ? 'declined' : ['awaiting_confirmation','awaiting_payment'].includes(r.payment_state || '') ? 'pending' : 'recorded';
    // The API exposes obligation periods, not a complete event timeline. Do not invent event times.
    return { id: r.contribution_id, title, detail: `${clubName} · ${months[r.month-1]} ${r.year}`, state, onPress: () => open(r) };
  });
}
