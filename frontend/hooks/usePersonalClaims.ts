import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import axios from 'axios';
import { PersonalClaim, personalClaims } from '../services/personalHome';

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
      const response = await axios.get(`${apiUrl}/api/member/payout-schedule/${userId}`, {
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
