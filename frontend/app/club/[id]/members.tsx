import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import { Colors } from '../../../constants/Colors';
import ClubMemberDirectory from '../../../components/ClubMemberDirectory';

type Context = { club: { id: string; name: string }; membership: { id: string; status: string; role: string } };
export default function ClubMembers() {
  const { user, token, loading: restoring } = useAuth();
  const params = useLocalSearchParams<{ id: string; from?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const key = JSON.stringify([user?.id, token, params.id]);
  const latest = useRef(key); latest.current = key;
  const sequence = useRef(0);
  const pending = useRef<{ key: string; ticket: number } | null>(null);
  const [state, setState] = useState<{ owner: string; data: Context | null; error: string | null } | null>(null);
  const [search, setSearch] = useState({ owner: key, value: '' });
  const load = useCallback(async () => {
    if (!user?.id || !token || !params.id || latest.current !== key || pending.current?.key === key) return;
    const ticket = ++sequence.current;
    pending.current = { key, ticket };
    // Revalidate access before mounting the directory after each focus.
    setState(null);
    try {
      const { data } = await axios.get(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/groups/${params.id}/context`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 15000,
      });
      if (latest.current !== key || sequence.current !== ticket) return;
      if (data?.club?.id !== params.id || typeof data.club.name !== 'string' || data.membership?.status !== 'active' ||
          typeof data.membership.id !== 'string' || !['member', 'admin', 'treasurer'].includes(data.membership.role)) throw new Error('Invalid club context');
      setState({ owner: key, data: { club: data.club, membership: data.membership }, error: null });
    } catch {
      if (latest.current === key && sequence.current === ticket) setState({ owner: key, data: null, error: 'Unable to open club members. Check your connection and active membership, then retry.' });
    } finally {
      if (pending.current?.ticket === ticket) pending.current = null;
    }
  }, [key, params.id, user?.id, token]);
  useFocusEffect(useCallback(() => {
    void load();
    return () => { ++sequence.current; pending.current = null; setState(null); };
  }, [load]));
  if (!restoring && (!user || !token)) return <Redirect href="/auth" />;
  const current = state?.owner === key ? state : null;
  const data = current?.data;
  const admin = data?.membership.role === 'admin' || data?.membership.role === 'treasurer';
  const back = () => router.replace({ pathname: '/club/[id]', params: { id: params.id, from: params.from || 'member' } });
  return <View style={styles.screen}>
    <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
      <TouchableOpacity accessibilityLabel="Back to Club Home" onPress={back}><Text style={styles.back}>‹ Back</Text></TouchableOpacity>
      <Text style={styles.title}>{data ? `${data.club.name} Members` : 'Members'}</Text>
    </View>
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
      {!current && <ActivityIndicator accessibilityLabel="Loading club members" color={Colors.accent} />}
      {current?.error && <View><Text>{current.error}</Text><TouchableOpacity accessibilityLabel="Retry club members" onPress={() => void load()}><Text>Retry</Text></TouchableOpacity></View>}
      {data && <>
        <TextInput accessibilityLabel="Search club members" placeholder="Search members..." style={styles.search} value={search.owner === key ? search.value : ''} onChangeText={value => setSearch({ owner: key, value })} />
        <ClubMemberDirectory key={key} groupId={data.club.id} search={search.owner === key ? search.value : ''} />
        {admin && <View>
          <TouchableOpacity style={styles.entry} accessibilityLabel="Manage member invitations" onPress={() => router.push({ pathname: '/(treasurer)/members', params: { groupId: data.club.id } })}><Text>Manage member invitations</Text></TouchableOpacity>
          <TouchableOpacity style={styles.entry} accessibilityLabel="Manage club members and Admin invitations" onPress={() => router.push({ pathname: '/(treasurer)/club-detail', params: { id: data.club.id, name: data.club.name, from: 'club' } })}><Text>Manage club members and Admin invitations</Text></TouchableOpacity>
        </View>}
      </>}
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.primary, paddingHorizontal: 24, paddingBottom: 24 },
  back: { color: Colors.white, fontSize: 16 }, title: { color: Colors.white, fontSize: 24, fontWeight: '700', marginTop: 12 },
  content: { padding: 16 }, search: { backgroundColor: Colors.white, borderRadius: 8, padding: 12, color: Colors.textPrimary },
  entry: { backgroundColor: Colors.white, padding: 16, borderRadius: 12, marginBottom: 8 },
});
