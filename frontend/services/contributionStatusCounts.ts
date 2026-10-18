// Presentation counts for personal contribution records, independent of proof counts.
// Use the server's authoritative financial state; never infer it from amounts or proof presence.
export function contributionStatusCounts(records: { contribution_id?: unknown; payment_state?: unknown }[]) {
  const counts = { paid: 0, awaiting: 0, declined: 0, other: 0 };
  const seen = new Set<string>();
  for (const record of records) {
    if (typeof record?.contribution_id !== 'string' || !record.contribution_id.trim() || seen.has(record.contribution_id)) return null;
    seen.add(record.contribution_id);
    switch (record.payment_state) {
      case 'confirmed': counts.paid++; break;
      case 'awaiting_payment':
      case 'awaiting_confirmation': counts.awaiting++; break;
      case 'proof_declined': counts.declined++; break;
      default: counts.other++;
    }
  }
  return counts;
}
