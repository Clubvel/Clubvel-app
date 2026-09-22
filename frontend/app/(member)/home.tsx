import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Alert, Modal, Image, TextInput, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { StatusPill } from '../../components/StatusPill';
import { AdBanner } from '../../components/AdBanner';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Club {
  id: string;
  name: string;
  member_count: number;
  monthly_contribution: number;
  status: string;
  status_label: string;
  role: 'member' | 'admin' | 'treasurer';
}

interface DashboardData {
  user: {
    id: string;
    full_name: string;
    first_name: string;
  };
  summary: {
    total_saved: number;
    active_clubs: number;
    days_until_next_claim: number | null;
    overdue_contributions: number;
    upcoming_payments: number;
    claims_count: number;
  };
  clubs: Club[];
}

interface PendingInvitation {
  id: string;
  group_id: string;
  group_name: string;
  invited_by_name?: string;
  expires_at: string;
}

export default function MemberHomeScreen() {
  const { user, token, logout } = useAuth();
  const router = useRouter();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [monthlyContribution, setMonthlyContribution] = useState('');
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [acceptingInvitation, setAcceptingInvitation] = useState<string | null>(null);
  const [showInvitations, setShowInvitations] = useState(false);
  const [invitationsLoading, setInvitationsLoading] = useState(false);
  const [invitationsError, setInvitationsError] = useState<string | null>(null);

  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

  const handleLogout = async () => {
    setShowProfileMenu(false);

    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Are you sure you want to sign out?');
      if (!confirmed) return;

      await logout();
      router.replace('/auth');
      return;
    }

    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/auth');
          },
        },
      ]
    );
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await axios.delete(`${API_URL}/api/user/delete-account`, {
        data: {
          user_id: user?.id,
          confirmation: 'DELETE'
        }
      });
      
      // Clear local storage
      await AsyncStorage.clear();
      
      // Show success message and redirect
      Alert.alert(
        'Account Deleted',
        'Your personal information has been deleted. Financial records have been anonymized for group accounting purposes.',
        [
          {
            text: 'OK',
            onPress: () => {
              logout();
              router.replace('/');
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('Error deleting account:', error);
      Alert.alert(
        'Error',
        error.response?.data?.detail || 'Failed to delete account. Please try again.'
      );
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const fetchDashboard = async () => {
    try {
      const [dashboardResponse, invitationsResponse] = await Promise.all([
        axios.get(`${API_URL}/api/member/dashboard/${user?.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${API_URL}/api/invitations/pending/${user?.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      setDashboardData(dashboardResponse.data);
      setPendingInvitations(invitationsResponse.data.invitations || []);
    } catch (error) {
      console.error('Error fetching dashboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchDashboard();
    }
  }, [user, token]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboard();
  };

  const navigateToProfile = () => {
    setShowProfileMenu(false);
    router.push('/(member)/profile');
  };

  const navigateToSupport = () => {
    setShowProfileMenu(false);
    router.push('/(member)/support');
  };

  const navigateToPrivacy = () => {
    setShowProfileMenu(false);
    router.push('/(member)/privacy');
  };

  const navigateToNotifications = () => {
    setShowProfileMenu(false);
    router.push('/(member)/notifications');
  };

  const openClub = (club: Club) => {
    if (club.role === 'admin' || club.role === 'treasurer') {
      router.push({ pathname: '/(treasurer)/club-detail', params: { id: club.id, name: club.name } });
      return;
    }
    router.push(`/(member)/club/${club.id}`);
  };

  const createGroup = async () => {
    const amount = Number(monthlyContribution);
    if (!groupName.trim() || !Number.isFinite(amount) || amount < 0) {
      Alert.alert('Check the details', 'Enter a group name and a valid contribution amount.');
      return;
    }
    setCreatingGroup(true);
    try {
      const response = await axios.post(`${API_URL}/api/groups/create`, {
        group_name: groupName.trim(),
        group_type: 'savings',
        monthly_contribution: amount,
        payment_due_date: 25,
        admin_user_id: user?.id,
        payment_reference_prefix: groupName.trim().slice(0, 3).toUpperCase() || 'CLB',
      });
      setShowCreateGroup(false);
      setGroupName('');
      setMonthlyContribution('');
      await fetchDashboard();
      router.push({
        pathname: '/(treasurer)/club-detail',
        params: { id: response.data.group_id, name: response.data.group_name },
      });
    } catch (error: any) {
      Alert.alert('Could not create group', error.response?.data?.detail || 'Please try again.');
    } finally {
      setCreatingGroup(false);
    }
  };

  const openInvitations = async () => {
    setShowInvitations(true);
    setInvitationsLoading(true);
    setInvitationsError(null);
    try {
      const response = await axios.get(`${API_URL}/api/invitations/pending/${user?.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPendingInvitations(response.data.invitations || []);
    } catch (error: any) {
      setInvitationsError(error.response?.data?.detail || 'Could not load invitations. Please try again.');
    } finally {
      setInvitationsLoading(false);
    }
  };

  const acceptInvitation = async (invitation: PendingInvitation) => {
    setAcceptingInvitation(invitation.id);
    try {
      await axios.post(`${API_URL}/api/invitations/accept`, {
        invitation_id: invitation.id,
        user_id: user?.id,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchDashboard();
      Alert.alert('Group joined', `You are now a member of ${invitation.group_name}.`);
    } catch (error: any) {
      Alert.alert('Could not accept invitation', error.response?.data?.detail || 'Please try again.');
    } finally {
      setAcceptingInvitation(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.mediumGreen} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logoText}>Clubvel</Text>
          <TouchableOpacity 
            style={styles.avatarButton}
            onPress={() => setShowProfileMenu(true)}
          >
            {user?.profile_photo ? (
              <Image source={{ uri: user.profile_photo }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatar}>
                <Ionicons name="person" size={24} color={Colors.white} />
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Summary Cards */}
        <View style={styles.summaryContainer}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Contributions</Text>
          <Text style={styles.summaryValue}>
            R{dashboardData?.summary.total_saved.toFixed(2) || '0.00'}
          </Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Groups &amp; Clubs</Text>
          <Text style={styles.summaryValue}>{dashboardData?.summary.active_clubs || 0}</Text>
        </View>
      </View>

      <View style={styles.summaryContainer}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Upcoming Payments</Text>
          <Text style={styles.summaryValue}>{dashboardData?.summary.upcoming_payments || 0}</Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Claims</Text>
          <Text style={styles.summaryValue}>{dashboardData?.summary.claims_count || 0}</Text>
        </View>
      </View>

      {/* My Clubs Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>My Clubs</Text>

        {pendingInvitations.length > 0 && (
          <View style={styles.invitationsSection}>
            <Text style={styles.invitationsTitle}>Pending Invitations</Text>
            {pendingInvitations.map((invitation) => (
              <View key={invitation.id} style={styles.invitationCard}>
                <View style={styles.invitationInfo}>
                  <Text style={styles.invitationGroup}>{invitation.group_name}</Text>
                  <Text style={styles.invitationFrom}>
                    {invitation.invited_by_name
                      ? `Invited by ${invitation.invited_by_name}`
                      : 'Group invitation'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.acceptButton}
                  onPress={() => acceptInvitation(invitation)}
                  disabled={acceptingInvitation === invitation.id}
                >
                  {acceptingInvitation === invitation.id
                    ? <ActivityIndicator size="small" color={Colors.white} />
                    : <Text style={styles.acceptButtonText}>Accept</Text>}
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {dashboardData?.clubs && dashboardData.clubs.length > 0 ? (
          dashboardData.clubs.map((club) => (
            <TouchableOpacity
              key={club.id}
              style={styles.clubCard}
              onPress={() => openClub(club)}
            >
              <View style={styles.clubCardHeader}>
                <View style={styles.clubInfo}>
                  <Text style={styles.clubName}>{club.name}</Text>
                  <View style={styles.clubMeta}>
                    <Ionicons name="people" size={14} color={Colors.textSecondary} />
                    <Text style={styles.clubMetaText}>{club.member_count} members</Text>
                    <Text style={styles.clubMetaText}> • </Text>
                    <Text style={styles.clubMetaText}>R{club.monthly_contribution}/month</Text>
                  </View>
                </View>
                <StatusPill status={club.status} label={club.status_label} />
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyStateText}>No clubs yet</Text>
            <Text style={styles.emptyStateSubtext}>Create a Stokvel, Social Club or Society Group, or join one through an invitation.</Text>
          </View>
        )}
        <View style={styles.primaryActions}>
          <TouchableOpacity style={styles.createButton} onPress={() => setShowCreateGroup(true)}>
            <Ionicons name="add" size={20} color={Colors.white} />
            <Text style={styles.createButtonText}>Create Stokvel / Social Club / Society Group</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.inviteButton} onPress={openInvitations}>
            <Ionicons name="mail-outline" size={20} color={Colors.accent} />
            <Text style={styles.inviteButtonText}>Join Stokvel / Social Club / Society Group</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Advertisement Banner */}
      <AdBanner size="banner" />
    </ScrollView>

    {/* Profile Dropdown Menu Modal */}
    <Modal
      visible={showProfileMenu}
      transparent={true}
      animationType="fade"
      onRequestClose={() => setShowProfileMenu(false)}
    >
      <TouchableOpacity 
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={() => setShowProfileMenu(false)}
      >
        <View style={styles.dropdownMenu}>
          <View style={styles.dropdownHeader}>
            <View style={styles.dropdownAvatar}>
              <Text style={styles.dropdownAvatarText}>
                {dashboardData?.user.first_name.charAt(0)}
              </Text>
            </View>
            <View style={styles.dropdownUserInfo}>
              <Text style={styles.dropdownUserName}>{dashboardData?.user.full_name}</Text>
              <Text style={styles.dropdownUserRole}>Member</Text>
            </View>
          </View>
          
          <View style={styles.dropdownDivider} />
          
          <TouchableOpacity style={styles.dropdownItem} onPress={navigateToProfile}>
            <Ionicons name="person-outline" size={20} color={Colors.textPrimary} />
            <Text style={styles.dropdownItemText}>My Profile</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.dropdownItem} onPress={navigateToSupport}>
            <Ionicons name="help-circle-outline" size={20} color={Colors.textPrimary} />
            <Text style={styles.dropdownItemText}>Contact Us</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.dropdownItem} onPress={() => {
            setShowProfileMenu(false);
            router.push('/(member)/about');
          }}>
            <Ionicons name="information-circle-outline" size={20} color={Colors.textPrimary} />
            <Text style={styles.dropdownItemText}>About Us</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.dropdownItem} onPress={navigateToNotifications}>
            <Ionicons name="notifications-outline" size={20} color={Colors.textPrimary} />
            <Text style={styles.dropdownItemText}>Notification Preferences</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.dropdownItem} onPress={navigateToPrivacy}>
            <Ionicons name="shield-checkmark-outline" size={20} color={Colors.textPrimary} />
            <Text style={styles.dropdownItemText}>Privacy Policy</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.dropdownItem} 
            onPress={() => {
              setShowProfileMenu(false);
              setShowDeleteModal(true);
            }}
          >
            <Ionicons name="trash-outline" size={20} color={Colors.statusLate} />
            <Text style={[styles.dropdownItemText, { color: Colors.statusLate }]}>Delete My Account</Text>
          </TouchableOpacity>
          
          <View style={styles.dropdownDivider} />
          
          <TouchableOpacity style={styles.dropdownItemLogout} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color={Colors.statusLate} />
            <Text style={styles.dropdownItemTextLogout}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>

    {/* Delete Account Confirmation Modal */}
    <Modal
      visible={showDeleteModal}
      transparent={true}
      animationType="fade"
      onRequestClose={() => setShowDeleteModal(false)}
    >
      <View style={styles.deleteModalOverlay}>
        <View style={styles.deleteModalContent}>
          <View style={styles.deleteModalIcon}>
            <Ionicons name="warning" size={48} color={Colors.statusLate} />
          </View>
          
          <Text style={styles.deleteModalTitle}>Delete Your Account?</Text>
          
          <Text style={styles.deleteModalText}>
            Are you sure? This will permanently delete your personal information. Financial records required for group accounting may be retained.
          </Text>
          
          <View style={styles.deleteModalButtons}>
            <TouchableOpacity 
              style={styles.deleteModalCancelBtn}
              onPress={() => setShowDeleteModal(false)}
              disabled={deleting}
            >
              <Text style={styles.deleteModalCancelText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.deleteModalDeleteBtn, deleting && styles.deleteModalBtnDisabled]}
              onPress={handleDeleteAccount}
              disabled={deleting}
            >
              {deleting ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Text style={styles.deleteModalDeleteText}>Delete My Account</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    <Modal visible={showCreateGroup} transparent animationType="slide" onRequestClose={() => setShowCreateGroup(false)}>
      <View style={styles.formOverlay}>
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Create a Group</Text>
          <Text style={styles.formHelp}>You will be the admin of this group only.</Text>
          <TextInput
            style={styles.input}
            placeholder="Group name"
            value={groupName}
            onChangeText={setGroupName}
          />
          <TextInput
            style={styles.input}
            placeholder="Monthly contribution (R)"
            keyboardType="decimal-pad"
            value={monthlyContribution}
            onChangeText={setMonthlyContribution}
          />
          <View style={styles.formActions}>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setShowCreateGroup(false)} disabled={creatingGroup}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.submitButton} onPress={createGroup} disabled={creatingGroup}>
              {creatingGroup ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.submitButtonText}>Create</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    <Modal visible={showInvitations} transparent animationType="slide" onRequestClose={() => setShowInvitations(false)}>
      <View style={styles.formOverlay}>
        <View style={styles.formCard}>
          <View style={styles.invitationModalHeader}>
            <View style={styles.invitationInfo}>
              <Text style={styles.formTitle}>Join a Group</Text>
              <Text style={styles.formHelp}>Accept an invitation sent to your Clubvel phone number.</Text>
            </View>
            <TouchableOpacity onPress={() => setShowInvitations(false)} accessibilityLabel="Close invitations">
              <Ionicons name="close" size={26} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {invitationsLoading ? (
            <ActivityIndicator style={styles.invitationModalStatus} color={Colors.accent} />
          ) : invitationsError ? (
            <View style={styles.invitationEmptyState}>
              <Text style={styles.invitationEmptyTitle}>Invitations unavailable</Text>
              <Text style={styles.invitationEmptyText}>{invitationsError}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={openInvitations}>
                <Text style={styles.retryButtonText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : pendingInvitations.length === 0 ? (
            <View style={styles.invitationEmptyState}>
              <Ionicons name="mail-open-outline" size={44} color={Colors.textMuted} />
              <Text style={styles.invitationEmptyTitle}>No pending invitations</Text>
              <Text style={styles.invitationEmptyText}>
                Ask a group admin to invite the phone number on your Clubvel account, then check again here.
              </Text>
              <TouchableOpacity style={styles.retryButton} onPress={openInvitations}>
                <Text style={styles.retryButtonText}>Check Again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            pendingInvitations.map((invitation) => (
              <View key={invitation.id} style={styles.invitationCard}>
                <View style={styles.invitationInfo}>
                  <Text style={styles.invitationGroup}>{invitation.group_name}</Text>
                  <Text style={styles.invitationFrom}>
                    {invitation.invited_by_name ? `Invited by ${invitation.invited_by_name}` : 'Group invitation'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.acceptButton}
                  onPress={() => acceptInvitation(invitation)}
                  disabled={acceptingInvitation === invitation.id}
                >
                  {acceptingInvitation === invitation.id
                    ? <ActivityIndicator size="small" color={Colors.white} />
                    : <Text style={styles.acceptButtonText}>Accept</Text>}
                </TouchableOpacity>
              </View>
            ))
          )}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.lightBackground,
  },
  header: {
    backgroundColor: Colors.darkGreen,
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.white,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoutButton: {
    padding: 4,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.white,
  },
  summaryContainer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 16,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  summaryLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  overdueText: {
    color: Colors.statusLate,
  },
  section: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  clubCard: {
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 12,
  },
  clubCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  clubInfo: {
    flex: 1,
    marginRight: 12,
  },
  clubName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  clubMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  clubMetaText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  adContainer: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
  },
  adLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  adCard: {
    backgroundColor: Colors.lightGold,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gold,
  },
  adTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  adBody: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  logo: {
    width: 120,
    height: 36,
  },
  logoText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.white,
    letterSpacing: 1,
  },
  avatarButton: {
    padding: 4,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.gold,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: Colors.gold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 110,
    paddingRight: 16,
  },
  dropdownMenu: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    width: 260,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'hidden',
  },
  dropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.lightBackground,
  },
  dropdownAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.gold,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownAvatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.white,
  },
  dropdownUserInfo: {
    marginLeft: 12,
    flex: 1,
  },
  dropdownUserName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  dropdownUserRole: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: Colors.cardBorder,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  dropdownItemText: {
    fontSize: 15,
    color: Colors.textPrimary,
  },
  dropdownItemLogout: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  dropdownItemTextLogout: {
    fontSize: 15,
    color: Colors.statusLate,
    fontWeight: '500',
  },
  // Delete Account Modal Styles
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  deleteModalContent: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  deleteModalIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  deleteModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 12,
    textAlign: 'center',
  },
  deleteModalText: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  deleteModalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  deleteModalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.lightBackground,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  deleteModalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  deleteModalDeleteBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.statusLate,
    alignItems: 'center',
  },
  deleteModalDeleteText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  deleteModalBtnDisabled: {
    opacity: 0.6,
  },
  invitationsSection: { gap: 10, marginBottom: 18 },
  invitationsTitle: { color: Colors.textPrimary, fontSize: 16, fontWeight: '700' },
  invitationCard: {
    alignItems: 'center', backgroundColor: Colors.white, borderColor: Colors.cardBorder,
    borderRadius: 12, borderWidth: 1, flexDirection: 'row', padding: 14,
  },
  invitationInfo: { flex: 1 },
  invitationGroup: { color: Colors.textPrimary, fontSize: 16, fontWeight: '700' },
  invitationFrom: { color: Colors.textSecondary, fontSize: 13, marginTop: 3 },
  invitationModalHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  invitationModalStatus: { marginVertical: 32 },
  invitationEmptyState: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 24 },
  invitationEmptyTitle: { color: Colors.textPrimary, fontSize: 17, fontWeight: '700', marginTop: 10 },
  invitationEmptyText: { color: Colors.textSecondary, fontSize: 14, lineHeight: 20, marginTop: 6, textAlign: 'center' },
  retryButton: { borderColor: Colors.accent, borderRadius: 9, borderWidth: 1, marginTop: 18, paddingHorizontal: 18, paddingVertical: 10 },
  retryButtonText: { color: Colors.accent, fontSize: 14, fontWeight: '700' },
  acceptButton: {
    alignItems: 'center', backgroundColor: Colors.accent, borderRadius: 9,
    justifyContent: 'center', minHeight: 38, minWidth: 76, paddingHorizontal: 14,
  },
  acceptButtonText: { color: Colors.white, fontSize: 14, fontWeight: '700' },
  primaryActions: { gap: 12, marginTop: 16 },
  createButton: {
    alignItems: 'center', backgroundColor: Colors.accent, borderRadius: 12,
    flexDirection: 'row', gap: 8, justifyContent: 'center', paddingVertical: 14,
  },
  createButtonText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  inviteButton: {
    alignItems: 'center', backgroundColor: Colors.white, borderColor: Colors.accent,
    borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 8,
    justifyContent: 'center', paddingVertical: 14,
  },
  inviteButtonText: { color: Colors.accent, fontSize: 16, fontWeight: '700' },
  formOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.55)', flex: 1, justifyContent: 'flex-end',
  },
  formCard: {
    backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 36,
  },
  formTitle: { color: Colors.textPrimary, fontSize: 22, fontWeight: '700' },
  formHelp: { color: Colors.textSecondary, fontSize: 14, marginBottom: 20, marginTop: 6 },
  input: {
    borderColor: Colors.cardBorder, borderRadius: 10, borderWidth: 1, color: Colors.textPrimary,
    fontSize: 16, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 13,
  },
  formActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelButton: {
    alignItems: 'center', borderColor: Colors.cardBorder, borderRadius: 10,
    borderWidth: 1, flex: 1, paddingVertical: 14,
  },
  cancelButtonText: { color: Colors.textPrimary, fontSize: 16, fontWeight: '600' },
  submitButton: {
    alignItems: 'center', backgroundColor: Colors.accent, borderRadius: 10,
    flex: 1, paddingVertical: 14,
  },
  submitButtonText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
});
