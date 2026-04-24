import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { AppState, AppStateStatus, Alert, Platform } from 'react-native';

// Session timeout in milliseconds (30 minutes)
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

// Firebase Phone Auth imports - only for native platforms
let firebaseAuth: any = null;
if (Platform.OS !== 'web') {
  try {
    firebaseAuth = require('@react-native-firebase/auth').default;
  } catch (e) {
    console.log('[Auth] Firebase Auth not available, using mock OTP');
  }
}

interface User {
  id: string;
  full_name: string;
  phone_number: string;
  role: string;
  roles?: string[];
  has_multiple_roles?: boolean;
  profile_photo?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<{ has_multiple_roles: boolean; roles: string[] }>;
  register: (fullName: string, phone: string, password: string, role: string) => Promise<{ userId: string; otp: string; confirmation?: any; already_registered?: boolean }>;
  verifyOTP: (phone: string, otp: string, confirmation?: any) => Promise<void>;
  sendFirebaseOTP: (phone: string) => Promise<any>;
  logout: () => Promise<void>;
  updateProfilePhoto: (photoBase64: string) => Promise<void>;
  refreshSession: () => void;
  isFirebaseAvailable: boolean;
  switchRole: (newRole: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const lastActivityRef = useRef<number>(Date.now());
  const sessionCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
  
  // Check if Firebase Auth is available (native platforms only)
  const isFirebaseAvailable = Platform.OS !== 'web' && firebaseAuth !== null;

  /**
   * Format South African phone number to international format
   */
  const formatSAPhoneNumber = (phone: string): string => {
    let cleaned = phone.replace(/[\s\-\(\)]/g, '');
    if (cleaned.startsWith('0')) {
      cleaned = '+27' + cleaned.substring(1);
    }
    if (!cleaned.startsWith('+')) {
      cleaned = '+27' + cleaned;
    }
    return cleaned;
  };

  /**
   * Send OTP via Firebase Phone Auth (native) or mock (web)
   */
  const sendFirebaseOTP = async (phone: string): Promise<any> => {
    if (isFirebaseAvailable) {
      try {
        const formattedNumber = formatSAPhoneNumber(phone);
        console.log('[Firebase] Sending OTP to:', formattedNumber);
        const confirmation = await firebaseAuth().signInWithPhoneNumber(formattedNumber);
        console.log('[Firebase] OTP sent successfully');
        return { success: true, confirmation, useFirebase: true };
      } catch (error: any) {
        console.error('[Firebase] Error sending OTP:', error);
        if (error.code === 'auth/invalid-phone-number') {
          throw new Error('Invalid phone number format');
        } else if (error.code === 'auth/too-many-requests') {
          throw new Error('Too many OTP requests. Please try again later.');
        }
        throw new Error(error.message || 'Failed to send OTP via Firebase');
      }
    } else {
      // Web fallback - use backend mock OTP
      console.log('[Auth] Firebase not available, using mock OTP');
      const response = await axios.post(`${API_URL}/api/auth/send-otp`, { phone_number: phone });
      return { 
        success: true, 
        useFirebase: false, 
        mockOtp: response.data.mock_otp,
        message: response.data.message 
      };
    }
  };

  // Debug: Log API URL on mount
  useEffect(() => {
    console.log('🔐 AuthContext initialized');
    console.log('📡 API_URL:', API_URL);
    if (!API_URL) {
      console.error('❌ EXPO_PUBLIC_BACKEND_URL is not defined!');
    }
  }, []);

  // Session timeout management
  const refreshSession = () => {
    lastActivityRef.current = Date.now();
    // Store last activity time for persistence across app restarts
    AsyncStorage.setItem('last_activity', Date.now().toString());
  };

  const checkSessionTimeout = async () => {
    if (!user || !token) return;

    const storedLastActivity = await AsyncStorage.getItem('last_activity');
    const lastActivity = storedLastActivity ? parseInt(storedLastActivity, 10) : lastActivityRef.current;
    const timeSinceLastActivity = Date.now() - lastActivity;

    if (timeSinceLastActivity > SESSION_TIMEOUT_MS) {
      console.log('⏰ Session expired due to inactivity');
      Alert.alert(
        'Session Expired',
        'Your session has expired due to inactivity. Please log in again.',
        [{ text: 'OK', onPress: () => logout() }]
      );
    }
  };

  // Monitor app state changes
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        // App has come to the foreground - check session
        checkSessionTimeout();
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [user, token]);

