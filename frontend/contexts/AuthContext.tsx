import React, { createContext, useState, useContext, useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { AppState, AppStateStatus, Alert, View } from 'react-native';

import { authentication, authenticationError, OTPResult } from '../services/authentication';
import { AUTH_STORAGE_KEYS, restoreStoredSession, sessionExpired } from '../services/session';
import { sessionStorage } from '../services/sessionStorage';

interface User {
  id: string;
  full_name: string;
  phone_number: string;
  profile_photo?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  register: (fullName: string, phone: string, password: string) => Promise<OTPResult>;
  verifyOTP: (phone: string, otp: string) => Promise<void>;
  sendOTP: (phone: string) => Promise<OTPResult>;
  logout: () => Promise<void>;
  updateProfilePhoto: (photoBase64: string) => Promise<void>;
  updateProfile: (fullName: string) => Promise<void>;
  refreshSession: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const lastActivityRef = useRef<number>(Date.now());
  const sessionCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const identityRef = useRef({ user, token });
  identityRef.current = { user, token };
  const sessionRevision = useRef(0);
  const storageQueue = useRef<Promise<void>>(Promise.resolve());
  // Credential and profile writes share an order: logout/new login must win over an older save.
  const persist = useCallback((operation: () => Promise<void>) => {
    const next = storageQueue.current.catch(() => {}).then(operation);
    storageQueue.current = next;
    return next;
  }, []);
  const persistProfile = (revision: number, accountId: string, sessionToken: string,
    patch: Partial<Pick<User, 'full_name' | 'profile_photo'>>) => persist(async () => {
    if (sessionRevision.current !== revision || identityRef.current.user?.id !== accountId || identityRef.current.token !== sessionToken) return;
    const updatedUser = { ...identityRef.current.user, ...patch };
    await AsyncStorage.setItem('user_data', JSON.stringify(updatedUser));
    if (sessionRevision.current !== revision) return;
    identityRef.current.user = updatedUser;
    setUser(updatedUser);
  });
  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
  
  const logout = useCallback(async () => {
    ++sessionRevision.current;
    identityRef.current = { user: null, token: null };
    setToken(null);
    setUser(null);
    await persist(async () => {
      try { await sessionStorage.clearToken(); }
      finally { await AsyncStorage.multiRemove(AUTH_STORAGE_KEYS); }
    });
  }, [persist]);

  // Activity is tracked in memory; touch events write at most once per 15 seconds.
  // Neither interaction nor restoration extends the backend JWT expiration.
  const refreshSession = useCallback(() => {
    const now = Date.now();
    if (!token || sessionExpired(token, lastActivityRef.current, now) || now - lastActivityRef.current < 15000) return;
    lastActivityRef.current = now;
    const revision = sessionRevision.current;
    void persist(async () => {
      if (revision === sessionRevision.current && identityRef.current.token === token) await AsyncStorage.setItem('last_activity', String(now));
    }).catch(() => console.warn('Could not save session activity.'));
  }, [token, persist]);

  const checkSessionTimeout = useCallback(async () => {
    if (!token || !sessionExpired(token, lastActivityRef.current)) return;
    try {
      await logout();
      Alert.alert('Session Expired', 'Your session has expired. Please log in again.');
    } catch { console.warn('Could not clear expired session storage.'); setToken(null); setUser(null); }
  }, [token, logout]);

  // Monitor app state changes
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        // App has come to the foreground - check session
        void checkSessionTimeout();
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [checkSessionTimeout]);

  // Start session check interval when logged in
  useEffect(() => {
    if (user?.id && token) {
      // Check session every minute
      sessionCheckIntervalRef.current = setInterval(checkSessionTimeout, 60 * 1000);
    } else {
      if (sessionCheckIntervalRef.current) {
        clearInterval(sessionCheckIntervalRef.current);
        sessionCheckIntervalRef.current = null;
      }
    }

    return () => {
      if (sessionCheckIntervalRef.current) {
        clearInterval(sessionCheckIntervalRef.current);
      }
    };
  }, [user?.id, token, checkSessionTimeout]);

  const loadStoredAuth = useCallback(async () => {
    const revision = sessionRevision.current;
    try {
      const [storedToken, storedUser, activity] = await Promise.all([sessionStorage.getToken(), AsyncStorage.getItem('user_data'), AsyncStorage.getItem('last_activity')]);
      if (revision !== sessionRevision.current) return;
      const session = restoreStoredSession(storedToken, storedUser, activity);
      if (session) {
        lastActivityRef.current = session.lastActivity;
        identityRef.current = { user: session.user, token: session.token };
        setToken(session.token);
        setUser(session.user);
      } else {
        await persist(async () => {
          if (revision !== sessionRevision.current) return;
          try { await sessionStorage.clearToken(); }
          finally { await AsyncStorage.multiRemove(AUTH_STORAGE_KEYS); }
        });
      }
    } catch (error) {
      console.error('Error loading stored auth:', error);
    } finally {
      setLoading(false);
    }
  }, [persist]);

  useEffect(() => {
    void loadStoredAuth();
  }, [loadStoredAuth]);

  const register = authentication.register;
  const sendOTP = authentication.sendOTP;
  const verifyOTP = authentication.verifyOTP;

  const login = async (phone: string, password: string) => {
    const revision = ++sessionRevision.current;
    try {
      const { access_token, user: userData } = await authentication.login(phone, password);
      if (!access_token || !userData?.id) throw new Error('Clubvel returned an invalid session. Please try again.');
      await persist(async () => {
        if (revision !== sessionRevision.current) return;
        await sessionStorage.setToken(access_token);
        await AsyncStorage.multiSet([
          ['user_data', JSON.stringify(userData)],
          ['last_activity', Date.now().toString()],
        ]);
        if (revision !== sessionRevision.current) return;
        lastActivityRef.current = Date.now();
        identityRef.current = { user: userData, token: access_token };
        setToken(access_token);
        setUser(userData);
      });
    } catch (error) { throw authenticationError(error); }
  };

  const updateProfilePhoto = async (photoBase64: string) => {
    if (!user?.id || !token) throw new Error('Please sign in again.');
    const revision = sessionRevision.current;
    const accountId = user.id;
    const sessionToken = token;
    try {
      await axios.post(`${API_URL}/api/user/profile-photo`, {
        user_id: user?.id,
        profile_photo: photoBase64
      }, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
      
      if (revision !== sessionRevision.current) return;
      await persistProfile(revision, accountId, sessionToken, { profile_photo: photoBase64 });
    } catch (error: any) {
      console.error('Error updating profile photo:', error);
      throw new Error(error.response?.data?.detail || 'Failed to update profile photo');
    }
  };

  const updateProfile = async (fullName: string) => {
    if (!user?.id || !token) throw new Error('Please sign in again.');
    const accountId = user.id;
    const sessionToken = token;
    const revision = sessionRevision.current;
    try {
      const response = await axios.put(`${API_URL}/api/user/profile`, { full_name: fullName }, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 15000,
      });
      if (revision !== sessionRevision.current || identityRef.current.user?.id !== accountId || identityRef.current.token !== sessionToken) return;
      if (typeof response.data?.full_name !== 'string' || !response.data.full_name.trim()) throw new Error('Invalid profile response.');
      await persistProfile(revision, accountId, sessionToken, { full_name: response.data.full_name });
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || error.message || 'Could not update profile.');
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      token, 
      loading, 
      login, 
      register, 
      verifyOTP, 
      sendOTP,
      logout, 
      updateProfilePhoto,
      updateProfile,
      refreshSession,
    }}>
      <View style={{ flex: 1 }} onTouchStart={refreshSession}>{children}</View>
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
