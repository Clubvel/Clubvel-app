// Format only explicitly shared registered numbers; never guess a country code
// for an ambiguous international/local number or put message text in a URI.
export function directoryMobile(value: unknown): string | null {
  if (typeof value !== 'string' || !/^[+\d ()-]+$/.test(value)) return null;
  const phone = value.replace(/[ ()-]/g, '');
  if (/^0[6-8]\d{8}$/.test(phone)) return '+27' + phone.slice(1);
  if (/^27[6-8]\d{8}$/.test(phone)) return '+' + phone;
  if (/^\+27[6-8]\d{8}$/.test(phone)) return phone;
  if (/^\+27/.test(phone)) return null;
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

export function directoryContactUrl(channel: 'whatsapp' | 'sms', phone: string): string | null {
  const normalized = directoryMobile(phone);
  if (!normalized) return null;
  return channel === 'whatsapp' ? `whatsapp://send?phone=${normalized.slice(1)}` : `sms:${normalized}`;
}
