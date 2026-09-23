export interface ActiveClub {
  id: string;
  membership_id: string;
  membership_status: 'active';
  role: 'member' | 'admin' | 'treasurer';
  name: string;
  monthly_contribution: number;
  group_type?: string;
  contribution_mode?: 'fixed_monthly' | 'flexible_goal';
  target_amount_per_member?: number | null;
  target_date?: string | null;
  destination?: string | null;
}

export function activeMemberships(data: unknown): ActiveClub[] {
  if (!data || typeof data !== 'object' || !('clubs' in data) || !Array.isArray(data.clubs)) {
    throw new Error('The membership response is unavailable.');
  }
  const result = new Map<string, ActiveClub>();
  for (const club of data.clubs) {
    if (club.membership_status && club.membership_status !== 'active') continue;
    if (typeof club.id !== 'string' || !club.id || typeof club.membership_id !== 'string' ||
        !club.membership_id || club.membership_status !== 'active' ||
        !['member', 'admin', 'treasurer'].includes(club.role) || typeof club.name !== 'string') {
      throw new Error('The service must provide current membership roles before a workspace can be verified.');
    }
    if (result.has(club.id)) throw new Error('Conflicting group memberships require review.');
    result.set(club.id, club);
  }
  return [...result.values()];
}

export function selectedMembership(clubs: ActiveClub[], groupId: string | null) {
  return clubs.find(club => club.id === groupId) ?? null;
}

export function workspaceRoute(club: ActiveClub | null) {
  if (!club) return { pathname: '/(member)/home' as const };
  return club.role === 'admin' || club.role === 'treasurer'
    ? { pathname: '/(treasurer)/club-detail' as const, params: { id: club.id, name: club.name } }
    : { pathname: '/(member)/club/[id]' as const, params: { id: club.id } };
}

export const workspaceStorageKey = (userId: string) => `clubvel:selected-group:${userId}`;
