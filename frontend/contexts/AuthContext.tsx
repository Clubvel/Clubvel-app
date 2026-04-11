import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

interface User {
  id: string;
  full_name: string;
  phone_number: string;
  role: string;
  profile_photo?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  register: (fullName: string, phone: string, password: string, role: string) => Promise<{ userId: string; otp: string }>;
  verifyOTP: (phone: string, otp: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfilePhoto: (photoBase64: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

  // Debug: Log API URL on mount
  useEffect(() => {
    console.log('🔐 AuthContext initialized');
    console.log('📡 API_URL:', API_URL);
    if (!API_URL) {
      console.error('❌ EXPO_PUBLIC_BACKEND_URL is not defined!');
    }
  }, []);

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
      const response = await axios.post(`${API_URL}/api/auth/register`, {
        full_name: fullName,
        phone_number: phone,
        password,
        role
      });
      
      return {
        userId: response.data.user_id,
        otp: response.data.mock_otp
      };
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Registration failed');
    }
  };

  const verifyOTP = async (phone: string, otp: string) => {
    try {
      await axios.post(`${API_URL}/api/auth/verify-otp`, {
        phone_number: phone,
        otp
      });
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'OTP verification failed');
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
      
      console.log('✅ Login successful, user:', userData.full_name);
    } catch (error: any) {
      console.error('❌ Login error:', error);
      console.error('❌ Error details:', error.response?.data);
      throw new Error(error.response?.data?.detail || 'Login failed');
    }
  };

  const logout = async () => {
    await AsyncStorage.removeItem('auth_token');
    await AsyncStorage.removeItem('user_data');
    setToken(null);
    setUser(null);
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
    <AuthContext.Provider value={{ user, token, loading, login, register, verifyOTP, logout, updateProfilePhoto }}>
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
