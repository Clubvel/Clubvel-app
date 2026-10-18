import React, { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useClubPreview } from '../hooks/useClubPreview';
import { activityRows, personalActivity, type ActivityRecord } from '../services/dashboardActivity';
import { DashboardActivityCard } from './ClubDashboard';
export default function MemberRecentActivity({ groupId, clubName, onOpen, onViewAll }: { groupId: string; clubName: string; onOpen: (record: ActivityRecord) => void; onViewAll: () => void }) {
  const { user, token } = useAuth();
  const select = useCallback((data: unknown) => {
    const rows = personalActivity(data);
    if (rows.some(r => r.user_id && r.user_id !== user?.id)) throw new Error('Ownership mismatch');
    return rows.filter(r => r.group_id === groupId);
  }, [groupId, user?.id]);
  const state = useClubPreview(user?.id, token, groupId, `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/member/contributions/${user?.id}`, select);
  const rows = activityRows(state.rows, groupId, clubName, user?.id || '', onOpen);
  return <DashboardActivityCard title="Recent Activity" subtitle="Your latest contribution records" rows={rows} loading={state.loading} error={state.error} onRetry={() => void state.reload()} onViewAll={onViewAll} emptyText="No contribution activity recorded for this club yet." />;
}
