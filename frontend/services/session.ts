// These checks decide whether a cached session is worth restoring. They do not
// authenticate a JWT: the backend still verifies signatures and permissions.
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
export const AUTH_STORAGE_KEYS = ['auth_token', 'user_data', 'last_activity'];

function tokenClaims(token: string): { exp?: number; user_id?: string } {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts.every(Boolean)) throw new Error('Invalid session token');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  let buffer = 0, bits = 0, escaped = '';
  for (const char of payload) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw new Error('Invalid session token');
    buffer = (buffer << 6) | value; bits += 6;
    if (bits >= 8) {
      bits -= 8;
      escaped += '%' + ((buffer >> bits) & 255).toString(16).padStart(2, '0');
      buffer &= (1 << bits) - 1;
    }
  }
  return JSON.parse(decodeURIComponent(escaped));
}

export function sessionExpired(token: string, lastActivity: number, now = Date.now()): boolean {
  try {
    const claims = tokenClaims(token);
    return typeof claims.exp !== 'number' || !Number.isFinite(claims.exp)
      || claims.exp * 1000 <= now || !Number.isFinite(lastActivity) || lastActivity <= 0
      || lastActivity > now || now - lastActivity >= SESSION_TIMEOUT_MS;
  } catch { return true; }
}

export function restoreStoredSession(token: string | null, serializedUser: string | null, activity: string | null, now = Date.now()) {
  if (!token || !serializedUser || !activity) return null;
  try {
    const user = JSON.parse(serializedUser);
    const lastActivity = Number(activity);
    if (!user || typeof user.id !== 'string' || !user.id
      || typeof user.full_name !== 'string' || typeof user.phone_number !== 'string'
      || tokenClaims(token).user_id !== user.id || sessionExpired(token, lastActivity, now)) return null;
    return { token, user, lastActivity };
  } catch { return null; }
}
