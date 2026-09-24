import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import axios from 'axios';
import { GroupReport, groupReport } from '../services/reports';

type State = { key: string; phase: 'loading' | 'ready' | 'empty' | 'error'; report: GroupReport | null };
export function useGroupReport(person: string | undefined, token: string | null, groupId: string | undefined, year: number, month: number | null) {
  const key = JSON.stringify([person, token, groupId, year, month]);
  const [state, setState] = useState<State>({ key, phase: 'loading', report: null });
  const request = useRef(0);
  const reload = useCallback(async () => {
    const ticket = ++request.current;
    setState({ key, phase: 'loading', report: null });
    try {
      if (!person || !token || !groupId) throw new Error('Select an administrative group.');
      const response = await axios.get(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/treasurer/reports/${encodeURIComponent(groupId)}`, {
        params: { year, ...(month !== null ? { month } : {}) },
        headers: { Authorization: `Bearer ${token}` }, timeout: 15000,
      });
      const report = groupReport(response.data, groupId, year, month);
      if (ticket === request.current) setState({ key, phase: report.rows.length ? 'ready' : 'empty', report });
    } catch {
      if (ticket === request.current) setState({ key, phase: 'error', report: null });
    }
  }, [key, person, token, groupId, year, month]);
  useFocusEffect(useCallback(() => {
    void reload();
    return () => { request.current += 1; };
  }, [reload]));
  return { ...(state.key === key ? state : { key, phase: 'loading' as const, report: null }), reload };
}
