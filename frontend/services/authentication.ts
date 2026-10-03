import axios from 'axios';

export function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s()\-]/g, '');
  if (cleaned.startsWith('0027')) cleaned = '+' + cleaned.slice(2);
  else if (/^0[1-9][0-9]{8}$/.test(cleaned)) cleaned = '+27' + cleaned.slice(1);
  else if (/^27[1-9][0-9]{8}$/.test(cleaned)) cleaned = '+' + cleaned;
  else if (/^[1-9][0-9]{8}$/.test(cleaned)) cleaned = '+27' + cleaned;
  const valid = cleaned.startsWith('+27') ? /^\+27[1-9][0-9]{8}$/.test(cleaned) : /^\+[1-9][0-9]{7,14}$/.test(cleaned);
  if (!valid) throw new Error('Enter a valid phone number, for example 0821234567 or +27821234567.');
  return cleaned;
}

export interface OTPResult {
  notification_mode?: 'mock' | 'live';
  mock_otp?: string;
  channel?: string;
  user_id?: string;
  already_registered?: boolean;
}

export class AuthenticationError extends Error {
  constructor(message: string, public code?: string) { super(message); }
}

export function authenticationError(error: any): AuthenticationError {
  if (error instanceof AuthenticationError) return error;
  const detail = error.response?.data?.detail;
  if (typeof detail === 'string') return new AuthenticationError(detail);
  if (detail?.message) return new AuthenticationError(detail.message, detail.code);
  if (Array.isArray(detail)) return new AuthenticationError('Please check the information you entered.');
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return new AuthenticationError('The connection timed out. Please try again.');
  }
  if (error.response?.status === 429) return new AuthenticationError('Too many attempts. Please wait and try again.');
  if (error.response?.status >= 500) return new AuthenticationError('Clubvel is temporarily unavailable. Please try again.');
  if (error.isAxiosError || error.request) return new AuthenticationError('Could not connect to Clubvel. Check your connection and try again.');
  return new AuthenticationError(error.message || 'Authentication failed. Please try again.');
}

export function otpMessage(result: OTPResult): string {
  if (result.notification_mode === 'mock' && result.mock_otp) {
    return `Test environment: use code ${result.mock_otp}. No SMS or WhatsApp message was sent.`;
  }
  return `Your verification code was sent via ${result.channel === 'sms' ? 'SMS' : 'WhatsApp'}.`;
}

async function post(path: string, phone: string, fields: Record<string, string> = {}) {
  try {
    const base = process.env.EXPO_PUBLIC_BACKEND_URL;
    if (!base) throw new Error('Clubvel server configuration is missing. Please contact support.');
    const response = await axios.post(`${base.replace(/\/$/, '')}/api/auth/${path}`,
      { ...fields, phone_number: normalizePhone(phone) }, { timeout: 20000 });
    return response.data;
  } catch (error) { throw authenticationError(error); }
}

export const authentication = {
  login: (phone: string, password: string) => post('login', phone, { password }),
  register: (fullName: string, phone: string, password: string): Promise<OTPResult> =>
    post('register', phone, { full_name: fullName.trim(), password }),
  sendOTP: (phone: string): Promise<OTPResult> => post('send-otp', phone),
  verifyOTP: (phone: string, otp: string) => post('verify-otp', phone, { otp: otp.trim() }),
  forgotPassword: (phone: string): Promise<OTPResult> => post('forgot-password', phone),
  verifyResetOTP: (phone: string, otp: string) => post('verify-reset-otp', phone, { otp: otp.trim() }),
  resetPassword: (phone: string, otp: string, password: string) =>
    post('reset-password', phone, { otp: otp.trim(), new_password: password }),
};
