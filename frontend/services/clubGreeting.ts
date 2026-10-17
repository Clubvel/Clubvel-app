// Presentation only; no financial period or session logic depends on this clock.
export function clubGreeting(name?: string, now = new Date()): string {
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = name?.trim().split(/\s+/)[0];
  return `${greeting}${firstName ? `, ${firstName}` : ''}!`;
}
