import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import axios from 'axios';
// Screen-local reads only: no storage, writes, polling or global cache.
export function useClubPreview<T>(userId: string | undefined, token: string | null, groupId: string | undefined, url: string, select: (data: unknown) => T[]) {
  const identity = JSON.stringify([userId, token, groupId, url]);
  const revision = useRef({ identity, value: 0 });
  if (revision.current.identity !== identity) revision.current = { identity, value: revision.current.value + 1 };
  const key = JSON.stringify([identity, revision.current.value]);
  const latest = useRef(key); latest.current = key;
  const sequence = useRef(0), pending = useRef<{ key: string; ticket: number } | null>(null);
  const [state, setState] = useState<{ owner: string; phase: 'ready' | 'error'; rows: T[] } | null>(null);
  const load = useCallback(async () => {
    if (!userId || !token || !groupId || latest.current !== key || pending.current?.key === key) return;
    const ticket = ++sequence.current; pending.current = { key, ticket };
    try {
      const response = await axios.get(url, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
      if (latest.current !== key || sequence.current !== ticket) return;
      const rows = select(response.data);
      setState({ owner: key, phase: 'ready', rows });
    } catch {
      if (latest.current === key && sequence.current === ticket) setState({ owner: key, phase: 'error', rows: [] });
    } finally { if (pending.current?.ticket === ticket) pending.current = null; }
  }, [key, userId, token, groupId, url, select]);
  useFocusEffect(useCallback(() => { void load(); return () => { ++sequence.current; pending.current = null; }; }, [load]));
  const current = state?.owner === key ? state : null;
  return { rows: current?.rows || [], loading: !current, error: current?.phase === 'error', reload: load };
}
