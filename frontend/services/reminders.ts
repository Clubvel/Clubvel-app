import { eligibleProofContributions, proofOutstanding } from './contributions';

// Accept formatting punctuation, but never silently discard letters or extensions.
function normalizeReminderPhone(value: unknown): string | null {
  if (typeof value !== 'string' || !/^[+\d\s().-]+$/.test(value.trim())) return null;
  let phone = value.trim().replace(/[\s().-]/g, '');
  if (/^0[1-9]\d{8}$/.test(phone)) return `27${phone.slice(1)}`;
  if (phone.startsWith('00')) phone = `+${phone.slice(2)}`;
  if (/^27[1-9]\d{8}$/.test(phone)) return phone;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return null;
  if (phone.startsWith('+27') && !/^\+27[1-9]\d{8}$/.test(phone)) return null;
  return phone.slice(1);
}

export function reminderLink(data: unknown, groupId: string, memberId: string, contributionId: string): string {
  const row = data as any;
  if (!row || row.group_id !== groupId || row.member_id !== memberId || row.contribution_id !== contributionId ||
      !['pending', 'due', 'late'].includes(row.status) ||
      eligibleProofContributions({ contributions: [row] }).length !== 1) {
    throw new Error('No verified payable contribution is available. Refresh this group.');
  }
  const phone = normalizeReminderPhone(row.phone);
  if (!phone) throw new Error('The member phone number is missing or invalid. Update the contact details before preparing a reminder.');
  const memberName = typeof row.member_name === 'string' ? row.member_name.trim().split(/\s+/)[0] : '';
  const groupName = row.group_name.trim();
  if (!memberName || !groupName) throw new Error('The member or group name is unavailable.');
  const outstanding = proofOutstanding(row);
  if (!Number.isSafeInteger(Math.round(outstanding * 100))) throw new Error('The contribution amount could not be verified.');
  const amount = outstanding.toFixed(2);
  const message = `Hi ${memberName}, this is a friendly reminder that your R${amount} contribution for ${groupName} is still outstanding. Please make your payment when convenient. Thank you.`;
  return `whatsapp://send?phone=${phone}&text=${encodeURIComponent(message)}`;
}