  // Start session check interval when logged in
  useEffect(() => {
    if (user && token) {
      // Check session every minute
      sessionCheckIntervalRef.current = setInterval(checkSessionTimeout, 60 * 1000);
      refreshSession(); // Initialize last activity
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
  }, [user, token]);

  useEffect(() => {
    // Load stored auth data on mount
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      const storedToken = await AsyncStorage.getItem('auth_token');
      const storedUser = await AsyncStorage.getItem('user_data');
      
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
    } catch (error) {
      console.error('Error loading stored auth:', error);
    } finally {
      setLoading(false);
    }
  };

  const register = async (fullName: string, phone: string, password: string, role: string) => {
    try {
      // Register user in backend
      const response = await axios.post(`${API_URL}/api/auth/register`, {
        full_name: fullName,
        phone_number: phone,
        password,
        role
      });
      
      // Check if this was an existing user who just got a new role added
      if (response.data.already_registered) {
        return {
          userId: response.data.user_id,
          otp: '',
          already_registered: true,
          roles: response.data.roles
        };
      }
      
      // Send OTP via Firebase (native) or mock (web)
      const otpResult = await sendFirebaseOTP(phone);
      
      return {
        userId: response.data.user_id,
        otp: otpResult.mockOtp || response.data.mock_otp, // For web fallback display
        confirmation: otpResult.confirmation, // Firebase confirmation object
        useFirebase: otpResult.useFirebase,
        already_registered: false
      };
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Registration failed');
    }
  };

  const verifyOTP = async (phone: string, otp: string, confirmation?: any) => {
    try {
      // If Firebase confirmation exists, verify with Firebase
      if (confirmation && isFirebaseAvailable) {
        console.log('[Firebase] Verifying OTP...');
        await confirmation.confirm(otp);
        console.log('[Firebase] OTP verified successfully');
      }
      
      // Also verify with backend (updates user status)
      await axios.post(`${API_URL}/api/auth/verify-otp`, {
        phone_number: phone,
        otp
      });
    } catch (error: any) {
      if (error.code === 'auth/invalid-verification-code') {
        throw new Error('Invalid OTP code. Please try again.');
      } else if (error.code === 'auth/code-expired') {
        throw new Error('OTP code has expired. Please request a new one.');
      }
      throw new Error(error.response?.data?.detail || error.message || 'OTP verification failed');
    }
  };

  const login = async (phone: string, password: string) => {
    console.log('🔐 Login function called');
    console.log('📞 Phone:', phone);
    console.log('📡 API_URL:', API_URL);
    
    try {
      console.log('🚀 Making API request to:', `${API_URL}/api/auth/login`);
      
      const response = await axios.post(`${API_URL}/api/auth/login`, {
        phone_number: phone,
        password
      });
      
      console.log('✅ Login API response received');
      
      const { access_token, user: userData } = response.data;
      
      // Store auth data
      await AsyncStorage.setItem('auth_token', access_token);
      await AsyncStorage.setItem('user_data', JSON.stringify(userData));
      
      setToken(access_token);
      setUser(userData);
      
      // Initialize session activity tracking
      refreshSession();
      
      console.log('✅ Login successful, user:', userData.full_name);
      console.log('✅ User roles:', userData.roles);
      console.log('✅ Has multiple roles:', userData.has_multiple_roles);
      
      return {
        has_multiple_roles: userData.has_multiple_roles || false,
        roles: userData.roles || [userData.role]
      };
    } catch (error: any) {
      console.error('❌ Login error:', error);
      console.error('❌ Error details:', error.response?.data);
      throw new Error(error.response?.data?.detail || 'Login failed');
    }
  };

  const logout = async () => {
    await AsyncStorage.removeItem('auth_token');
    await AsyncStorage.removeItem('user_data');
    await AsyncStorage.removeItem('last_activity');  // Clear session tracking
    setToken(null);
    setUser(null);
  };

  const switchRole = async (newRole: string) => {
    if (!user) return;
    
    // Update user's active role locally
    const updatedUser = { ...user, role: newRole };
    setUser(updatedUser);
    await AsyncStorage.setItem('user_data', JSON.stringify(updatedUser));
    
    console.log('🔄 Switched role to:', newRole);
  };

  const updateProfilePhoto = async (photoBase64: string) => {
    try {
      const response = await axios.post(`${API_URL}/api/user/profile-photo`, {
        user_id: user?.id,
        profile_photo: photoBase64
      });
      
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
      sendFirebaseOTP,
      logout, 
      updateProfilePhoto, 
      refreshSession,
      isFirebaseAvailable,
      switchRole
    }}>
      {children}
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
