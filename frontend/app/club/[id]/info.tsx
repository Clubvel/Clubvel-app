import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import { useClubPreview } from '../../../hooks/useClubPreview';
import { ClubBottomNavigation } from '../../../components/ClubDashboard';
import { Colors } from '../../../constants/Colors';
import { paymentMoney } from '../../../services/paymentSummaryRecords';

type ClubContext = { club: { id: string; name: string; photo_data_url?: string | null; group_photo?: string | null }; membership: { id: string; role: string; status: string }; period: { month: number; year: number }; own_financial_summary: { collected?: number | null; outstanding?: number | null }; availability: Record<string, string> };
type ClubDetails = { group: { id: string; type?: string; contribution_mode?: string; monthly_contribution?: number; payment_due_date?: number; group_photo?: string; description?: string } };

export default function MyClubScreen() {
  const { user, token, loading: restoring } = useAuth();
  const params = useLocalSearchParams<{ id: string; from?: string; month?: string; year?: string; contribution_id?: string }>();
  const router = useRouter(), insets = useSafeAreaInsets();
  const identity = JSON.stringify([user?.id, token, params.id, params.month, params.year, params.contribution_id]);
  const revision = useRef({ identity, value: 0 });
  if (revision.current.identity !== identity) revision.current = { identity, value: revision.current.value + 1 };
  const key = JSON.stringify([identity, revision.current.value]);
  const latest = useRef(key); latest.current = key;
  const [expanded, setExpanded] = useState<{ owner: string; section: string } | null>(null);
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const period = new URLSearchParams();
  if (params.month) period.set('month', params.month);
  if (params.year) period.set('year', params.year);
  const query = period.toString() ? `?${period}` : '';
  const selectContext = useCallback((value: unknown) => {
    const data = value as ClubContext;
    if (data?.club?.id !== params.id || typeof data.club.name !== 'string' || data.membership?.status !== 'active' || !['member', 'admin', 'treasurer'].includes(data.membership.role) || typeof data.membership.id !== 'string' || !data.own_financial_summary || !data.availability || !Number.isInteger(data.period?.month) || data.period.month < 1 || data.period.month > 12 || !Number.isInteger(data.period?.year) || data.period.year < 1 || data.period.year > 9999) throw new Error('Invalid active club context');
    return [data];
  }, [params.id]);
  const selectDetails = useCallback((value: unknown) => {
    const data = value as ClubDetails;
    if (data?.group?.id !== params.id) throw new Error('Wrong club details');
    return [data];
  }, [params.id]);
  const base = process.env.EXPO_PUBLIC_BACKEND_URL;
  // Independent authenticated reads. Context gates all rendering; never use a public club lookup.
  const context = useClubPreview(user?.id, token, params.id, `${base}/api/groups/${encodeURIComponent(params.id || '')}/context${query}`, selectContext);
  const details = useClubPreview(user?.id, token, params.id, `${base}/api/member/club/${encodeURIComponent(params.id || '')}/user/${encodeURIComponent(user?.id || '')}${query}`, selectDetails);
  if (!restoring && (!user || !token)) return <Redirect href="/auth" />;
  const club = context.rows[0], group = details.rows[0]?.group;
  const navigate = (pathname: string, extra: Record<string, string> = {}) => {
    if (latest.current !== key || !club) return;
    router.push({ pathname, params: { id: club.club.id, from: params.from || 'member', month: String(club.period.month), year: String(club.period.year), scope: 'club', ...(params.contribution_id ? { contribution_id: params.contribution_id } : {}), ...extra } } as Href);
  };
  const home = () => { if (latest.current === key) router.replace({ pathname: '/club/[id]', params: { id: params.id, from: params.from || 'member', ...(params.contribution_id ? { contribution_id: params.contribution_id } : {}), ...(club ? { month: String(club.period.month), year: String(club.period.year) } : params.month && params.year ? { month: params.month, year: params.year } : {}) } }); };
  const claims = () => { if (latest.current === key && club) router.push('/(member)/claims'); };
  const toggle = (section: string) => { if (latest.current === key && club) setExpanded(current => current?.owner === key && current.section === section ? null : { owner: key, section }); };
  const ownMoney = (field: 'collected' | 'outstanding') => club?.availability[field] === 'AVAILABLE' ? paymentMoney(club.own_financial_summary[field]) : 'Not available';
  const flexible = group?.contribution_mode === 'flexible_goal' || group?.type === 'travel';
  const photo = group?.group_photo || club?.club.photo_data_url || club?.club.group_photo;
  const changeClubPhoto = async () => {
    if (club?.membership.role !== 'admin' || !token || !params.id || !base) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission required', 'Allow photo library access to choose a club photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.3,
        base64: true,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.base64) {
        Alert.alert('Photo unavailable', 'Please choose another image.');
        return;
      }
      if (asset.base64.length > 1_350_000) {
        Alert.alert('Photo too large', 'Please choose a smaller image.');
        return;
      }
      setUploadingPhoto(true);
      await axios.put(
        `${base}/api/groups/photo`,
        { group_id: params.id, photo_data_url: `data:image/jpeg;base64,${asset.base64}` },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 }
      );
      setFailedPhoto(null);
      await Promise.all([context.reload(), details.reload()]);
      Alert.alert('Club photo updated', 'The new photo is shared with all club members.');
    } catch (error: any) {
      Alert.alert(
        'Could not update club photo',
        error?.response?.data?.detail || error?.message || 'Please try again.'
      );
    } finally {
      setUploadingPhoto(false);
    }
  };
  const photoKey = JSON.stringify([key, photo]);
  const entry = (label: string, caption: string, icon: React.ComponentProps<typeof Ionicons>['name'], action: () => void) => <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} onPress={action} style={styles.entry}><View style={styles.icon}><Ionicons name={icon} color={Colors.corporateBlue} size={23} /></View><View style={{ flex: 1, minWidth: 0 }}><Text style={styles.entryTitle}>{label}</Text><Text style={styles.caption}>{caption}</Text></View><Ionicons name="chevron-forward" color={Colors.textSecondary} size={18} /></TouchableOpacity>;
  return <View style={styles.screen}>
    <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to Club Home" onPress={home} style={styles.control}><Ionicons name="chevron-back" color={Colors.white} size={25} /></TouchableOpacity><Text style={styles.title}>My Club</Text><View style={styles.control} /></View>
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
      {context.loading && <ActivityIndicator accessibilityLabel="Loading My Club" color={Colors.primary} />}
      {context.error && <View style={styles.card}><Text>Unable to open this club. Check your connection and active membership.</Text>{entry('Retry My Club', 'Verify active access again', 'refresh', () => void context.reload())}</View>}
      {club && <View style={styles.card}>
        <View style={styles.identity}>{photo && failedPhoto !== photoKey ? <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" onError={() => { if (latest.current === key) setFailedPhoto(photoKey); }} /> : <View style={[styles.photo, styles.fallback]}><Text style={{ color: Colors.primary, fontSize: 30 }}>{club.club.name.trim().charAt(0).toUpperCase()}</Text></View>}<View style={{ flex: 1 }}><Text style={styles.clubName}>{club.club.name}</Text><Text style={styles.caption}>Your role: {club.membership.role === 'admin' ? 'Admin' : club.membership.role === 'treasurer' ? 'Treasurer' : 'Member'}</Text></View></View>
        {club.membership.role === 'admin' && entry(uploadingPhoto ? 'Saving club photo…' : 'Change club photo', 'Shared with all club members', 'camera-outline', () => { if (!uploadingPhoto) void changeClubPhoto(); })}
        <Text style={styles.caption}>Your recorded position · {club.period.month}/{club.period.year}</Text>
        <View style={styles.summary}><View style={styles.metric}><Text style={styles.value}>{ownMoney('collected')}</Text><Text style={styles.caption}>Confirmed collected</Text></View><View style={styles.metric}><Text style={styles.value}>{ownMoney('outstanding')}</Text><Text style={styles.caption}>Your outstanding</Text></View></View>
        {entry('Club Information', 'Details and your membership', 'information-circle', () => toggle('information'))}
        {expanded?.owner === key && expanded.section === 'information' && <View style={styles.information}><Text style={styles.caption}>{group?.type ? `Club type: ${group.type}` : 'Club details are not available.'}</Text>{group?.description && <Text style={styles.caption}>{group.description}</Text>}</View>}
        {entry('Members', 'Names, photographs and club roles', 'people', () => navigate('/club/[id]/members'))}
        {entry('Contribution Schedule', 'Recorded amounts and payment dates', 'calendar-outline', () => toggle('schedule'))}
        {expanded?.owner === key && expanded.section === 'schedule' && <View style={styles.information}>{details.loading ? <ActivityIndicator accessibilityLabel="Loading contribution schedule" /> : details.error ? <TouchableOpacity accessibilityLabel="Retry contribution schedule" onPress={() => void details.reload()}><Text style={styles.caption}>Unable to load schedule. Retry</Text></TouchableOpacity> : <><Text style={styles.caption}>{flexible ? 'Flexible contributions; no fixed monthly amount.' : group?.contribution_mode === 'fixed_monthly' && typeof group.monthly_contribution === 'number' && Number.isFinite(group.monthly_contribution) && group.monthly_contribution > 0 ? `${paymentMoney(group.monthly_contribution)} per month` : 'No verified fixed monthly amount.'}</Text>{!flexible && Number.isInteger(group?.payment_due_date) && group!.payment_due_date! >= 1 && group!.payment_due_date! <= 31 && <Text style={styles.caption}>Payment day: {group!.payment_due_date}</Text>}<TouchableOpacity accessibilityLabel="Open contribution records" style={styles.control} onPress={() => navigate('/(member)/club/[id]')}><Text style={{ color: Colors.corporateBlue }}>View contribution records</Text></TouchableOpacity></>}</View>}
        {entry('Claims', 'Your personal claims and submissions', 'briefcase-outline', claims)}
        {entry('Club History', 'Your contributions and proof history', 'time-outline', () => navigate('/(member)/club/[id]', { section: 'history' }))}
        {['admin', 'treasurer'].includes(club.membership.role) && entry('Club administration', 'Your authorised management tools', 'shield-checkmark', () => navigate('/(treasurer)/dashboard', { groupId: club.club.id }))}
      </View>}
    </ScrollView>
    {club && <ClubBottomNavigation active="more" bottomInset={insets.bottom} onHome={home} onContributions={() => navigate('/(member)/club/[id]')} onClaims={claims} onMore={() => {}} />}
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.primary }, header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 }, control: { minWidth: 44, minHeight: 44, justifyContent: 'center' }, title: { flex: 1, textAlign: 'center', color: Colors.white, fontWeight: '400', fontSize: 23 },
  content: { flexGrow: 1, backgroundColor: Colors.background, padding: 16, borderTopLeftRadius: 24, borderTopRightRadius: 24 }, card: { padding: 16, backgroundColor: Colors.white, borderRadius: 20, borderWidth: 1, borderColor: Colors.cardBorder }, identity: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 18 }, photo: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#F58220' }, fallback: { backgroundColor: Colors.iceBlue, alignItems: 'center', justifyContent: 'center' }, clubName: { color: Colors.primary, fontSize: 21, fontWeight: '500' },
  summary: { flexDirection: 'row', gap: 8, backgroundColor: Colors.iceBlue, borderRadius: 16, padding: 14, marginVertical: 14 }, metric: { flex: 1, minWidth: 0 }, value: { color: Colors.primary, fontSize: 19, fontWeight: '500' }, caption: { color: Colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 4 }, entry: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 74, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder }, icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.iceBlue }, entryTitle: { color: Colors.primary, fontSize: 16, fontWeight: '500' }, information: { backgroundColor: Colors.lightBackground, padding: 14, borderRadius: 12 },
});
