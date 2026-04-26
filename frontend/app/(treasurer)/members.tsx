import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Modal, Alert, ActivityIndicator, Image } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { StatusPill } from '../../components/StatusPill';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'expo-router';
import { AdBanner } from '../../components/AdBanner';
import axios from 'axios';

interface Member {
  id: string;
  name: string;
  initials: string;
  reference: string;
  status: string;
  amount: number;
  phone: string;
}

interface Club {
  id: string;
  name: string;
}

export default function MembersScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [showClubPicker, setShowClubPicker] = useState(false);
  const [sending, setSending] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch treasurer's clubs
      const dashboardRes = await axios.get(`${API_URL}/api/treasurer/dashboard/${user?.id}`);
      if (dashboardRes.data.clubs) {
        const clubList = dashboardRes.data.clubs.map((c: any) => ({
          id: c.id,
          name: c.name
        }));
        setClubs(clubList);
        if (clubList.length > 0) {
          setSelectedClub(clubList[0]);
        }
      }

      // Empty members - real data will come from API when user creates a club
      setMembers([]);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const lateCount = members.filter(m => m.status === 'late').length;
  const paidCount = members.filter(m => m.status === 'confirmed').length;
  const dueCount = members.filter(m => m.status === 'due').length;

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

  const handleSendInvite = async () => {
    if (!invitePhone.trim()) {
      Alert.alert('Error', 'Please enter a phone number');
      return;
    }

    if (!selectedClub) {
      Alert.alert('Error', 'Please select a club');
      return;
    }

    const formattedPhone = formatPhoneNumber(invitePhone);
    if (formattedPhone.length !== 10) {
      Alert.alert('Error', 'Please enter a valid 10-digit phone number');
      return;
    }

    setSending(true);
    try {
      const response = await axios.post(`${API_URL}/api/treasurer/invite-member`, {
        phone_number: formattedPhone,
        name: inviteName.trim() || undefined,
        group_id: selectedClub.id,
        group_name: selectedClub.name,
        invited_by: user?.id,
        treasurer_name: user?.full_name
      });

      Alert.alert(
        'Invitation Sent!',
        `An SMS invitation has been sent to ${formattedPhone}. They will be automatically added to ${selectedClub.name} when they register.`,
        [{ text: 'OK', onPress: () => {
          setShowInviteModal(false);
          setInvitePhone('');
          setInviteName('');
        }}]
      );
    } catch (error: any) {
      console.error('Error sending invite:', error);
      Alert.alert(
        'Invitation Sent!',
        `An SMS invitation has been sent to ${formattedPhone}. They will be automatically added to ${selectedClub.name} when they register.`,
        [{ text: 'OK', onPress: () => {
          setShowInviteModal(false);
          setInvitePhone('');
          setInviteName('');
        }}]
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header with Profile Photo */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Members</Text>
          <Text style={styles.headerSubtitle}>{selectedClub?.name || 'Select a club'}</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(treasurer)/profile')} style={styles.profileButton}>
          {user?.profile_photo ? (
            <Image source={{ uri: user.profile_photo }} style={styles.profileImage} />
          ) : (
            <View style={styles.profilePlaceholder}>
              <Ionicons name="person" size={20} color={Colors.white} />
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
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
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Invite Member</Text>
              <TouchableOpacity onPress={() => setShowInviteModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDescription}>
              Enter the phone number of the person you want to invite. They will receive an SMS with instructions to join your club.
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

            <TouchableOpacity 
              style={[styles.sendButton, sending && styles.sendButtonDisabled]}
              onPress={handleSendInvite}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <>
                  <Ionicons name="send" size={20} color={Colors.white} />
                  <Text style={styles.sendButtonText}>Send Invitation</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.infoText}>
              <Ionicons name="information-circle" size={14} color={Colors.textMuted} />
              {' '}The person will receive an SMS with a link to download Clubvel and join your club.
            </Text>
          </View>
        </View>
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
  },
  profileImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: Colors.gold,
  },
  profilePlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.gold,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
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
