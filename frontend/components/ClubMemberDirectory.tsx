import ProfilePhotoFrame from './ProfilePhotoFrame';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Colors } from '../constants/Colors';
import ProfilePhotoViewer from './ProfilePhotoViewer';
import { directoryMobile, directoryContactUrl } from '../services/directoryContact';

type DirectoryMember = { id: string; name: string; profile_photo: string | null; role: string; phone_visibility?: 'shared' | 'private' | 'unavailable'; phone_number?: string | null };
type Props = { compact?: boolean; onViewAll?: () => void; groupId?: string; search?: string; renderDetails?: (memberId: string) => React.ReactNode };
const roleLabel = (role: string) => role === 'admin' ? 'Admin' : role === 'treasurer' ? 'Treasurer' : 'Member';
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'M';

// Existing uploads are data URIs. Recognise legacy encoded images without guessing their format.
export function directoryPhotoUri(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const uri = value.trim();
  if (/^https?:\/\//i.test(uri) || /^data:image\/(?:jpeg|png|gif|webp);base64,/i.test(uri)) return uri;
  const encoded = uri.replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null;
  const mime = encoded.startsWith('/9j/') ? 'jpeg' : encoded.startsWith('iVBORw0KGgo') ? 'png' :
    encoded.startsWith('R0lGOD') ? 'gif' : encoded.startsWith('UklGR') ? 'webp' : null;
  return mime ? `data:image/${mime};base64,${encoded}` : null;
}

export default function ClubMemberDirectory({ compact = false, onViewAll, groupId, search = '', renderDetails }: Props) {
  const { user, token } = useAuth();
  const context = `${user?.id}:${token}:${groupId}`;
  const latest = useRef(context); latest.current = context;
  const sequence = useRef(0);
  const pending = useRef<{ context: string; ticket: number } | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [members, setMembers] = useState<DirectoryMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<DirectoryMember | null>(null);
  const [photo, setPhoto] = useState<DirectoryMember | null>(null);
  const [failedPhotos, setFailedPhotos] = useState<Record<string, true>>({});
  const [selectionOwner, setSelectionOwner] = useState<string | null>(null);
  const selection = useRef<DirectoryMember | null>(null);
  const selectProfile = (member: DirectoryMember | null) => { selection.current = member; setProfile(member); if (!member) setPhoto(null); };
  const fetchDirectory = useCallback(async () => {
    if (!user?.id || !token || !groupId || pending.current?.context === context) return;
    const ticket = ++sequence.current;
    pending.current = { context, ticket };
    setLoading(true); setError(null); selectProfile(null); setPhoto(null);
    try {
      const response = await axios.get(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/groups/${groupId}/directory`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 15000,
      });
      if (latest.current !== context || ticket !== sequence.current) return;
      const data = response.data;
      if (data?.group_id !== groupId || !Array.isArray(data.members) || data.members.some((row: DirectoryMember) =>
        !row || typeof row.id !== 'string' || typeof row.name !== 'string' || typeof row.role !== 'string' ||
        (row.profile_photo != null && typeof row.profile_photo !== 'string')) ||
        new Set(data.members.map((row: DirectoryMember) => row.id)).size !== data.members.length) throw new Error('Invalid directory response');
      setFailedPhotos({});
      setMembers(data.members.map((row: DirectoryMember) => ({ id: row.id, name: row.name, role: row.role, profile_photo: directoryPhotoUri(row.profile_photo), phone_visibility: row.phone_visibility === 'shared' ? 'shared' : row.phone_visibility === 'unavailable' ? 'unavailable' : 'private', phone_number: row.phone_visibility === 'shared' ? directoryMobile(row.phone_number) : null })));
      setOwner(context);
    } catch {
      if (latest.current !== context || ticket !== sequence.current) return;
      setMembers([]); setOwner(context); setError('Unable to load club members. Please try again.');
    } finally {
      if (pending.current?.ticket === ticket) pending.current = null;
      if (latest.current === context && ticket === sequence.current) setLoading(false);
    }
  }, [context, groupId, user?.id, token]);
  useFocusEffect(useCallback(() => {
    void fetchDirectory();
    return () => { ++sequence.current; pending.current = null; selectProfile(null); setPhoto(null); };
  }, [fetchDirectory]));
  const allowed = !!user?.id && !!token && !!groupId;
  const current = allowed && owner === context ? members : [];
  const selected = allowed && owner === context && selectionOwner === context ? profile : null;
  const photoKey = (member: DirectoryMember) => JSON.stringify([context, member.id, member.profile_photo]);
  const usablePhoto = (member: DirectoryMember) => !!member.profile_photo && !failedPhotos[photoKey(member)];
  const expanded = allowed && owner === context && selectionOwner === context && photo && usablePhoto(photo) ? photo : null;
  const renderTicket = sequence.current;
  const isCurrent = () => latest.current === context && owner === context && sequence.current === renderTicket;
  const sharedMobile = selected?.phone_visibility === 'shared' ? directoryMobile(selected.phone_number) : null;
  const openContact = async (channel: 'whatsapp' | 'sms') => {
    if (!selected || selection.current !== selected || !sharedMobile || !isCurrent()) return;
    const url = directoryContactUrl(channel, sharedMobile);
    if (!url) return;
    try {
      // Open the installed composer only. Never prefill text, send, or use a web fallback.
      await Linking.openURL(url);
    } catch {
      if (isCurrent() && selection.current === selected) Alert.alert('Unable to open app', channel === 'whatsapp' ? 'WhatsApp is not available. Install it or use SMS instead.' : 'An SMS application could not be opened on this device.');
    }
  };
  const avatar = (member: DirectoryMember, enlarged = false) => {
    const photoTicket = sequence.current;
    return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={enlarged ? `View photo of ${member.name}` : `Open profile photo of ${member.name}`} disabled={enlarged && !usablePhoto(member)}
      onPress={() => { if (!isCurrent()) return; setSelectionOwner(context); if (enlarged) setPhoto(member); else selectProfile(member); }} style={{ flexShrink: 0 }}>
      <ProfilePhotoFrame size={48} tone="light"><View style={styles.avatar}>
      {usablePhoto(member) ? <Image source={{ uri: member.profile_photo! }} style={styles.image} resizeMode="cover"
        onError={() => { if (latest.current === context && sequence.current === photoTicket) setFailedPhotos(previous => ({ ...previous, [photoKey(member)]: true })); }} /> :
        <Text style={styles.initials}>{initials(member.name)}</Text>}</View></ProfilePhotoFrame>
    </TouchableOpacity>
    );
  };
  return <View style={[styles.section, compact && styles.compactSection]}>
    <View style={styles.headingRow}><Text style={styles.title}>Club members</Text>{onViewAll && <TouchableOpacity accessibilityLabel="View all club members" onPress={onViewAll}><Text style={styles.viewAll}>View all</Text></TouchableOpacity>}</View>
    {allowed && (loading || owner !== context) && <ActivityIndicator accessibilityLabel="Loading member directory" color={Colors.accent} />}
    {owner === context && error && <View><Text>{error}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Retry member directory" onPress={() => void fetchDirectory()}><Text>Retry</Text></TouchableOpacity></View>}
    {current.filter(member => member.name.toLowerCase().includes(search.toLowerCase())).slice(0, compact ? 3 : undefined).map(member => <View key={member.id} style={[styles.row, compact && styles.compactRow]}>
      {avatar(member)}
      <View style={styles.identity}><TouchableOpacity accessibilityRole="button" accessibilityLabel={`Open profile of ${member.name}`}
        onPress={() => { if (!isCurrent()) return; setSelectionOwner(context); selectProfile(member); }}><Text style={styles.name}>{member.name}</Text></TouchableOpacity>
        <Text style={styles.role}>{roleLabel(member.role)}</Text>{renderDetails?.(member.id)}</View>
    </View>)}
    {allowed && owner === context && !loading && !error && members.length === 0 && <Text>No members to display.</Text>}
    <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => selectProfile(null)}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => selectProfile(null)} accessibilityLabel="Close member profile backdrop">
        <TouchableOpacity activeOpacity={1} style={styles.profile} onPress={() => {}}>
          <ScrollView>{selected && <View>{avatar(selected, true)}<Text style={styles.profileName}>{selected.name}</Text><Text style={styles.role}>{roleLabel(selected.role)}</Text>
            <Text style={styles.contactNote}>{sharedMobile || (selected.phone_visibility !== 'private' ? 'No suitable mobile number is available.' : 'Mobile number is private.')}</Text>
            <View style={styles.contactActions}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="WhatsApp member" accessibilityState={{ disabled: !sharedMobile }} disabled={!sharedMobile} style={[styles.contactAction, !sharedMobile && styles.disabledAction]} onPress={() => void openContact('whatsapp')}><Text style={styles.contactLabel}>WhatsApp</Text></TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="SMS member" accessibilityState={{ disabled: !sharedMobile }} disabled={!sharedMobile} style={[styles.contactAction, !sharedMobile && styles.disabledAction]} onPress={() => void openContact('sms')}><Text style={styles.contactLabel}>SMS</Text></TouchableOpacity>
            </View>
          </View>}
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close member profile" onPress={() => selectProfile(null)}><Text style={styles.close}>Close</Text></TouchableOpacity>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
    <ProfilePhotoViewer visible={!!expanded} photoUri={expanded?.profile_photo} displayName={expanded?.name} onClose={() => setPhoto(null)} />
  </View>;
}
const styles = StyleSheet.create({
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, viewAll: { color: Colors.corporateBlue, fontSize: 14, paddingVertical: 12 },
  compactSection: { padding: 16, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: 18, marginBottom: 16 },
  compactRow: { borderWidth: 0, borderBottomWidth: 1, borderRadius: 0, paddingHorizontal: 0, marginBottom: 0 },
  section: { padding: 16 }, title: { fontSize: 20, fontWeight: '600', color: Colors.textPrimary, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16, marginBottom: 12, backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.cardBorder },
  avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: Colors.white, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  image: { width: '100%', height: '100%' }, initials: { color: Colors.white, fontSize: 16, fontWeight: '600' },
  identity: { flex: 1, marginLeft: 16 }, name: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary }, role: { color: Colors.textSecondary, marginTop: 4 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  profile: { width: '100%', maxWidth: 420, maxHeight: '80%', padding: 24, borderRadius: 16, backgroundColor: Colors.white },
  profileName: { fontSize: 22, fontWeight: '400', color: Colors.primary, marginTop: 16 },
  contactNote: { color: Colors.textSecondary, marginTop: 16, fontSize: 14 },
  contactActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  contactAction: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.iceBlue },
  disabledAction: { opacity: 0.5 }, contactLabel: { color: Colors.primary, fontWeight: '400' },
  close: { color: Colors.accent, paddingVertical: 16, fontWeight: '600' },
});
