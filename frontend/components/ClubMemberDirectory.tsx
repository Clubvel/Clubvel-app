import ProfilePhotoFrame from './ProfilePhotoFrame';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Colors } from '../constants/Colors';
import ProfilePhotoViewer from './ProfilePhotoViewer';

type DirectoryMember = { id: string; name: string; profile_photo: string | null; role: string };
type Props = { groupId?: string; search?: string; renderDetails?: (memberId: string) => React.ReactNode };
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

export default function ClubMemberDirectory({ groupId, search = '', renderDetails }: Props) {
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
  const fetchDirectory = useCallback(async () => {
    if (!user?.id || !token || !groupId || pending.current?.context === context) return;
    const ticket = ++sequence.current;
    pending.current = { context, ticket };
    setLoading(true); setError(null); setProfile(null); setPhoto(null);
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
      setMembers(data.members.map((row: DirectoryMember) => ({ id: row.id, name: row.name, role: row.role, profile_photo: directoryPhotoUri(row.profile_photo) })));
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
    return () => { ++sequence.current; pending.current = null; setProfile(null); setPhoto(null); };
  }, [fetchDirectory]));
  const allowed = !!user?.id && !!token && !!groupId;
  const current = allowed && owner === context ? members : [];
  const selected = allowed && owner === context && selectionOwner === context ? profile : null;
  const photoKey = (member: DirectoryMember) => JSON.stringify([context, member.id, member.profile_photo]);
  const usablePhoto = (member: DirectoryMember) => !!member.profile_photo && !failedPhotos[photoKey(member)];
  const expanded = allowed && owner === context && selectionOwner === context && photo && usablePhoto(photo) ? photo : null;
  const avatar = (member: DirectoryMember) => {
    const photoTicket = sequence.current;
    return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`View photo of ${member.name}`} disabled={!usablePhoto(member)}
      onPress={() => { setSelectionOwner(context); setPhoto(member); }} style={{ flexShrink: 0 }}>
      <ProfilePhotoFrame size={48} tone="light"><View style={styles.avatar}>
      {usablePhoto(member) ? <Image source={{ uri: member.profile_photo! }} style={styles.image} resizeMode="cover"
        onError={() => { if (latest.current === context && sequence.current === photoTicket) setFailedPhotos(previous => ({ ...previous, [photoKey(member)]: true })); }} /> :
        <Text style={styles.initials}>{initials(member.name)}</Text>}</View></ProfilePhotoFrame>
    </TouchableOpacity>
    );
  };
  return <View style={styles.section}>
    <Text style={styles.title}>Club members</Text>
    {allowed && (loading || owner !== context) && <ActivityIndicator accessibilityLabel="Loading member directory" color={Colors.accent} />}
    {owner === context && error && <View><Text>{error}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Retry member directory" onPress={() => void fetchDirectory()}><Text>Retry</Text></TouchableOpacity></View>}
    {current.filter(member => member.name.toLowerCase().includes(search.toLowerCase())).map(member => <View key={member.id} style={styles.row}>
      {avatar(member)}
      <View style={styles.identity}><TouchableOpacity accessibilityRole="button" accessibilityLabel={`Open profile of ${member.name}`}
        onPress={() => { setSelectionOwner(context); setProfile(member); }}><Text style={styles.name}>{member.name}</Text></TouchableOpacity>
        <Text style={styles.role}>{roleLabel(member.role)}</Text>{renderDetails?.(member.id)}</View>
    </View>)}
    {allowed && owner === context && !loading && !error && members.length === 0 && <Text>No members to display.</Text>}
    <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setProfile(null)}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setProfile(null)} accessibilityLabel="Close member profile backdrop">
        <TouchableOpacity activeOpacity={1} style={styles.profile} onPress={() => {}}>
          <ScrollView>{selected && <View>{avatar(selected)}<Text style={styles.name}>{selected.name}</Text><Text style={styles.role}>{roleLabel(selected.role)}</Text></View>}
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close member profile" onPress={() => setProfile(null)}><Text style={styles.close}>Close</Text></TouchableOpacity>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
    <ProfilePhotoViewer visible={!!expanded} photoUri={expanded?.profile_photo} displayName={expanded?.name} onClose={() => setPhoto(null)} />
  </View>;
}
const styles = StyleSheet.create({
  section: { padding: 16 }, title: { fontSize: 20, fontWeight: '600', color: Colors.textPrimary, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16, marginBottom: 12, backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.cardBorder },
  avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: Colors.white, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  image: { width: '100%', height: '100%' }, initials: { color: Colors.white, fontSize: 16, fontWeight: '600' },
  identity: { flex: 1, marginLeft: 16 }, name: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary }, role: { color: Colors.textSecondary, marginTop: 4 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  profile: { width: '100%', maxWidth: 420, maxHeight: '80%', padding: 24, borderRadius: 16, backgroundColor: Colors.white },
  close: { color: Colors.accent, paddingVertical: 16, fontWeight: '600' },
});
