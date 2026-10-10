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
  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
  
  const logout = useCallback(async () => {
    try {
      try { await sessionStorage.clearToken(); }
      finally { await AsyncStorage.multiRemove(AUTH_STORAGE_KEYS); }
    } finally {
      setToken(null);
      setUser(null);
    }
  }, []);

  // Activity is tracked in memory; touch events write at most once per 15 seconds.
  // Neither interaction nor restoration extends the backend JWT expiration.
  const refreshSession = useCallback(() => {
    const now = Date.now();
    if (!token || sessionExpired(token, lastActivityRef.current, now) || now - lastActivityRef.current < 15000) return;
    lastActivityRef.current = now;
    void AsyncStorage.setItem('last_activity', String(now)).catch(() => console.warn('Could not save session activity.'));
  }, [token]);

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

  useEffect(() => {
    // Load stored auth data on mount
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      const [storedToken, storedUser, activity] = await Promise.all([sessionStorage.getToken(), AsyncStorage.getItem('user_data'), AsyncStorage.getItem('last_activity')]);
      const session = restoreStoredSession(storedToken, storedUser, activity);
      if (session) {
        lastActivityRef.current = session.lastActivity;
        setToken(session.token);
        setUser(session.user);
      } else {
        await sessionStorage.clearToken();
        await AsyncStorage.multiRemove(AUTH_STORAGE_KEYS);
      }
    } catch (error) {
      console.error('Error loading stored auth:', error);
    } finally {
      setLoading(false);
    }
  };

  const register = authentication.register;
  const sendOTP = authentication.sendOTP;
  const verifyOTP = authentication.verifyOTP;

  const login = async (phone: string, password: string) => {
    try {
      const { access_token, user: userData } = await authentication.login(phone, password);
      if (!access_token || !userData?.id) throw new Error('Clubvel returned an invalid session. Please try again.');
      await sessionStorage.setToken(access_token);
      await AsyncStorage.multiSet([
        ['user_data', JSON.stringify(userData)],
        ['last_activity', Date.now().toString()],
      ]);
      lastActivityRef.current = Date.now();
      setToken(access_token);
      setUser(userData);
    } catch (error) { throw authenticationError(error); }
  };

  const updateProfilePhoto = async (photoBase64: string) => {
    try {
      await axios.post(`${API_URL}/api/user/profile-photo`, {
        user_id: user?.id,
        profile_photo: photoBase64
      }, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
      
      if (identityRef.current.user?.id === user?.id && identityRef.current.token === token && identityRef.current.user) {
        const updatedUser = { ...identityRef.current.user, profile_photo: photoBase64 };
        identityRef.current.user = updatedUser;
        setUser(updatedUser);
        await AsyncStorage.setItem('user_data', JSON.stringify(updatedUser));
      }
    } catch (error: any) {
      console.error('Error updating profile photo:', error);
      throw new Error(error.response?.data?.detail || 'Failed to update profile photo');
    }
  };

  const updateProfile = async (fullName: string) => {
    if (!user?.id || !token) throw new Error('Please sign in again.');
    const accountId = user.id;
    const sessionToken = token;
    try {
      const response = await axios.put(`${API_URL}/api/user/profile`, { full_name: fullName }, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 15000,
      });
      if (identityRef.current.user?.id !== accountId || identityRef.current.token !== sessionToken) return;
      if (typeof response.data?.full_name !== 'string' || !response.data.full_name.trim()) throw new Error('Invalid profile response.');
      const updatedUser = { ...identityRef.current.user, full_name: response.data.full_name };
      identityRef.current.user = updatedUser;
      setUser(updatedUser);
      await AsyncStorage.setItem('user_data', JSON.stringify(updatedUser));
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
