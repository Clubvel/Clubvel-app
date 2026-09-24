export interface ProofContribution {
  contribution_id: string;
  group_id: string;
  group_name: string;
  amount_due: number;
  amount_paid: number;
  contribution_status: string;
  proof_uploaded: boolean;
  month: number;
  year: number;
}

export function proofOutstanding(record: ProofContribution): number {
  return Math.max(0, Math.round((record.amount_due - record.amount_paid) * 100) / 100);
}

export function contributionRecords(data: unknown): ProofContribution[] {
  if (!data || typeof data !== 'object' || !('contributions' in data) || !Array.isArray(data.contributions)) {
    throw new Error('Contribution information is unavailable. Please retry.');
  }
  const ids = new Set<string>();
  return data.contributions.filter((record): record is ProofContribution => {
    if (!record || !['contribution_id', 'group_id', 'group_name', 'contribution_status'].every(key =>
      typeof record[key] === 'string' && record[key].trim()) ||
      ![record.amount_due, record.amount_paid].every(amount => typeof amount === 'number' && Number.isFinite(amount) && amount >= 0) ||
      typeof record.proof_uploaded !== 'boolean' || !Number.isInteger(record.month) || record.month < 1 || record.month > 12 ||
      !Number.isInteger(record.year) || record.year < 1 || ids.has(record.contribution_id)) {
      throw new Error('Could not verify the contribution information. Please retry.');
    }
    ids.add(record.contribution_id);
    return true;
  });
}

export function eligibleProofContributions(data: unknown): ProofContribution[] {
  return contributionRecords(data).filter(record => ['pending', 'due', 'late'].includes(record.contribution_status) &&
    !record.proof_uploaded && proofOutstanding(record) > 0);
}

export interface PersonalContribution extends ProofContribution {
  status: string;
  outstanding_amount: number;
  proof_eligible: boolean;
  payment_reference: string | null;
  due_date: string | null;
}

export function personalContributions(data: unknown): PersonalContribution[] {
  return contributionRecords(data).map(record => {
    const row = record as PersonalContribution;
    if (typeof row.status !== 'string' || !row.status.trim() ||
      typeof row.outstanding_amount !== 'number' || !Number.isFinite(row.outstanding_amount) || row.outstanding_amount < 0 ||
      typeof row.proof_eligible !== 'boolean' ||
      !(row.payment_reference === null || typeof row.payment_reference === 'string') ||
      !(row.due_date === null || typeof row.due_date === 'string')) {
      throw new Error('Could not verify your personal contributions. Please retry.');
    }
    return row;
  }).sort((a, b) => b.year - a.year || b.month - a.month || a.group_name.localeCompare(b.group_name));
}

export function confirmationPayload(contributionId: string | null | undefined, treasurerId: string | undefined) {
  if (!contributionId?.trim() || !treasurerId?.trim()) {
    throw new Error('A recorded contribution and signed-in administrator are required. Refresh this group.');
  }
  return { contribution_id: contributionId, treasurer_id: treasurerId };
}
