import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import axios from 'axios';
import { RecordedPayout, recordedPayouts } from '../services/payouts';

type State = { person: string | undefined; phase: 'loading' | 'ready' | 'empty' | 'error'; records: RecordedPayout[] };

export function usePayoutSchedules(userId: string | undefined, token: string | null) {
  const [state, setState] = useState<State>({ person: userId, phase: 'loading', records: [] });
  const request = useRef(0);
  const apiUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
  const reload = useCallback(async () => {
    const ticket = ++request.current;
    setState({ person: userId, phase: 'loading', records: [] });
    try {
      if (!userId || !token) throw new Error('Sign in required');
      const response = await axios.get(`${apiUrl}/api/admin/payout-schedules/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 15000,
      });
      const records = recordedPayouts(response.data);
      if (ticket === request.current) setState({ person: userId, phase: records.length ? 'ready' : 'empty', records });
    } catch {
      if (ticket === request.current) setState({ person: userId, phase: 'error', records: [] });
    }
  }, [apiUrl, userId, token]);
  useFocusEffect(useCallback(() => {
    void reload();
    return () => { request.current += 1; };
  }, [reload]));
  return { ...(state.person === userId ? state : { person: userId, phase: 'loading' as const, records: [] }), reload };
}
