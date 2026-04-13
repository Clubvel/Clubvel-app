// Firebase Phone Authentication Service for Clubvel
// This replaces Twilio SMS OTP with Firebase Phone Auth
import auth from '@react-native-firebase/auth';

/**
 * Send OTP to phone number using Firebase Phone Authentication
 * @param phoneNumber - Phone number with country code (e.g., +27821234567)
 * @returns Confirmation result to verify OTP
 */
export async function sendFirebaseOTP(phoneNumber: string): Promise<any> {
  try {
    // Format South African phone number if needed
    const formattedNumber = formatSouthAfricanNumber(phoneNumber);
    
    console.log('[Firebase Auth] Sending OTP to:', formattedNumber);
    
    // Send verification code
    const confirmation = await auth().signInWithPhoneNumber(formattedNumber);
    
    console.log('[Firebase Auth] OTP sent successfully');
    
    return {
      success: true,
      confirmation,
      message: 'OTP sent successfully via Firebase'
    };
  } catch (error: any) {
    console.error('[Firebase Auth] Error sending OTP:', error);
    
    // Handle specific Firebase errors
    if (error.code === 'auth/invalid-phone-number') {
      throw new Error('Invalid phone number format. Please use format: 0821234567');
    } else if (error.code === 'auth/too-many-requests') {
      throw new Error('Too many OTP requests. Please try again later.');
    } else if (error.code === 'auth/quota-exceeded') {
      throw new Error('SMS quota exceeded. Please try again later.');
    }
    
    throw new Error(error.message || 'Failed to send OTP');
  }
}

/**
 * Verify OTP code entered by user
 * @param confirmation - The confirmation object returned from sendFirebaseOTP
 * @param code - The 6-digit OTP code entered by user
 * @returns Firebase user credential
 */
export async function verifyFirebaseOTP(confirmation: any, code: string): Promise<any> {
  try {
    console.log('[Firebase Auth] Verifying OTP code...');
    
    const userCredential = await confirmation.confirm(code);
    
    console.log('[Firebase Auth] OTP verified successfully');
    
    return {
      success: true,
      user: userCredential.user,
      message: 'Phone number verified successfully'
    };
  } catch (error: any) {
    console.error('[Firebase Auth] Error verifying OTP:', error);
    
    if (error.code === 'auth/invalid-verification-code') {
      throw new Error('Invalid OTP code. Please try again.');
    } else if (error.code === 'auth/code-expired') {
      throw new Error('OTP code has expired. Please request a new one.');
    }
    
    throw new Error(error.message || 'Failed to verify OTP');
  }
}

/**
 * Format South African phone number to international format
 * @param phoneNumber - Phone number in local format (e.g., 0821234567)
 * @returns Phone number in international format (e.g., +27821234567)
 */
export function formatSouthAfricanNumber(phoneNumber: string): string {
  // Remove any spaces, dashes, or parentheses
  let cleaned = phoneNumber.replace(/[\s\-\(\)]/g, '');
  
  // If starts with 0, replace with +27 (South Africa country code)
  if (cleaned.startsWith('0')) {
    cleaned = '+27' + cleaned.substring(1);
  }
  
  // If doesn't start with +, add +27
  if (!cleaned.startsWith('+')) {
    cleaned = '+27' + cleaned;
  }
  
  return cleaned;
}

/**
 * Sign out from Firebase Auth
 */
export async function signOutFirebase(): Promise<void> {
  try {
    await auth().signOut();
    console.log('[Firebase Auth] User signed out');
  } catch (error) {
    console.error('[Firebase Auth] Error signing out:', error);
  }
}

/**
 * Get current Firebase Auth user
 */
export function getCurrentFirebaseUser() {
  return auth().currentUser;
}

/**
 * Listen for auth state changes
 * @param callback - Function to call when auth state changes
 * @returns Unsubscribe function
 */
export function onFirebaseAuthStateChanged(callback: (user: any) => void) {
  return auth().onAuthStateChanged(callback);
}
