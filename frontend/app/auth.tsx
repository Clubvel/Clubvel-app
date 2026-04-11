import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { Colors } from '../constants/Colors';
import { Ionicons } from '@expo/vector-icons';

export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [isOTPScreen, setIsOTPScreen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Form fields
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('member');
  const [otp, setOtp] = useState('');
  const [tempPhone, setTempPhone] = useState('');
  
  const router = useRouter();
  const { login, register, verifyOTP } = useAuth();

  const handleRegister = async () => {
    if (!fullName || !phoneNumber || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const result = await register(fullName, phoneNumber, password, role);
      setTempPhone(phoneNumber);
      setIsOTPScreen(true);
      Alert.alert(
        '✅ Registration Successful!', 
        'For testing, the OTP is always: 1234\n\nNo SMS will be sent - this is a demo environment.',
        [{ text: 'OK, Got It!' }]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp) {
      Alert.alert('Error', 'Please enter OTP');
      return;
    }

    setLoading(true);
    try {
      await verifyOTP(tempPhone, otp);
      Alert.alert('Success', 'Phone number verified! You can now log in.');
      setIsOTPScreen(false);
      setIsLogin(true);
      setPhoneNumber(tempPhone);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    console.log('🎯 handleLogin called');
    console.log('📞 Phone number:', phoneNumber);
    console.log('🔑 Password length:', password?.length);
    
    if (!phoneNumber || !password) {
      Alert.alert('Error', 'Please enter phone number and password');
      return;
    }

    setLoading(true);
    console.log('⏳ Loading state set to true');
    
    try {
      console.log('📡 Calling login function from AuthContext...');
      await login(phoneNumber, password);
      
      console.log('✅ Login successful, navigating...');
      
      // Get the user role from auth context
      // Navigation will be handled by auth context and splash screen
      // But we can add a small delay to ensure state is updated
      setTimeout(() => {
        console.log('🧭 Navigating to root...');
        router.replace('/');
      }, 100);
      
    } catch (error: any) {
      console.error('❌ Login error in handleLogin:', error);
      
      // Provide more helpful error messages
      if (error.message.includes('Invalid phone number or password')) {
        Alert.alert(
          'Login Failed',
          'Invalid phone number or password.\n\nIf you just registered, make sure you verified your OTP first.\n\nTry demo account:\nPhone: 0821234567\nPassword: Pass&Word76'
        );
      } else {
        Alert.alert('Error', error.message || 'Login failed. Please try again.');
      }
    } finally {
      console.log('✅ Loading state set to false');
      setLoading(false);
    }
  };

  if (isOTPScreen) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.logo}>Clubvel</Text>
            <Text style={styles.headerSubtitle}>Verify your phone number</Text>
          </View>

          <View style={styles.form}>
            {/* DEMO NOTICE */}
            <View style={styles.demoNotice}>
              <Ionicons name="information-circle" size={24} color={Colors.gold} />
              <View style={styles.demoNoticeText}>
                <Text style={styles.demoNoticeTitle}>Demo Mode - No SMS Sent</Text>
                <Text style={styles.demoNoticeBody}>
                  For testing, always use OTP: <Text style={styles.demoOTP}>1234</Text>
                </Text>
              </View>
            </View>

            <Text style={styles.otpInfo}>
              Enter the verification code
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Enter OTP (use: 1234)"
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={4}
            />

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleVerifyOTP}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? 'Verifying...' : 'Verify OTP'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.logo}>Clubvel</Text>
          <Text style={styles.headerSubtitle}>Your club. Your money. Your rules.</Text>
        </View>

        <View style={styles.form}>
          {!isLogin && (
            <>
              <Text style={styles.sectionTitle}>Sign Up</Text>
              
              <TextInput
                style={styles.input}
                placeholder="Full Name"
                value={fullName}
                onChangeText={setFullName}
              />

              <TextInput
                style={styles.input}
                placeholder="Phone Number"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                keyboardType="phone-pad"
              />

              <TextInput
                style={styles.input}
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />

              <View style={styles.roleSelector}>
                <Text style={styles.roleLabel}>I am a:</Text>
                <View style={styles.roleButtons}>
                  <TouchableOpacity
                    style={[
                      styles.roleButton,
                      role === 'member' && styles.roleButtonActive,
                    ]}
                    onPress={() => setRole('member')}
                  >
                    <Text
                      style={[
                        styles.roleButtonText,
                        role === 'member' && styles.roleButtonTextActive,
                      ]}
                    >
                      Member
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.roleButton,
                      role === 'treasurer' && styles.roleButtonActive,
                    ]}
                    onPress={() => setRole('treasurer')}
                  >
                    <Text
                      style={[
                        styles.roleButtonText,
                        role === 'treasurer' && styles.roleButtonTextActive,
                      ]}
                    >
                      Treasurer
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleRegister}
                disabled={loading}
              >
                <Text style={styles.buttonText}>
                  {loading ? 'Creating Account...' : 'Sign Up'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setIsLogin(true)}>
                <Text style={styles.switchText}>Already a member? Sign In</Text>
              </TouchableOpacity>
            </>
          )}

          {isLogin && (
            <>
              <Text style={styles.sectionTitle}>Sign In</Text>
              
              {/* Demo Account Info */}
              <View style={styles.demoAccountInfo}>
                <Ionicons name="information-circle-outline" size={20} color={Colors.mediumGreen} />
                <View style={styles.demoAccountText}>
                  <Text style={styles.demoAccountTitle}>Try Demo Accounts:</Text>
                  <Text style={styles.demoAccountDetail}>Member: 0821234567</Text>
                  <Text style={styles.demoAccountDetail}>Treasurer: 0829876543</Text>
                  <Text style={styles.demoAccountDetail}>Password: Pass&Word76</Text>
                </View>
              </View>
              
              <TextInput
                style={styles.input}
                placeholder="Phone Number"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                keyboardType="phone-pad"
              />

              <TextInput
                style={styles.input}
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleLogin}
                disabled={loading}
              >
                <Text style={styles.buttonText}>
                  {loading ? 'Signing In...' : 'Sign In'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setIsLogin(false)}>
                <Text style={styles.switchText}>New to Clubvel? Sign Up</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.lightBackground,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    backgroundColor: Colors.darkGreen,
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  logo: {
    fontSize: 36,
    fontWeight: 'bold',
    color: Colors.white,
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  form: {
    padding: 24,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 24,
  },
  input: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 16,
  },
  roleSelector: {
    marginBottom: 24,
  },
  roleLabel: {
    fontSize: 16,
    color: Colors.textPrimary,
    marginBottom: 12,
    fontWeight: '600',
  },
  roleButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  roleButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.white,
    alignItems: 'center',
  },
  roleButtonActive: {
    borderColor: Colors.mediumGreen,
    backgroundColor: Colors.mediumGreen,
  },
  roleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  roleButtonTextActive: {
    color: Colors.white,
  },
  button: {
    backgroundColor: Colors.mediumGreen,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  switchText: {
    color: Colors.mediumGreen,
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '600',
  },
  otpInfo: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  demoNotice: {
    flexDirection: 'row',
    backgroundColor: Colors.lightGold,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.gold,
    marginBottom: 24,
    alignItems: 'center',
    gap: 12,
  },
  demoNoticeText: {
    flex: 1,
  },
  demoNoticeTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  demoNoticeBody: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  demoOTP: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.gold,
    letterSpacing: 2,
  },
  demoAccountInfo: {
    flexDirection: 'row',
    backgroundColor: '#E8F5E9',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.mediumGreen,
    marginBottom: 16,
    gap: 10,
  },
  demoAccountText: {
    flex: 1,
  },
  demoAccountTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: Colors.mediumGreen,
    marginBottom: 4,
  },
  demoAccountDetail: {
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
});
