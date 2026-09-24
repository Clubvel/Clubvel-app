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

export function eligibleProofContributions(data: unknown): ProofContribution[] {
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
    return ['pending', 'due', 'late'].includes(record.contribution_status) &&
      !record.proof_uploaded && proofOutstanding(record) > 0;
  });
}

export function confirmationPayload(contributionId: string | null | undefined, treasurerId: string | undefined) {
  if (!contributionId?.trim() || !treasurerId?.trim()) {
    throw new Error('A recorded contribution and signed-in administrator are required. Refresh this group.');
  }
  return { contribution_id: contributionId, treasurer_id: treasurerId };
}
