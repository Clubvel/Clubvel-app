import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import axios from 'axios';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { Colors } from '../../constants/Colors';
import ProfilePhotoViewer from '../../components/ProfilePhotoViewer';
import { ClubWelcomeHeader, ClubNavigationTiles, ClubBottomNavigation } from '../../components/ClubDashboard';
import MemberRecentActivity from '../../components/MemberRecentActivity';
import { usePersonalClaims } from '../../hooks/usePersonalClaims';

type Context = {
  club: { id: string; name: string };
  membership: { id: string; role: string; status: string };
  clubs: { id: string; name: string }[];
  period: { month: number; year: number; timezone: string };
  own_financial_summary: { total_expected: number | null; collected: number | null; outstanding: number | null; awaiting_confirmation: number | null };
  availability: Record<string, string>;
  record_count: number;
};

export default function ClubHome() {
  const { user, token, loading: restoring } = useAuth();
  const params = useLocalSearchParams<{ id: string; from?: string; month?: string; year?: string; contribution_id?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const identity = JSON.stringify([user?.id, token, params.id, params.month, params.year]);
  const revision = useRef({ identity, value: 0 });
  if (revision.current.identity !== identity) revision.current = { identity, value: revision.current.value + 1 };
  const key = JSON.stringify([identity, revision.current.value]);
  const latest = useRef(key); latest.current = key;
  const sequence = useRef(0);
  const pending = useRef<{ key: string; ticket: number } | null>(null);
  const [state, setState] = useState<{ owner: string; data: Context | null; error: string | null } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [photo, setPhoto] = useState<{ owner: string; uri: string } | null>(null);
  const [failedPhoto, setFailedPhoto] = useState<{ owner: string; uri: string } | null>(null);
  const photoUri = user?.profile_photo;
  const latestPhoto = useRef(photoUri); latestPhoto.current = photoUri;
  const ownClaims = usePersonalClaims(user?.id, token);
  const load = useCallback(async () => {
    if (!user?.id || !token || !params.id || latest.current !== key || pending.current?.key === key) return;
    const ticket = ++sequence.current;
    pending.current = { key, ticket };
    setRefreshing(true);
    try {
      const { data } = await axios.get(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/groups/${params.id}/context`, {
        params: { month: params.month, year: params.year }, headers: { Authorization: `Bearer ${token}` }, timeout: 15000,
      });
      if (latest.current !== key || sequence.current !== ticket) return;
      if (data?.club?.id !== params.id || typeof data.club.name !== 'string' || data.membership?.status !== 'active' ||
          typeof data.membership.id !== 'string' || !['member', 'admin', 'treasurer'].includes(data.membership.role) || !Array.isArray(data.clubs) ||
          data.clubs.some((club: Context['club']) => typeof club.id !== 'string' || typeof club.name !== 'string') ||
          !data.own_financial_summary || !data.availability || !data.period || !Number.isInteger(data.record_count)) throw new Error('Invalid club context');
      setState({ owner: key, data, error: null });
    } catch {
      if (latest.current === key && sequence.current === ticket) setState({ owner: key, data: null, error: 'Unable to open this club. Check your connection and active membership, then retry.' });
    } finally {
      if (pending.current?.ticket === ticket) pending.current = null;
      if (latest.current === key && sequence.current === ticket) setRefreshing(false);
    }
  }, [key, params.id, params.month, params.year, user?.id, token]);
  useFocusEffect(useCallback(() => {
    void load();
    return () => { ++sequence.current; pending.current = null; };
  }, [load]));
  if (!restoring && (!user || !token)) return <Redirect href="/auth" />;
  const current = state?.owner === key ? state : null;
  const data = current?.data;
  const usablePhoto = !!photoUri && !(failedPhoto?.owner === key && failedPhoto.uri === photoUri);
  const photoVisible = !!data && usablePhoto && photo?.owner === key && photo.uri === photoUri;
  const clubClaims = data ? ownClaims.records.filter(claim => claim.group_id === data.club.id && ['pending', 'pending_review', 'upcoming', 'approved'].includes(claim.status)) : [];
  const admin = data?.membership.role === 'admin' || data?.membership.role === 'treasurer';
  const back = () => router.replace(params.from === 'admin' ? '/(treasurer)/dashboard' : '/(member)/home');
  const memberDetail = () => data && router.push({ pathname: '/(member)/club/[id]', params: { id: data.club.id, month: String(data.period.month), year: String(data.period.year), contribution_id: params.contribution_id || '', scope: 'club', from: params.from || 'member' } });
  const money = (field: keyof Context['own_financial_summary']) => {
    const value = data?.own_financial_summary[field];
    return data?.availability[field] === 'AVAILABLE' && typeof value === 'number' && Number.isFinite(value) ? `R${value.toFixed(2)}` : 'Unavailable';
  };
  const entry = (label: string, action: () => void, prominent = false) => <TouchableOpacity key={label} accessibilityRole="button" accessibilityLabel={label} style={[styles.entry, prominent && styles.primaryEntry]} onPress={() => { if (latest.current === key) action(); }}><Text style={[styles.entryText, prominent && styles.primaryEntryText]}>{label}</Text><Text style={prominent && styles.primaryEntryText}>›</Text></TouchableOpacity>;
  return <View style={styles.screen}>
    <ClubWelcomeHeader clubName={data?.club.name || 'Club Home'} displayName={data ? user?.full_name : undefined} photoUri={data && usablePhoto ? photoUri : null} topInset={insets.top} onBack={back} onNotifications={data ? () => { if (latest.current === key) router.push('/(member)/alerts'); } : undefined}
      onPhotoPress={() => { if (latest.current === key && photoUri) setPhoto({ owner: key, uri: photoUri }); }}
      onPhotoError={() => { if (latest.current === key && latestPhoto.current === photoUri && photoUri) setFailedPhoto({ owner: key, uri: photoUri }); }} />
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
      {!current && <ActivityIndicator accessibilityLabel="Loading Club Home" color={Colors.accent} />}
      {current?.error && <View><Text>{current.error}</Text>{entry('Retry Club Home', () => void load())}</View>}
      {data && <>
        <ClubNavigationTiles items={[
          { label: 'My Club', icon: 'people', accessibilityLabel: 'My Club', onPress: () => { if (latest.current === key) router.push({ pathname: '/club/[id]/info', params: { id: data.club.id, from: params.from || 'member', month: String(data.period.month), year: String(data.period.year), ...(params.contribution_id ? { contribution_id: params.contribution_id } : {}) } } as unknown as Href); } },
          { label: 'Contributions', icon: 'layers-outline', accessibilityLabel: 'My Contributions', onPress: () => { if (latest.current === key) memberDetail(); } },
          { label: 'Claims', icon: 'card-outline', accessibilityLabel: 'Payouts and Claims', onPress: () => { if (latest.current === key) router.push('/(member)/claims'); } },
          { label: 'History', icon: 'bar-chart', accessibilityLabel: 'Contribution history', onPress: () => { if (latest.current === key) router.push({ pathname: '/(member)/club/[id]', params: { id: data.club.id, month: String(data.period.month), year: String(data.period.year), contribution_id: params.contribution_id || '', scope: 'club', from: params.from || 'member', section: 'history' } }); } },
        ]} />
        <MemberRecentActivity key={key} groupId={data.club.id} clubName={data.club.name}
          onOpen={record => { if (latest.current === key && record.group_id === data.club.id) router.push({ pathname: '/(member)/club/[id]', params: { id: data.club.id, month: String(record.month), year: String(record.year), contribution_id: record.contribution_id, scope: 'club', from: params.from || 'member' } }); }}
          onViewAll={() => { if (latest.current === key) memberDetail(); }} />
        {admin && entry('Admin Home', () => router.push({ pathname: '/(treasurer)/dashboard', params: { groupId: data.club.id } }), true)}
        <View style={styles.card}><Text style={styles.heading}>My Contributions</Text><Text>{data.period.month}/{data.period.year}</Text>
          {data.record_count === 0 ? <Text>No contribution recorded for this month.</Text> : <>
            <Text>Expected: {money('total_expected')}</Text><Text>Confirmed Collected: {money('collected')}</Text>
            <Text>Outstanding: {money('outstanding')}</Text><Text>Awaiting Confirmation: {money('awaiting_confirmation')}</Text>
          </>}
        </View>
        <Text style={styles.heading}>Switch club</Text>
        <View style={styles.switcher}>{data.clubs.map(club => <TouchableOpacity key={club.id} accessibilityRole="button" accessibilityLabel={`Open ${club.name}`} onPress={() => { if (latest.current !== key) return; if (club.id !== data.club.id) { ++sequence.current; pending.current = null; setState(null); router.replace({ pathname: '/club/[id]', params: { id: club.id, from: params.from || 'member' } }); } }} style={styles.club}><Text>{club.name}{club.id === data.club.id ? ' ✓' : ''}</Text></TouchableOpacity>)}</View>
        {entry('Payments and Proofs', () => router.push({ pathname: '/(member)/proofs', params: { group_id: data.club.id, month: String(data.period.month), year: String(data.period.year), contribution_id: params.contribution_id || '', scope: 'club', from: params.from || 'member' } }))}
        <Text style={styles.caption}>Claims currently opens your personal claims across your active clubs.</Text>
        <View style={styles.card}><Text style={styles.heading}>Your upcoming claims and payouts</Text>
          {ownClaims.phase === 'loading' ? <ActivityIndicator accessibilityLabel="Loading your club claims" color={Colors.accent} /> : ownClaims.phase === 'error' ? entry('Retry your claims', () => void ownClaims.reload()) : clubClaims.length ? clubClaims.map(claim => <View key={claim.claim_id} style={styles.claimRow}><Text style={styles.entryText}>{claim.status === 'approved' ? 'Approved claim amount' : claim.status === 'upcoming' ? 'Upcoming claim' : 'Claim awaiting review'}</Text><Text style={styles.caption}>{typeof claim.amount === 'number' && Number.isFinite(claim.amount) && claim.amount >= 0 ? `R${claim.amount.toFixed(2)}` : 'Amount unavailable'}</Text></View>) : <Text style={styles.caption}>No upcoming claims recorded for this club.</Text>}
        </View>
        <View style={styles.card}><Text style={styles.heading}>Club updates</Text><Text style={styles.caption}>Announcements are not available in this version.</Text><Text style={styles.caption}>Events are not available in this version.</Text></View>
        {entry('Member Home', () => router.push('/(member)/home'))}
        {admin && <><Text style={styles.heading}>Club management</Text>
          {entry('Manage club', () => router.push({ pathname: '/(treasurer)/club-detail', params: { id: data.club.id, name: data.club.name, from: 'club' } }))}
          {entry('Manage Members', () => router.push({ pathname: '/(treasurer)/members', params: { groupId: data.club.id } }))}
          {entry('Review Payments', () => router.push({ pathname: '/(treasurer)/contributions', params: { groupId: data.club.id } }))}
          {entry('Manage Claims and Payouts', () => router.push({ pathname: '/(treasurer)/claims', params: { groupId: data.club.id } }))}
          {entry('Reports', () => router.push({ pathname: '/(treasurer)/reports', params: { group_id: data.club.id } }))}
        </>}
        {entry(refreshing ? 'Refreshing Club Home' : 'Refresh Club Home', () => void load())}
      </>}
    </ScrollView>
    {data && <ClubBottomNavigation active="home" bottomInset={insets.bottom} onHome={() => { if (latest.current === key) router.replace({ pathname: '/club/[id]', params: { id: data.club.id, from: params.from || 'member' } }); }} onContributions={() => { if (latest.current === key) memberDetail(); }} onClaims={() => { if (latest.current === key) router.push('/(member)/claims'); }} onMore={() => { if (latest.current === key) router.push({ pathname: '/club/[id]/info', params: { id: data.club.id, from: params.from || 'member', month: String(data.period.month), year: String(data.period.year), ...(params.contribution_id ? { contribution_id: params.contribution_id } : {}) } } as unknown as Href); }} />}
    <ProfilePhotoViewer visible={photoVisible} photoUri={photoVisible ? photoUri : null} displayName={photoVisible ? user?.full_name : undefined} onClose={() => setPhoto(null)} />
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.headerBackground, paddingHorizontal: 24, paddingBottom: 24 },
  headerNavigation: { flexDirection: 'row', alignItems: 'center' }, headerSide: { width: 64, minHeight: 44, justifyContent: 'center' },
  back: { color: Colors.white, fontSize: 16 }, title: { color: Colors.white, fontSize: 24, fontWeight: '400', textAlign: 'center', flex: 1, minWidth: 0 },
  greetingRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 16 }, photoButton: { flexShrink: 0 },
  profilePhoto: { width: 112, height: 112, borderRadius: 56, borderWidth: 1, borderColor: Colors.white },
  profileFallback: { width: 112, height: 112, borderRadius: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary, borderWidth: 1, borderColor: Colors.white },
  profileInitial: { color: Colors.white, fontSize: 36 }, greeting: { color: Colors.white, fontSize: 20, fontWeight: '400', flex: 1, minWidth: 0, flexShrink: 1 },
  content: { padding: 16, paddingBottom: 40 }, heading: { color: Colors.textPrimary, fontSize: 18, fontWeight: '500', marginVertical: 12 },
  switcher: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, club: { minHeight: 48, justifyContent: 'center', padding: 12, backgroundColor: Colors.white, borderRadius: 8 },
  card: { backgroundColor: Colors.white, padding: 16, borderRadius: 12, marginVertical: 12 },
  entry: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, marginBottom: 8, borderRadius: 12, backgroundColor: Colors.white },
  entryText: { flex: 1, color: Colors.textPrimary, fontSize: 16 }, caption: { color: Colors.textSecondary, marginBottom: 12 },
  primaryEntry: { backgroundColor: Colors.corporateBlue }, primaryEntryText: { color: Colors.white }, claimRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
});
