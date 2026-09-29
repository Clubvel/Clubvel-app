import React, { createContext, useState, useContext, useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { AppState, AppStateStatus, Alert, View } from 'react-native';

import { authentication, authenticationError, OTPResult } from '../services/authentication';
import { AUTH_STORAGE_KEYS, restoreStoredSession, sessionExpired } from '../services/session';

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

  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
  
  const logout = useCallback(async () => {
    try {
      await AsyncStorage.multiRemove(AUTH_STORAGE_KEYS);
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
      const [storedToken, storedUser, activity] = await Promise.all(AUTH_STORAGE_KEYS.map(key => AsyncStorage.getItem(key)));
      const session = restoreStoredSession(storedToken, storedUser, activity);
      if (session) {
        lastActivityRef.current = session.lastActivity;
        setToken(session.token);
        setUser(session.user);
      } else {
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
      await AsyncStorage.multiSet([
        ['auth_token', access_token], ['user_data', JSON.stringify(userData)],
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
      
      if (user) {
        const updatedUser = { ...user, profile_photo: photoBase64 };
        setUser(updatedUser);
        await AsyncStorage.setItem('user_data', JSON.stringify(updatedUser));
      }
    } catch (error: any) {
      console.error('Error updating profile photo:', error);
      throw new Error(error.response?.data?.detail || 'Failed to update profile photo');
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
