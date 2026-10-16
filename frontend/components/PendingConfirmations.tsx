import React, { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useClubPreview } from '../hooks/useClubPreview';
import { DashboardActivityCard, type ActivityRow } from './ClubDashboard';
type PendingRow = { id: string | null; member_name: string; contribution_status?: string; proof_uploaded?: boolean; proof_review_status?: string | null };
export default function PendingConfirmations({ groupId, month, year, onReview }: { groupId: string; month: number; year: number; onReview: () => void }) {
  const { user, token } = useAuth();
  const select = useCallback((data: unknown) => {
    const records = (data as { contributions?: PendingRow[] })?.contributions;
    if (!Array.isArray(records)) throw new Error('Invalid review response');
    const pending = records.filter(r => r && r.id && r.proof_uploaded && r.contribution_status === 'proof_uploaded' && [null,undefined,'pending'].includes(r.proof_review_status));
    if (pending.some(r => typeof r.id !== 'string' || typeof r.member_name !== 'string') || new Set(pending.map(r => r.id)).size !== pending.length) throw new Error('Invalid confirmation records');
    return pending;
  }, []);
  const state = useClubPreview(user?.id, token, groupId, `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/treasurer/contributions/${encodeURIComponent(groupId)}/month/${month}/year/${year}?treasurer_id=${encodeURIComponent(user?.id || '')}`, select);
  const rows: ActivityRow[] = state.rows.slice(0,3).map(r => ({ id: r.id!, title: r.member_name, detail: `${month}/${year} · Awaiting confirmation`, state: 'pending', onPress: onReview }));
  return <DashboardActivityCard title="Pending Confirmations" rows={rows} loading={state.loading} error={state.error} onRetry={() => void state.reload()} onViewAll={onReview} emptyText="No proofs awaiting confirmation for this period." />;
}
