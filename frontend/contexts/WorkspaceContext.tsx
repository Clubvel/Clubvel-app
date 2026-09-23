import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useRouter } from 'expo-router';
import { useAuth } from './AuthContext';
import { ActiveClub, activeMemberships, selectedMembership, workspaceRoute, workspaceStorageKey } from '../services/workspace';

interface WorkspaceContextValue {
  clubs: ActiveClub[] | null;
  membershipError: string | null;
  selectedClub: ActiveClub | null;
  ready: boolean;
  checking: boolean;
  workspaceError: string | null;
  refreshMemberships: () => Promise<ActiveClub[]>;
  selectGroup: (id: string) => Promise<void>;
  personalHome: () => Promise<void>;
  restoreWorkspace: () => Promise<void>;
  retryWorkspace: () => Promise<void>;
}
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return <WorkspaceSession key={user?.id || 'signed-out'}>{children}</WorkspaceSession>;
}

function WorkspaceSession({ children }: { children: React.ReactNode }) {
  const { user, token } = useAuth();
  const router = useRouter();
  const userId = user?.id;
  const owner = useRef(userId);
  owner.current = userId;
  const [clubs, setClubs] = useState<ActiveClub[] | null>(null);
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const operation = useRef(0);
  const pending = useRef<{ userId: string; promise: Promise<ActiveClub[]> } | null>(null);
  const requestedGroup = useRef<string | null>(null);
  // Serialize persistence so a quick Personal Home/group switch cannot be overwritten.
  const writes = useRef(Promise.resolve());
  const persist = useCallback((person: string, id: string | null) => {
    const write = writes.current.catch(() => {}).then(() => id
      ? AsyncStorage.setItem(workspaceStorageKey(person), id)
      : AsyncStorage.removeItem(workspaceStorageKey(person)));
    writes.current = write;
    return write;
  }, []);

  const refreshMemberships = useCallback((): Promise<ActiveClub[]> => {
    if (!userId) return Promise.reject(new Error('Please sign in again.'));
    if (pending.current?.userId === userId) return pending.current.promise;
    const promise = axios.get(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/member/clubs/${userId}`, {
      headers: { Authorization: `Bearer ${token}` }, timeout: 15000,
    }).then(response => {
      const list = activeMemberships(response.data);
      if (owner.current === userId) { setClubs(list); setMembershipError(null); }
      return list;
    }).catch(error => {
      if (owner.current === userId) {
        setClubs(null);
        setMembershipError(error instanceof Error ? error.message : 'Could not load memberships.');
      }
      throw error;
    }).finally(() => { if (pending.current?.promise === promise) pending.current = null; });
    pending.current = { userId, promise };
    return promise;
  }, [userId, token]);

  useEffect(() => {
    owner.current = userId;
    return () => {
      operation.current += 1;
      owner.current = undefined;
    };
  }, [userId]);

  const restoreWorkspace = useCallback(async () => {
    if (!userId) return;
    requestedGroup.current = null;
    const ticket = ++operation.current;
    setChecking(true); setWorkspaceError(null);
    try {
      // Storage and network do not depend on each other.
      const [stored, list] = await Promise.all([
        writes.current.catch(() => {}).then(() => AsyncStorage.getItem(workspaceStorageKey(userId))),
        refreshMemberships(),
      ]);
      if (ticket !== operation.current || owner.current !== userId) return;
      const club = selectedMembership(list, stored);
      if (stored && !club) await persist(userId, null);
      if (ticket !== operation.current || owner.current !== userId) return;
      setSelectedId(club?.id ?? null); setReady(true);
      router.replace(workspaceRoute(club));
    } catch {
      if (ticket === operation.current && owner.current === userId) {
        setWorkspaceError('Could not verify your group membership. Retry, or return to Personal Home.');
      }
    } finally { if (ticket === operation.current) setChecking(false); }
  }, [userId, refreshMemberships, persist, router]);

  const selectGroup = useCallback(async (id: string) => {
    if (!userId) return;
    requestedGroup.current = id;
    const ticket = ++operation.current;
    setChecking(true); setWorkspaceError(null);
    try {
      const list = await refreshMemberships();
      if (ticket !== operation.current || owner.current !== userId) return;
      const club = selectedMembership(list, id);
      await persist(userId, club?.id ?? null);
      if (ticket !== operation.current || owner.current !== userId) return;
      setSelectedId(club?.id ?? null); setReady(true);
      router.replace(workspaceRoute(club));
    } catch {
      if (ticket === operation.current && owner.current === userId) {
        setWorkspaceError('Could not verify or save this group selection. Retry, or return to Personal Home.');
      }
    } finally { if (ticket === operation.current) setChecking(false); }
  }, [userId, refreshMemberships, persist, router]);

  const personalHome = useCallback(async () => {
    requestedGroup.current = null;
    const ticket = ++operation.current;
    setSelectedId(null); setReady(true); setChecking(false); setWorkspaceError(null);
    router.replace('/(member)/home');
    if (userId) {
      try { await persist(userId, null); }
      catch { if (ticket === operation.current) setWorkspaceError('Could not save Personal Home as your selection. Please retry.'); }
    }
  }, [userId, persist, router]);

  useEffect(() => {
    let previous = AppState.currentState;
    const listener = AppState.addEventListener('change', next => {
      if (next === 'active' && previous !== 'active' && userId) {
        if (selectedId) void restoreWorkspace();
        else void refreshMemberships().catch(() => {});
      }
      previous = next;
    });
    return () => listener.remove();
  }, [userId, selectedId, restoreWorkspace, refreshMemberships]);

  return <WorkspaceContext.Provider value={{ clubs, membershipError, selectedClub: selectedMembership(clubs || [], selectedId), ready, checking, workspaceError, refreshMemberships, selectGroup, personalHome, restoreWorkspace, retryWorkspace: () => requestedGroup.current ? selectGroup(requestedGroup.current) : restoreWorkspace() }}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('WorkspaceProvider is required.');
  return value;
}
