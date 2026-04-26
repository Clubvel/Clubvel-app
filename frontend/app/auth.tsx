import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert, Linking, Modal, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { Colors } from '../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [isOTPScreen, setIsOTPScreen] = useState(false);
  const [isConsentScreen, setIsConsentScreen] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Form fields
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('member');
  const [otp, setOtp] = useState('');
  const [tempPhone, setTempPhone] = useState('');
  const [firebaseConfirmation, setFirebaseConfirmation] = useState<any>(null);
  const [useFirebaseOTP, setUseFirebaseOTP] = useState(false);
  
  // Forgot Password State
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPhoneNumber, setForgotPhoneNumber] = useState('');
  const [resetOTP, setResetOTP] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetStep, setResetStep] = useState(1); // 1: enter phone, 2: enter OTP, 3: new password
  const [resetLoading, setResetLoading] = useState(false);
  
  const router = useRouter();
  const { login, register, verifyOTP, isFirebaseAvailable } = useAuth();
  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

  const handleProceedToConsent = () => {
    if (!fullName || !phoneNumber || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setIsConsentScreen(true);
  };

  const handleRegister = async () => {
    if (!consentChecked) {
      Alert.alert('Consent Required', 'You must agree to the Privacy Policy to create an account.');
      return;
    }

    setLoading(true);
    try {
      const result = await register(fullName, phoneNumber, password, role);
      
      // Check if phone was already registered and role was added
      if (result.already_registered) {
        Alert.alert(
          'Role Added!',
          `Your ${role === 'treasurer' ? 'Admin' : 'Member'} role has been added to your existing account. Please sign in with your password.`,
          [{ 
            text: 'Sign In', 
            onPress: () => {
              setIsConsentScreen(false);
              setIsLogin(true);
            }
          }]
        );
        setLoading(false);
        return;
      }
      
      setTempPhone(phoneNumber);
      setIsConsentScreen(false);
      setIsOTPScreen(true);
      
      if (result.confirmation) {
        setFirebaseConfirmation(result.confirmation);
        setUseFirebaseOTP(true);
        Alert.alert(
          '📱 OTP Sent!', 
          'An SMS with your verification code has been sent to your phone number via Firebase.',
          [{ text: 'OK' }]
        );
      } else {
        setUseFirebaseOTP(false);
        Alert.alert(
          '✅ Registration Successful!', 
          'We sent an OTP to your phone number. Please check your WhatsApp or SMS.',
          [{ text: 'OK, Got It!' }]
        );
      }
    } catch (error: any) {
      // If phone exists with same role, prompt to login
      if (error.message.includes('already registered')) {
        Alert.alert(
          'Account Exists',
          'This phone number is already registered. Would you like to sign in instead?',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Sign In', 
              onPress: () => {
                setIsConsentScreen(false);
                setIsLogin(true);
              }
            }
          ]
        );
      } else {
        Alert.alert('Error', error.message);
      }
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
      await verifyOTP(tempPhone, otp, firebaseConfirmation);
      Alert.alert('Success', 'Phone number verified! You can now log in.');
      setIsOTPScreen(false);
      setIsLogin(true);
      setPhoneNumber(tempPhone);
      setFirebaseConfirmation(null);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!phoneNumber || !password) {
      Alert.alert('Error', 'Please enter phone number and password');
      return;
    }

    setLoading(true);
    try {
      const result = await login(phoneNumber, password);
      
      // Navigate based on selected role
      if (role === 'treasurer') {
        router.replace('/(treasurer)/dashboard');
      } else {
        router.replace('/(member)/dashboard');
      }
    } catch (error: any) {
      if (error.message.includes('Invalid phone number or password')) {
        Alert.alert(
          'Login Failed',
          'Invalid phone number or password.\n\nIf you just registered, make sure you verified your OTP first.'
        );
      } else {
        Alert.alert('Error', error.message || 'Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Forgot Password Functions
  const handleSendResetOTP = async () => {
    if (!forgotPhoneNumber) {
      Alert.alert('Error', 'Please enter your phone number');
      return;
    }

    setResetLoading(true);
    try {
      await axios.post(`${API_URL}/api/auth/forgot-password`, {
        phone_number: forgotPhoneNumber
      });
      Alert.alert(
        'OTP Sent',
        'A password reset code has been sent to your phone via SMS/WhatsApp.',
        [{ text: 'OK' }]
      );
      setResetStep(2);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to send reset code. Please check your phone number.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleVerifyResetOTP = async () => {
    if (!resetOTP) {
      Alert.alert('Error', 'Please enter the OTP');
      return;
    }

    setResetLoading(true);
    try {
      await axios.post(`${API_URL}/api/auth/verify-reset-otp`, {
        phone_number: forgotPhoneNumber,
        otp: resetOTP
      });
      setResetStep(3);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Invalid OTP. Please try again.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || !confirmPassword) {
      Alert.alert('Error', 'Please fill in both password fields');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setResetLoading(true);
    try {
      await axios.post(`${API_URL}/api/auth/reset-password`, {
        phone_number: forgotPhoneNumber,
        otp: resetOTP,
        new_password: newPassword
      });
      Alert.alert(
        'Password Reset Successful',
        'Your password has been changed. Please log in with your new password.',
        [{ text: 'OK', onPress: () => {
          setShowForgotPassword(false);
          setResetStep(1);
          setForgotPhoneNumber('');
          setResetOTP('');
          setNewPassword('');
          setConfirmPassword('');
          setPhoneNumber(forgotPhoneNumber);
        }}]
      );
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to reset password. Please try again.');
    } finally {
      setResetLoading(false);
    }
  };

  const closeForgotPassword = () => {
    setShowForgotPassword(false);
    setResetStep(1);
    setForgotPhoneNumber('');
    setResetOTP('');
    setNewPassword('');
    setConfirmPassword('');
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
            <Text style={styles.sectionTitle}>Enter OTP</Text>

            <Text style={styles.otpInfo}>
              Enter the verification code
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Enter OTP"
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

  // POPIA Consent Screen
  if (isConsentScreen) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.logo}>Clubvel</Text>
            <Text style={styles.headerSubtitle}>Privacy & Consent</Text>
          </View>

          <View style={styles.form}>
            {/* Back Button */}
            <TouchableOpacity 
              style={styles.backButton} 
              onPress={() => {
                setIsConsentScreen(false);
                setConsentChecked(false);
              }}
            >
              <Ionicons name="arrow-back" size={20} color={Colors.mediumGreen} />
              <Text style={styles.backButtonText}>Back to Sign Up</Text>
            </TouchableOpacity>

            {/* POPIA Notice */}
            <View style={styles.consentCard}>
              <View style={styles.consentIconContainer}>
                <Ionicons name="shield-checkmark" size={48} color={Colors.mediumGreen} />
              </View>
              
              <Text style={styles.consentTitle}>Your Privacy Matters</Text>
              
              <Text style={styles.consentNotice}>
                Clubvel collects and processes the following personal information to manage your Social Club group:
              </Text>
              
              <View style={styles.consentList}>
                <View style={styles.consentListItem}>
                  <Ionicons name="person-outline" size={18} color={Colors.textSecondary} />
                  <Text style={styles.consentListText}>Your name and contact details</Text>
                </View>
                <View style={styles.consentListItem}>
                  <Ionicons name="cash-outline" size={18} color={Colors.textSecondary} />
                  <Text style={styles.consentListText}>Financial contribution records</Text>
                </View>
                <View style={styles.consentListItem}>
                  <Ionicons name="people-outline" size={18} color={Colors.textSecondary} />
                  <Text style={styles.consentListText}>Group membership information</Text>
                </View>
                <View style={styles.consentListItem}>
                  <Ionicons name="image-outline" size={18} color={Colors.textSecondary} />
                  <Text style={styles.consentListText}>Payment proof images you upload</Text>
                </View>
              </View>

              <Text style={styles.consentNotice}>
                This information is used solely for Social Club group management and is protected in accordance with the Protection of Personal Information Act (POPIA).
              </Text>
            </View>

            {/* Consent Checkbox */}
            <TouchableOpacity 
              style={styles.consentCheckboxContainer}
              onPress={() => setConsentChecked(!consentChecked)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, consentChecked && styles.checkboxChecked]}>
                {consentChecked && (
                  <Ionicons name="checkmark" size={18} color={Colors.white} />
                )}
              </View>
              <Text style={styles.consentCheckboxText}>
                I have read and agree to the{' '}
                <Text 
                  style={styles.privacyLink}
                  onPress={() => {
                    router.push('/privacy-policy');
                  }}
                >
                  Privacy Policy
                </Text>
                {' '}and consent to my personal and financial information being processed for Social Club group management purposes.
              </Text>
            </TouchableOpacity>

            {/* Continue Button */}
            <TouchableOpacity
              style={[
                styles.button, 
                (!consentChecked || loading) && styles.buttonDisabled
              ]}
              onPress={handleRegister}
              disabled={!consentChecked || loading}
            >
              <Text style={styles.buttonText}>
                {loading ? 'Creating Account...' : 'Continue'}
              </Text>
            </TouchableOpacity>

            {!consentChecked && (
              <Text style={styles.consentHint}>
                <Ionicons name="information-circle-outline" size={14} color={Colors.textMuted} />
                {' '}You must agree to the Privacy Policy to create an account
              </Text>
            )}
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
                      Admin
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleProceedToConsent}
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
                <Text style={styles.roleLabel}>Sign in as:</Text>
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
                      Admin
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleLogin}
                disabled={loading}
              >
                <Text style={styles.buttonText}>
                  {loading ? 'Signing In...' : 'Sign In'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setShowForgotPassword(true)}>
                <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setIsLogin(false)}>
                <Text style={styles.switchText}>New to Clubvel? Sign Up</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>

      {/* Forgot Password Modal */}
      <Modal
        visible={showForgotPassword}
        transparent={true}
        animationType="slide"
        onRequestClose={closeForgotPassword}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reset Password</Text>
              <TouchableOpacity onPress={closeForgotPassword}>
                <Ionicons name="close" size={28} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {resetStep === 1 && (
                <>
                  <Text style={styles.resetStepTitle}>Step 1: Enter your phone number</Text>
                  <Text style={styles.resetStepDesc}>
                    We'll send you a verification code via SMS or WhatsApp
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Phone Number"
                    value={forgotPhoneNumber}
                    onChangeText={setForgotPhoneNumber}
                    keyboardType="phone-pad"
                  />
                  <TouchableOpacity
                    style={[styles.button, resetLoading && styles.buttonDisabled]}
                    onPress={handleSendResetOTP}
                    disabled={resetLoading}
                  >
                    {resetLoading ? (
                      <ActivityIndicator color={Colors.white} />
                    ) : (
                      <Text style={styles.buttonText}>Send Reset Code</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {resetStep === 2 && (
                <>
                  <Text style={styles.resetStepTitle}>Step 2: Enter verification code</Text>
                  <Text style={styles.resetStepDesc}>
                    Enter the code we sent to {forgotPhoneNumber}
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter OTP"
                    value={resetOTP}
                    onChangeText={setResetOTP}
                    keyboardType="number-pad"
                    maxLength={4}
                  />
                  <TouchableOpacity
                    style={[styles.button, resetLoading && styles.buttonDisabled]}
                    onPress={handleVerifyResetOTP}
                    disabled={resetLoading}
                  >
                    {resetLoading ? (
                      <ActivityIndicator color={Colors.white} />
                    ) : (
                      <Text style={styles.buttonText}>Verify Code</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setResetStep(1)}>
                    <Text style={styles.backLinkText}>← Back to phone number</Text>
                  </TouchableOpacity>
                </>
              )}

              {resetStep === 3 && (
                <>
                  <Text style={styles.resetStepTitle}>Step 3: Create new password</Text>
                  <Text style={styles.resetStepDesc}>
                    Enter your new password below
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="New Password"
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Confirm New Password"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                  />
                  <TouchableOpacity
                    style={[styles.button, resetLoading && styles.buttonDisabled]}
                    onPress={handleResetPassword}
                    disabled={resetLoading}
                  >
                    {resetLoading ? (
                      <ActivityIndicator color={Colors.white} />
                    ) : (
                      <Text style={styles.buttonText}>Reset Password</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  forgotPasswordText: {
    color: Colors.gold,
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: 16,
  },
  otpInfo: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  // POPIA Consent Styles
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: Colors.mediumGreen,
    fontWeight: '500',
  },
  consentCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  consentIconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  consentTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
  },
  consentNotice: {
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: 16,
  },
  consentList: {
    backgroundColor: Colors.lightBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  consentListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  consentListText: {
    fontSize: 14,
    color: Colors.textPrimary,
    flex: 1,
  },
  consentCheckboxContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 24,
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: Colors.mediumGreen,
    borderColor: Colors.mediumGreen,
  },
  consentCheckboxText: {
    fontSize: 14,
    color: Colors.textSecondary,
    flex: 1,
    lineHeight: 20,
  },
  privacyLink: {
    color: Colors.mediumGreen,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  consentHint: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  modalBody: {
    padding: 20,
  },
  resetStepTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  resetStepDesc: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 20,
    lineHeight: 20,
  },
  backLinkText: {
    color: Colors.mediumGreen,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
});
