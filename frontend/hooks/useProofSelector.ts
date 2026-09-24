import { useCallback, useEffect, useRef, useState } from 'react';
import { ProofContribution } from '../services/contributions';

type SelectorState = {
  visible: boolean;
  phase: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
  contributions: ProofContribution[];
  error: string | null;
};
const initial: SelectorState = { visible: false, phase: 'idle', contributions: [], error: null };

export function useProofSelector(load: () => Promise<ProofContribution[]>) {
  const [state, setState] = useState<SelectorState>(initial);
  const request = useRef(0);
  useEffect(() => {
    setState(initial);
    return () => { request.current += 1; };
  }, [load]);
  const close = useCallback(() => {
    request.current += 1;
    setState(initial);
  }, []);
  const open = useCallback(async () => {
    const ticket = ++request.current;
    setState({ visible: true, phase: 'loading', contributions: [], error: null });
    try {
      const contributions = await load();
      if (ticket === request.current) setState({ visible: true, phase: contributions.length ? 'ready' : 'empty', contributions, error: null });
    } catch {
      if (ticket === request.current) setState({ visible: true, phase: 'error', contributions: [], error: 'Could not load eligible contributions. Please retry.' });
    }
  }, [load]);
  return { ...state, open, close };
}
