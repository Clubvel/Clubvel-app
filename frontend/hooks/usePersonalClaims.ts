import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import axios from 'axios';
export type PersonalClaim = {
  claim_id: string;
  group_id: string;
  group_name: string;
  amount: number | null;
  reason: string | null;
  status: string;
  submitted_at: string | null;
  scheduled_claim_date: string | null;
  actual_amount_paid: number | null;
  rejection_reason: string | null;
};

function personalClaims(payload: unknown): PersonalClaim[] {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid claims response');
  }

  const claims = (payload as { claims?: unknown }).claims;
  if (!Array.isArray(claims)) {
    throw new Error('Invalid claims response');
  }

  return claims.map((claim: any) => {
    if (
      !claim ||
      typeof claim !== 'object' ||
      typeof claim.claim_id !== 'string' ||
      typeof claim.group_id !== 'string' ||
      typeof claim.group_name !== 'string' ||
      typeof claim.status !== 'string'
    ) {
      throw new Error('Invalid claim record');
    }

    return {
      claim_id: claim.claim_id,
      group_id: claim.group_id,
      group_name: claim.group_name,
      amount: typeof claim.amount === 'number' ? claim.amount : null,
      reason: typeof claim.reason === 'string' ? claim.reason : null,
      status: claim.status,
      submitted_at: typeof claim.submitted_at === 'string' ? claim.submitted_at : null,
      scheduled_claim_date:
        typeof claim.scheduled_claim_date === 'string'
          ? claim.scheduled_claim_date
          : null,
      actual_amount_paid:
        typeof claim.actual_amount_paid === 'number'
          ? claim.actual_amount_paid
          : null,
      rejection_reason:
        typeof claim.rejection_reason === 'string'
          ? claim.rejection_reason
          : null,
    };
  });
}

type State = { person: string | undefined; credential?: string | null; phase: 'loading' | 'ready' | 'empty' | 'error'; records: PersonalClaim[] };

export function usePersonalClaims(userId: string | undefined, token: string | null) {
  const [state, setState] = useState<State>({ person: userId, phase: 'loading', records: [] });
  const request = useRef(0);
  const apiUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
  const [refreshing, setRefreshing] = useState(false);
  const reload = useCallback(async () => {
    const ticket = ++request.current;
    setRefreshing(true);
    setState(previous => previous.person === userId && previous.credential === token && (previous.phase === 'ready' || previous.phase === 'empty')
      ? previous : { person: userId, credential: token, phase: 'loading', records: [] });
    try {
      if (!userId || !token) throw new Error('Sign in required');
      const response = await axios.get(`${apiUrl}/api/member/claims/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 15000,
      });
      const records = personalClaims(response.data);
      if (ticket === request.current) setState({ person: userId, credential: token, phase: records.length ? 'ready' : 'empty', records });
    } catch {
      if (ticket === request.current) setState({ person: userId, credential: token, phase: 'error', records: [] });
    } finally { if (ticket === request.current) setRefreshing(false); }
  }, [apiUrl, userId, token]);
  useFocusEffect(useCallback(() => {
    void reload();
    return () => { request.current += 1; };
  }, [reload]));
  return { ...(state.person === userId && state.credential === token ? state : { person: userId, phase: 'loading' as const, records: [] }), refreshing, reload };
}
