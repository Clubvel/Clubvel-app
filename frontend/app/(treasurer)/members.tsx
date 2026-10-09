import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Modal, Alert, ActivityIndicator, Image, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { StatusPill } from '../../components/StatusPill';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter, useLocalSearchParams } from 'expo-router';
import ProfilePhotoViewer from '../../components/ProfilePhotoViewer';
import { AdBanner } from '../../components/AdBanner';
import axios from 'axios';

interface Member {
  id: string;
  name: string;
  initials: string;
  reference: string;
  status: string;
  paymentStatus: string;
  amount: number;
  phone: string;
}

interface Club {
  id: string;
  name: string;
}

export default function MembersScreen() {
  const { user, token } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ groupId?: string; id?: string }>();
  const [photoExpanded, setPhotoExpanded] = useState(false);
  const [showMembersClubPicker, setShowMembersClubPicker] = useState(false);
  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [showClubPicker, setShowClubPicker] = useState(false);
  const [sending, setSending] = useState(false);
  const invitationInFlight = useRef(false);
  const membersRequestId = useRef(0);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedClub) {
      void fetchMembers(selectedClub.id);
    }
  }, [selectedClub?.id]);

  useEffect(() => {
    const requestedId = params.groupId || params.id;
    const requestedClub = clubs.find(club => club.id === requestedId);
    if (requestedClub && selectedClub?.id !== requestedClub.id) {
      setSelectedClub(requestedClub);
      setSearchQuery('');
    }
  }, [params.groupId, params.id, clubs]);

  const fetchMembers = async (groupId: string) => {
    const requestId = ++membersRequestId.current;
    setMembers([]);
    setMembersError(null);
    setMembersLoading(true);
    try {
      const response = await axios.get(
        `${API_URL}/api/treasurer/club/${groupId}?treasurer_id=${user?.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (requestId !== membersRequestId.current) return;
      setMembers((response.data.members || []).map((member: any) => ({
        id: member.id,
        name: member.name,
        initials: member.name
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((part: string) => part.charAt(0).toUpperCase())
          .join(''),
        reference: member.reference,
        status: member.membership_status,
        paymentStatus: member.status,
        amount: member.amount_paid,
        phone: member.phone,
      })));
    } catch (error) {
      if (requestId !== membersRequestId.current) return;
      console.error('Error fetching members:', error);
      setMembersError('Unable to load members for this club. Please try again.');
      setMembers([]);
    } finally {
      if (requestId === membersRequestId.current) setMembersLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      // Fetch treasurer's clubs
      const dashboardRes = await axios.get(`${API_URL}/api/treasurer/dashboard/${user?.id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (dashboardRes.data.clubs) {
        const clubList = dashboardRes.data.clubs.map((c: any) => ({
          id: c.id,
          name: c.name
        }));
        setClubs(clubList);
        if (clubList.length > 0) {
          const requestedClub = clubList.find((club: Club) => club.id === (params.groupId || params.id));
          setSelectedClub(requestedClub || clubList[0]);
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const lateCount = members.filter(m => m.paymentStatus === 'late').length;
  const paidCount = members.filter(m => m.paymentStatus === 'confirmed').length;
  const dueCount = members.filter(m => m.paymentStatus === 'due').length;

  const getAvatarColor = (status: string) => {
    switch (status) {
      case 'late':
        return Colors.statusLate;
      case 'confirmed':
        return Colors.statusPaid;
      default:
        return Colors.statusUpcoming;
    }
  };

  const formatPhoneNumber = (phone: string) => {
    // Remove any non-digit characters
    let cleaned = phone.replace(/\D/g, '');
    // Ensure it starts with 0 for SA numbers
    if (cleaned.startsWith('27')) {
      cleaned = '0' + cleaned.substring(2);
    }
    return cleaned;
  };

  const handleSendInvite = async (channel: 'whatsapp' | 'sms') => {
    if (invitationInFlight.current) return;
    if (!invitePhone.trim()) {
      Alert.alert('Error', 'Please enter a phone number');
      return;
    }
    if (!selectedClub) {
      Alert.alert('Error', 'Please select a club');
      return;
    }
    if (!user?.id || !token) {
      Alert.alert('Error', 'Please sign in before inviting a member');
      return;
    }
    const formattedPhone = formatPhoneNumber(invitePhone);
    if (formattedPhone.length !== 10) {
      Alert.alert('Error', 'Please enter a valid 10-digit phone number');
      return;
    }

    invitationInFlight.current = true;
    setSending(true);
    try {
      const { data } = await axios.post(`${API_URL}/api/treasurer/invite-member`, {
        phone_number: formattedPhone,
        name: inviteName.trim() || undefined,
        group_id: selectedClub.id,
        channel,
      }, { headers: { Authorization: `Bearer ${token}` } });

      if (channel === 'whatsapp') {
        try {
          const digits = data.phone_number.replace(/^\+/, '');
          await Linking.openURL(`https://wa.me/${digits}?text=${encodeURIComponent(data.invitation_message)}`);
          Alert.alert('WhatsApp opened', 'Press Send in WhatsApp to share the invitation. It remains pending in Clubvel until they accept.');
        } catch {
          Alert.alert('WhatsApp could not be opened', 'The Clubvel invitation is still pending. You can use SMS instead.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Use SMS', onPress: () => handleSendInvite('sms') },
          ]);
        }
      } else if (data.delivery_status === 'submitted') {
        Alert.alert('SMS submitted', 'The invitation was submitted to the SMS provider. They must accept it in My Clubvel before joining.');
      } else if (data.delivery_status === 'mock') {
        Alert.alert('Invitation saved', 'No SMS was sent in test mode. The invitation is pending in Clubvel.');
      } else {
        Alert.alert('SMS could not be sent', 'The Clubvel invitation is still pending. Try SMS again or use WhatsApp.');
      }
    } catch (error: any) {
      Alert.alert('Could not prepare invitation', error.response?.data?.detail || 'Please try again.');
    } finally {
      invitationInFlight.current = false;
      setSending(false);
    }
  };

  return (
    <View style={styles.container}>
      <ProfilePhotoViewer visible={photoExpanded} photoUri={user?.profile_photo} displayName={user?.full_name} onClose={() => setPhotoExpanded(false)} />
      {/* Header with Profile Photo */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => user?.profile_photo ? setPhotoExpanded(true) : router.push('/(treasurer)/profile')} style={styles.profileButton}>
          {user?.profile_photo ? (
            <Image source={{ uri: user.profile_photo }} style={styles.profileImage} resizeMode="cover" />
          ) : (
            <View style={styles.profilePlaceholder}>
              <Ionicons name="person" size={32} color={Colors.white} />
            </View>
          )}
        </TouchableOpacity>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Members</Text>
          <Text style={styles.headerSubtitle}>{selectedClub?.name || 'Select a club'}</Text>
        </View>
      
      </View>

      <ScrollView style={styles.content}>
        <TouchableOpacity style={styles.membersClubSelector} onPress={() => setShowMembersClubPicker(!showMembersClubPicker)} accessibilityRole="button" accessibilityLabel="Select club for members">
          <Text style={styles.membersClubSelectorText}>{selectedClub?.name || 'Select a club'}</Text>
          <Ionicons name={showMembersClubPicker ? 'chevron-up' : 'chevron-down'} size={24} color={Colors.textSecondary} />
        </TouchableOpacity>
        {showMembersClubPicker && <View style={styles.membersClubOptions}>{clubs.map(club => <TouchableOpacity key={club.id} style={styles.clubPickerItem} onPress={() => { setSelectedClub(club); setShowMembersClubPicker(false); setSearchQuery(''); }}><Text style={styles.clubPickerItemText}>{club.name}</Text>{selectedClub?.id === club.id && <Ionicons name="checkmark" size={20} color={Colors.mediumGreen} />}</TouchableOpacity>)}</View>}
        {membersLoading && <ActivityIndicator accessibilityLabel="Loading club members" color={Colors.mediumGreen} />}
        {membersError && <View style={{ paddingVertical: 12 }}><Text style={{ color: Colors.textSecondary }}>{membersError}</Text><TouchableOpacity accessibilityRole="button" onPress={() => selectedClub && void fetchMembers(selectedClub.id)}><Text style={{ color: Colors.mediumGreen, fontWeight: 'bold', paddingTop: 8 }}>Retry</Text></TouchableOpacity></View>}
        {/* Summary Row */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryItem, styles.summaryItemPaid]}>
            <Text style={styles.summaryCount}>{paidCount}</Text>
            <Text style={styles.summaryLabel}>Paid</Text>
          </View>
          <View style={[styles.summaryItem, styles.summaryItemLate]}>
            <Text style={styles.summaryCount}>{lateCount}</Text>
            <Text style={styles.summaryLabel}>Late</Text>
          </View>
          <View style={[styles.summaryItem, styles.summaryItemDue]}>
            <Text style={styles.summaryCount}>{dueCount}</Text>
            <Text style={styles.summaryLabel}>Due</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryCount}>{members.length}</Text>
            <Text style={styles.summaryLabel}>Total</Text>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={Colors.textSecondary} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search members..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Member List */}
        <View style={styles.memberList}>
          {members
            .filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()))
            .map((member) => (
              <TouchableOpacity key={member.id} style={styles.memberCard}>
                <View style={[styles.memberAvatar, { backgroundColor: getAvatarColor(member.status) }]}>
                  <Text style={styles.memberAvatarText}>{member.initials}</Text>
                </View>

                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{member.name}</Text>
                  <View style={styles.memberMeta}>
                    <Text style={styles.memberMetaText}>{member.reference}</Text>
                    <Text style={styles.memberMetaText}> • </Text>
                    <Text style={styles.memberMetaText}>R{member.amount}</Text>
                  </View>
                </View>

                <StatusPill status={member.status} />
              </TouchableOpacity>
            ))}
        </View>

        {/* Invite Member Button */}
        <TouchableOpacity 
          style={styles.inviteButton}
          onPress={() => setShowInviteModal(true)}
        >
          <Ionicons name="person-add" size={24} color={Colors.white} />
          <Text style={styles.inviteButtonText}>Invite New Member</Text>
        </TouchableOpacity>

        {/* Ad Banner */}
        <AdBanner size="banner" />

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Invite Member Modal */}
      <Modal
        visible={showInviteModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowInviteModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={true}
            >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Invite Member</Text>
              <TouchableOpacity onPress={() => setShowInviteModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDescription}>
              Enter the phone number of the person you want to invite. Choose WhatsApp or SMS to share instructions to join your club.
            </Text>

            {/* Club Selector */}
            <Text style={styles.inputLabel}>Select Club</Text>
            <TouchableOpacity 
              style={styles.clubSelector}
              onPress={() => setShowClubPicker(!showClubPicker)}
            >
              <Text style={styles.clubSelectorText}>
                {selectedClub?.name || 'Select a club'}
              </Text>
              <Ionicons name="chevron-down" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>

            {showClubPicker && (
              <View style={styles.clubPickerDropdown}>
                {clubs.map((club) => (
                  <TouchableOpacity
                    key={club.id}
                    style={[
                      styles.clubPickerItem,
                      selectedClub?.id === club.id && styles.clubPickerItemSelected
                    ]}
                    onPress={() => {
                      setSelectedClub(club);
                      setShowClubPicker(false);
                    }}
                  >
                    <Text style={[
                      styles.clubPickerItemText,
                      selectedClub?.id === club.id && styles.clubPickerItemTextSelected
                    ]}>
                      {club.name}
                    </Text>
                    {selectedClub?.id === club.id && (
                      <Ionicons name="checkmark" size={20} color={Colors.mediumGreen} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Name Input (Optional) */}
            <Text style={styles.inputLabel}>Name (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter their name"
              value={inviteName}
              onChangeText={setInviteName}
              autoCapitalize="words"
            />

            {/* Phone Input */}
            <Text style={styles.inputLabel}>Phone Number *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., 0821234567"
              value={invitePhone}
              onChangeText={setInvitePhone}
              keyboardType="phone-pad"
              maxLength={12}
            />

            <View style={styles.deliveryButtons}>
              {(['whatsapp', 'sms'] as const).map((channel) => (
                <TouchableOpacity
                  key={channel}
                  style={[styles.sendButton, styles.deliveryButton, sending && styles.sendButtonDisabled]}
                  onPress={() => handleSendInvite(channel)}
                  disabled={sending}
                >
                  <Ionicons name={channel === 'whatsapp' ? 'logo-whatsapp' : 'chatbubble-outline'} size={20} color={Colors.white} />
                  <Text style={styles.sendButtonText}>{channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {sending && <ActivityIndicator color={Colors.accent} />}

            <Text style={styles.infoText}>
              <Ionicons name="information-circle" size={14} color={Colors.textMuted} />
              {' '}The person will receive an SMS with a link to download Clubvel and join your club.
            </Text>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.lightBackground,
  },
  header: {
    backgroundColor: Colors.mediumGreen,
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.white,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
  },
  profileButton: {
    padding: 4,
    flexShrink: 0,
  },
  profileImage: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 2,
    borderColor: Colors.gold,
  },
  profilePlaceholder: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: Colors.gold,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  membersClubSelector: { marginHorizontal: 24, marginTop: 16, padding: 16, borderRadius: 12, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.cardBorder, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  membersClubSelectorText: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary },
  membersClubOptions: { marginHorizontal: 24, padding: 8, backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.cardBorder },
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 12,
  },
  summaryItem: {
    flex: 1,
    backgroundColor: Colors.white,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  summaryItemPaid: {
    borderColor: Colors.statusPaid,
    borderWidth: 2,
  },
  summaryItemLate: {
    borderColor: Colors.statusLate,
    borderWidth: 2,
  },
  summaryItemDue: {
    borderColor: Colors.gold,
    borderWidth: 2,
  },
  summaryCount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  summaryLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    marginHorizontal: 24,
    marginBottom: 16,
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  memberList: {
    paddingHorizontal: 24,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  memberAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberAvatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.white,
  },
  memberInfo: {
    flex: 1,
    marginLeft: 16,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  memberMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  memberMetaText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.mediumGreen,
    marginHorizontal: 24,
    marginTop: 8,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
  },
  inviteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  modalDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.lightBackground,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.textPrimary,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  clubSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.lightBackground,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  clubSelectorText: {
    fontSize: 16,
    color: Colors.textPrimary,
  },
  clubPickerDropdown: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  clubPickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  clubPickerItemSelected: {
    backgroundColor: Colors.lightBackground,
  },
  clubPickerItemText: {
    fontSize: 16,
    color: Colors.textPrimary,
  },
  clubPickerItemTextSelected: {
    color: Colors.mediumGreen,
    fontWeight: '600',
  },
  deliveryButtons: { flexDirection: 'row', gap: 12 },
  deliveryButton: { flex: 1 },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.mediumGreen,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
    marginTop: 8,
  },
  sendButtonDisabled: {
    backgroundColor: Colors.textMuted,
  },
  sendButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  infoText: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
});
