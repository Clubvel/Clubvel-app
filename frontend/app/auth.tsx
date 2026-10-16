import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert, Modal, ActivityIndicator, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { Colors } from '../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authentication, AuthenticationError, normalizePhone, otpMessage } from '../services/authentication';

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const [isLogin, setIsLogin] = useState(true);
  const [isOTPScreen, setIsOTPScreen] = useState(false);
  const [isConsentScreen, setIsConsentScreen] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Form fields
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState('');
  const [tempPhone, setTempPhone] = useState('');
  const [otpNotice, setOtpNotice] = useState('');
  
  // Forgot Password State
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPhoneNumber, setForgotPhoneNumber] = useState('');
  const [resetOTP, setResetOTP] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetStep, setResetStep] = useState(1); // 1: enter phone, 2: enter OTP, 3: new password
  const [resetLoading, setResetLoading] = useState(false);
  
  const router = useRouter();
  const { login, register, verifyOTP, sendOTP } = useAuth();

  const handleProceedToConsent = () => {
    if (!fullName || !phoneNumber || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    try { normalizePhone(phoneNumber); } catch (error: any) { Alert.alert('Error', error.message); return; }
    if (password.length < 6) { Alert.alert('Error', 'Password must be at least 6 characters'); return; }
    setIsConsentScreen(true);
  };

  const handleRegister = async () => {
    if (!consentChecked) {
      Alert.alert('Consent Required', 'You must agree to the Privacy Policy to create an account.');
      return;
    }

    setLoading(true);
    try {
      // Send only phone_number, password, and full_name - no role
      const result = await register(fullName, phoneNumber, password);
      
      // Check if phone was already registered
      if (result.already_registered) {
        Alert.alert(
          'Account Exists',
          'This phone number is already registered. Please sign in with your password.',
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
      
      setTempPhone(normalizePhone(phoneNumber));
      setOtp('');
      setOtpNotice(otpMessage(result));
      setIsConsentScreen(false);
      setIsOTPScreen(true);
    } catch (error: any) {
      // If phone exists, prompt to login
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
    if (!phoneNumber || !password) {
      Alert.alert('Error', 'Please enter phone number and password');
      return;
    }

    setLoading(true);
    try {
      // Send only phone_number and password - no role
      await login(phoneNumber, password);
      router.replace('/(member)/home');
      
    } catch (error: any) {
      if (error instanceof AuthenticationError && error.code === 'verification_required') {
        try {
          const result = await sendOTP(phoneNumber);
          setTempPhone(normalizePhone(phoneNumber));
          setOtp(''); setOtpNotice(otpMessage(result)); setIsOTPScreen(true);
        } catch (sendError: any) { Alert.alert('Error', sendError.message); }
      } else if (error.message.includes('Invalid phone number or password')) {
        Alert.alert(
          'Login Failed',
          'Invalid phone number or password.'
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
      const result = await authentication.forgotPassword(forgotPhoneNumber);
      Alert.alert('Verification code', otpMessage(result));
      setResetStep(2);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || error.message || 'Failed to send reset code. Please check your phone number.');
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
      await authentication.verifyResetOTP(forgotPhoneNumber, resetOTP);
      setResetStep(3);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Invalid code. Please try again.');
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
      await authentication.resetPassword(forgotPhoneNumber, resetOTP, newPassword);
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
      Alert.alert('Error', error.message || 'Failed to reset password. Please try again.');
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
              {otpNotice || 'Enter the verification code'}
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Enter OTP"
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={6}
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
            <TouchableOpacity disabled={loading} onPress={async () => {
              setLoading(true);
              try { const result = await sendOTP(tempPhone); setOtp(''); setOtpNotice(otpMessage(result)); }
              catch (error: any) { Alert.alert('Error', error.message); }
              finally { setLoading(false); }
            }}><Text style={styles.otpInfo}>Resend code</Text></TouchableOpacity>
            <TouchableOpacity disabled={loading} onPress={() => { setIsOTPScreen(false); setIsLogin(true); }}>
              <Text style={styles.otpInfo}>Back to Sign In</Text>
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
      style={[styles.container, styles.authPage]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.scrollContent, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
        <View style={styles.header}>
          <Image source={require('../assets/images/clubvel-midnight-symbol.png')} accessibilityLabel="Clubvel community logo" resizeMode="contain" style={styles.authLogo} />
          <Text style={[styles.logo, { fontWeight: '400', fontSize: 26 }]}>clubvel</Text>
        </View>

        <View style={styles.form}>
          {!isLogin && (
            <>
              <Text style={[styles.sectionTitle, styles.authTitle]}>Create your account</Text>
              
              <TextInput
                style={[styles.input, styles.authInput]}
                accessibilityLabel="Full name" placeholder="Full name" placeholderTextColor="#D5E1F2"
                value={fullName}
                onChangeText={setFullName}
              />

              <TextInput
                style={[styles.input, styles.authInput]}
                accessibilityLabel="Phone number" placeholder="Phone number" placeholderTextColor="#D5E1F2"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                keyboardType="phone-pad"
              />

              <View style={{ position: 'relative' }}>
                <TextInput
                  style={[styles.input, styles.authInput]}
                  accessibilityLabel="Password" placeholder="Password" placeholderTextColor="#D5E1F2"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  style={{ position: 'absolute', right: 8, top: 5, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={24}
                    color="#FFFFFF"
                  />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.button, styles.authSignIn, loading && styles.buttonDisabled]}
                onPress={handleProceedToConsent}
                disabled={loading}
              >
                <Text style={[styles.buttonText, { color: Colors.primary, fontWeight: '500' }]}>
                  {loading ? 'Creating Account...' : 'Sign Up'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setIsLogin(true)}>
                <Text style={[styles.switchText, styles.authLink]}>
                  Already a member? <Text style={{ color: Colors.corporateBlue }}>Sign In</Text>
                </Text>
              </TouchableOpacity>
            </>
          )}

          {isLogin && (
            <>
              <Text style={[styles.sectionTitle, styles.authTitle]}>Welcome back</Text>
              <Text style={styles.authSubtitle}>Sign in to continue</Text>
              
              <TextInput
                style={[styles.input, styles.authInput]}
                accessibilityLabel="Phone number" placeholder="Phone number" placeholderTextColor="#D5E1F2"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                keyboardType="phone-pad"
              />

              <View style={{ position: 'relative' }}>
                <TextInput
                style={[styles.input, styles.authInput]}
                accessibilityLabel="Password" placeholder="Password" placeholderTextColor="#D5E1F2"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  style={{ position: 'absolute', right: 8, top: 5, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
              >
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
              <TouchableOpacity
                style={[styles.button, styles.authSignIn, loading && styles.buttonDisabled]}
                accessibilityRole="button" accessibilityLabel="Sign In" onPress={handleLogin}
                disabled={loading}
              >
                <Text style={[styles.buttonText, { color: Colors.primary, fontWeight: '500' }]}>
                  {loading ? 'Signing In...' : 'Sign In'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setShowForgotPassword(true)}>
                <Text style={[styles.forgotPasswordText, styles.authLink]}>Forgot Password?</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setIsLogin(false)}>
                <Text style={[styles.switchText, styles.authLink]}>New to Clubvel? Sign Up</Text>
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
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reset Password</Text>
              <TouchableOpacity onPress={closeForgotPassword}>
                <Ionicons name="close" size={28} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView 
              style={styles.modalBody}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={true}
            >
              {resetStep === 1 && (
                <>
                  <Text style={styles.resetStepTitle}>Step 1: Enter your phone number</Text>
                  <Text style={styles.resetStepDesc}>
                    We&apos;ll send you a verification code via SMS or WhatsApp
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
                    maxLength={6}
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
                  <View style={{ position: 'relative' }}>
                    <TextInput
                      style={styles.input}
                      placeholder="New Password"
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry={!showNewPassword}
                    />
                    <TouchableOpacity
                      onPress={() => setShowNewPassword(!showNewPassword)}
                      accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  style={{ position: 'absolute', right: 8, top: 5, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Ionicons
                        name={showNewPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={24}
                        color="gray"
                      />
                    </TouchableOpacity>
                  </View>

                  <View style={{ position: 'relative' }}>
                    <TextInput
                      style={styles.input}
                      placeholder="Confirm New Password"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showConfirmPassword}
                    />
                    <TouchableOpacity
                      onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                      accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  style={{ position: 'absolute', right: 8, top: 5, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Ionicons
                        name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={24}
                        color="gray"
                      />
                    </TouchableOpacity>
                  </View>
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
            {/* Extra padding at bottom for keyboard */}
            <View style={{ height: 20 }} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  authPage: { backgroundColor: Colors.primary },
  authLogo: { width: 108, height: 108, marginBottom: 8 },
  authTitle: { color: Colors.white, fontWeight: '400', fontSize: 27, marginBottom: 8 },
  authSubtitle: { color: '#D5E1F2', fontSize: 16, marginBottom: 24 },
  authInput: { backgroundColor: '#123C70', borderColor: '#7F9BBD', color: Colors.white, minHeight: 54, borderRadius: 18, paddingRight: 52 },
  authSignIn: { backgroundColor: Colors.avatarRing, minHeight: 54, borderRadius: 18 },
  authLink: { color: '#C3E3FF', fontWeight: '400', minHeight: 44, paddingVertical: 10 },
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
    color: Colors.corporateBlue,
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
