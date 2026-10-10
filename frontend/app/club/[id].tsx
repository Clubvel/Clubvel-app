import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import axios from 'axios';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { Colors } from '../../constants/Colors';

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
  const params = useLocalSearchParams<{ id: string; from?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const key = JSON.stringify([user?.id, token, params.id]);
  const latest = useRef(key); latest.current = key;
  const sequence = useRef(0);
  const pending = useRef<{ key: string; ticket: number } | null>(null);
  const [state, setState] = useState<{ owner: string; data: Context | null; error: string | null } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    if (!user?.id || !token || !params.id || latest.current !== key || pending.current?.key === key) return;
    const ticket = ++sequence.current;
    pending.current = { key, ticket };
    setRefreshing(true);
    try {
      const { data } = await axios.get(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/groups/${params.id}/context`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 15000,
      });
      if (latest.current !== key || sequence.current !== ticket) return;
      if (data?.club?.id !== params.id || typeof data.club.name !== 'string' || data.membership?.status !== 'active' ||
          typeof data.membership.id !== 'string' || typeof data.membership.role !== 'string' || !Array.isArray(data.clubs) ||
          data.clubs.some((club: Context['club']) => typeof club.id !== 'string' || typeof club.name !== 'string') ||
          !data.own_financial_summary || !data.availability || !data.period || !Number.isInteger(data.record_count)) throw new Error('Invalid club context');
      setState({ owner: key, data, error: null });
    } catch {
      if (latest.current === key && sequence.current === ticket) setState({ owner: key, data: null, error: 'Unable to open this club. Check your connection and active membership, then retry.' });
    } finally {
      if (pending.current?.ticket === ticket) pending.current = null;
      if (latest.current === key && sequence.current === ticket) setRefreshing(false);
    }
  }, [key, params.id, user?.id, token]);
  useFocusEffect(useCallback(() => {
    void load();
    return () => { ++sequence.current; pending.current = null; };
  }, [load]));
  if (!restoring && (!user || !token)) return <Redirect href="/auth" />;
  const current = state?.owner === key ? state : null;
  const data = current?.data;
  const admin = data?.membership.role === 'admin' || data?.membership.role === 'treasurer';
  const back = () => router.replace(params.from === 'admin' ? '/(treasurer)/dashboard' : '/(member)/home');
  const memberDetail = () => data && router.push({ pathname: '/(member)/club/[id]', params: { id: data.club.id, month: String(data.period.month), year: String(data.period.year) } });
  const money = (field: keyof Context['own_financial_summary']) => {
    const value = data?.own_financial_summary[field];
    return data?.availability[field] === 'AVAILABLE' && typeof value === 'number' && Number.isFinite(value) ? `R${value.toFixed(2)}` : 'Unavailable';
  };
  const entry = (label: string, action: () => void) => <TouchableOpacity key={label} accessibilityRole="button" accessibilityLabel={label} style={styles.entry} onPress={action}><Text style={styles.entryText}>{label}</Text><Text>›</Text></TouchableOpacity>;
  return <View style={styles.screen}>
    <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}><TouchableOpacity accessibilityLabel="Back to account Home" onPress={back}><Text style={styles.back}>‹ Back</Text></TouchableOpacity><Text style={styles.title}>{data?.club.name || 'Club Home'}</Text></View>
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
      {!current && <ActivityIndicator accessibilityLabel="Loading Club Home" color={Colors.accent} />}
      {current?.error && <View><Text>{current.error}</Text>{entry('Retry Club Home', () => void load())}</View>}
      {data && <>
        <Text style={styles.heading}>Switch club</Text>
        <View style={styles.switcher}>{data.clubs.map(club => <TouchableOpacity key={club.id} accessibilityRole="button" accessibilityLabel={`Open ${club.name}`} onPress={() => { if (club.id !== data.club.id) { ++sequence.current; pending.current = null; setState(null); router.replace({ pathname: '/club/[id]', params: { id: club.id, from: params.from || 'member' } }); } }} style={styles.club}><Text>{club.name}{club.id === data.club.id ? ' ✓' : ''}</Text></TouchableOpacity>)}</View>
        <View style={styles.card}><Text style={styles.heading}>Your contributions</Text><Text>{data.period.month}/{data.period.year}</Text>
          {data.record_count === 0 ? <Text>No contribution recorded for this month.</Text> : <>
            <Text>Expected: {money('total_expected')}</Text><Text>Confirmed Collected: {money('collected')}</Text>
            <Text>Outstanding: {money('outstanding')}</Text><Text>Awaiting Confirmation: {money('awaiting_confirmation')}</Text>
          </>}
        </View>
        {entry('Members', () => router.push({ pathname: '/club/[id]/members', params: { id: data.club.id, from: params.from || 'member' } } as unknown as Href))}
        {entry('My Contributions', memberDetail)}
        {entry('Payments and Proofs', () => router.push({ pathname: '/(member)/proofs', params: { group_id: data.club.id, month: String(data.period.month), year: String(data.period.year), contribution_id: '' } }))}
        {entry('Payouts and Claims', () => router.push('/(member)/claims'))}
        <Text style={styles.caption}>Claims currently opens your personal claims across your active clubs.</Text>
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
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.primary, paddingHorizontal: 24, paddingBottom: 24 },
  back: { color: Colors.white, fontSize: 16 }, title: { color: Colors.white, fontSize: 24, fontWeight: '700', marginTop: 12 },
  content: { padding: 16, paddingBottom: 40 }, heading: { color: Colors.textPrimary, fontSize: 18, fontWeight: '600', marginVertical: 12 },
  switcher: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, club: { padding: 12, backgroundColor: Colors.white, borderRadius: 8 },
  card: { backgroundColor: Colors.white, padding: 16, borderRadius: 12, marginVertical: 12 },
  entry: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, marginBottom: 8, borderRadius: 12, backgroundColor: Colors.white },
  entryText: { flex: 1, color: Colors.textPrimary, fontSize: 16 }, caption: { color: Colors.textSecondary, marginBottom: 12 },
});
