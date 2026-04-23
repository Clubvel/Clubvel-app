import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Linking, Alert, Modal, Image, TextInput } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { AdBanner } from '../../components/AdBanner';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface LateMember {
  member_name: string;
  group_name: string;
  days_late: number;
  amount: number;
  phone: string;
}

interface Club {
  id: string;
  name: string;
  member_count: number;
  due_date: number;
  collected: number;
  expected: number;
  status: string;
  late_count: number;
}

interface DashboardData {
  summary: {
    total_clubs: number;
    total_members: number;
    total_collected_this_month: number;
    late_members_count: number;
  };
  urgent_alerts: LateMember[];
  clubs: Club[];
  next_claim: {
    member_name: string;
    group_name: string;
    amount: number;
    date: string;
  } | null;
}

export default function AdminDashboardScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showCreateClubModal, setShowCreateClubModal] = useState(false);
  const [creatingClub, setCreatingClub] = useState(false);
  
  // Create Club Form State
  const [clubName, setClubName] = useState('');
  const [clubType, setClubType] = useState('savings');
  const [monthlyContribution, setMonthlyContribution] = useState('');
  const [paymentDueDate, setPaymentDueDate] = useState('25');
  const [bankName, setBankName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankAccountHolder, setBankAccountHolder] = useState('');

  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

  const fetchDashboard = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/admin/dashboard/${user?.id}`);
      setDashboardData(response.data);
    } catch (error) {
      console.error('Error fetching admin dashboard:', error);
      // Set empty dashboard data if API fails
      setDashboardData({
        summary: { total_clubs: 0, total_members: 0, total_collected_this_month: 0, late_members_count: 0 },
        urgent_alerts: [],
        clubs: [],
        next_claim: null
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchDashboard();
    }
  }, [user]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboard();
  };

  const handleRemindMember = (phone: string, name: string) => {
    Alert.alert(
      'Send Reminder',
      `Send WhatsApp reminder to ${name} at ${phone}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: () => {
            Alert.alert('Reminder Sent', `WhatsApp reminder sent to ${name}`);
          },
        },
      ]
    );
  };

  const handleCreateClub = async () => {
    if (!clubName || !monthlyContribution || !bankName || !bankAccountNumber || !bankAccountHolder) {
      Alert.alert('Missing Information', 'Please fill in all required fields');
      return;
    }

    setCreatingClub(true);
    try {
      const response = await axios.post(`${API_URL}/api/groups/create`, {
        group_name: clubName,
        group_type: clubType,
        monthly_contribution: parseFloat(monthlyContribution),
        payment_due_date: parseInt(paymentDueDate),
        bank_name: bankName,
        bank_account_number: bankAccountNumber,
        bank_account_holder: bankAccountHolder,
        admin_user_id: user?.id,
        payment_reference_prefix: clubName.substring(0, 3).toUpperCase(),
        start_date: new Date().toISOString()
      });

      Alert.alert('Success', `Club "${clubName}" created successfully!`);
      setShowCreateClubModal(false);
      // Reset form
      setClubName('');
      setClubType('savings');
      setMonthlyContribution('');
      setPaymentDueDate('25');
      setBankName('');
      setBankAccountNumber('');
      setBankAccountHolder('');
      // Refresh dashboard
      fetchDashboard();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to create club');
    } finally {
      setCreatingClub(false);
    }
  };

  const handleLogout = () => {
    setShowProfileMenu(false);
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
      
      await AsyncStorage.clear();
      
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

  const navigateToSupport = () => {
    setShowProfileMenu(false);
    router.push('/(treasurer)/support');
  };

  const navigateToProfile = () => {
    setShowProfileMenu(false);
    router.push('/(treasurer)/profile');
  };

  const navigateToPrivacy = () => {
    setShowProfileMenu(false);
    router.push('/(treasurer)/privacy');
  };

  const navigateToAbout = () => {
    setShowProfileMenu(false);
    router.push('/(treasurer)/about');
  };

  const navigateToNotifications = () => {
    setShowProfileMenu(false);
    router.push('/(treasurer)/notifications');
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
          <Text style={styles.summaryLabel}>Total Clubs</Text>
          <Text style={styles.summaryValue}>{dashboardData?.summary.total_clubs || 0}</Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total Members</Text>
          <Text style={styles.summaryValue}>{dashboardData?.summary.total_members || 0}</Text>
        </View>
      </View>

      <View style={styles.summaryContainer}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Collected This Month</Text>
          <Text style={[styles.summaryValue, styles.moneyValue]}>
            R{dashboardData?.summary.total_collected_this_month?.toFixed(2) || '0.00'}
          </Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Late Members</Text>
          <Text style={[styles.summaryValue, dashboardData?.summary.late_members_count ? styles.lateValue : null]}>
            {dashboardData?.summary.late_members_count || 0}
          </Text>
        </View>
      </View>

      {/* Create Club Button */}
      <View style={styles.createClubSection}>
        <TouchableOpacity 
          style={styles.createClubButton}
          onPress={() => setShowCreateClubModal(true)}
        >
          <Ionicons name="add-circle" size={24} color={Colors.white} />
          <Text style={styles.createClubButtonText}>Create New Club</Text>
        </TouchableOpacity>
      </View>

      {/* Urgent Alerts */}
      {dashboardData?.urgent_alerts && dashboardData.urgent_alerts.length > 0 && (
        <View style={styles.section}>
          <View style={styles.urgentHeader}>
            <Ionicons name="alert-circle" size={20} color={Colors.statusLate} />
            <Text style={styles.urgentTitle}>Urgent: Late Payments</Text>
          </View>

          {dashboardData.urgent_alerts.map((alert, index) => (
            <View key={index} style={styles.urgentCard}>
              <View style={styles.urgentInfo}>
                <Text style={styles.urgentMemberName}>{alert.member_name}</Text>
                <Text style={styles.urgentDetails}>
                  {alert.group_name} • {alert.days_late} days late • R{alert.amount}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.remindButton}
                onPress={() => handleRemindMember(alert.phone, alert.member_name)}
              >
                <Ionicons name="logo-whatsapp" size={20} color={Colors.white} />
                <Text style={styles.remindButtonText}>Remind</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* All Clubs */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>All Clubs</Text>

        {dashboardData?.clubs && dashboardData.clubs.length > 0 ? (
          dashboardData.clubs.map((club) => (
            <TouchableOpacity 
              key={club.id} 
              style={styles.clubCard}
              onPress={() => router.push({
                pathname: '/(treasurer)/club-detail',
                params: { id: club.id, name: club.name }
              })}
              activeOpacity={0.7}
            >
              <View style={styles.clubCardHeader}>
                <Text style={styles.clubName}>{club.name}</Text>
                {club.late_count > 0 ? (
                  <View style={styles.lateBadge}>
                    <Text style={styles.lateBadgeText}>{club.late_count} late</Text>
                  </View>
                ) : (
                  <View style={styles.paidBadge}>
                    <Ionicons name="checkmark-circle" size={16} color={Colors.statusPaid} />
                    <Text style={styles.paidBadgeText}>All paid</Text>
                  </View>
                )}
              </View>

              <View style={styles.clubMeta}>
                <Ionicons name="people" size={14} color={Colors.textSecondary} />
                <Text style={styles.clubMetaText}>{club.member_count} members</Text>
                <Text style={styles.clubMetaText}> • </Text>
                <Text style={styles.clubMetaText}>Due: {club.due_date} of month</Text>
              </View>

              <View style={styles.clubProgress}>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${club.expected > 0 ? (club.collected / club.expected) * 100 : 0}%`,
                        backgroundColor: club.late_count > 0 ? Colors.gold : Colors.statusPaid,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.progressText}>
                  R{club.collected.toFixed(2)} / R{club.expected.toFixed(2)}
                </Text>
              </View>
              
              <View style={styles.tapHint}>
                <Text style={styles.tapHintText}>Tap to view details</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyStateText}>No clubs managed</Text>
            <Text style={styles.emptyStateSubtext}>Tap "Create New Club" above to get started</Text>
          </View>
        )}
      </View>

      {/* Next Claim */}
      {dashboardData?.next_claim && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Next Claim</Text>
          <View style={[styles.card, styles.claimCard]}>
            <View style={styles.claimHeader}>
              <Ionicons name="trophy" size={24} color={Colors.gold} />
              <Text style={styles.claimAmount}>R{dashboardData.next_claim.amount.toFixed(2)}</Text>
            </View>
            <Text style={styles.claimMember}>{dashboardData.next_claim.member_name}</Text>
            <Text style={styles.claimDetails}>
              {dashboardData.next_claim.group_name} • {dashboardData.next_claim.date}
            </Text>
          </View>
        </View>
      )}

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
                {user?.full_name?.charAt(0) || 'A'}
              </Text>
            </View>
            <View style={styles.dropdownUserInfo}>
              <Text style={styles.dropdownUserName}>{user?.full_name}</Text>
              <Text style={styles.dropdownUserRole}>Admin</Text>
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
          
          <TouchableOpacity style={styles.dropdownItem} onPress={navigateToAbout}>
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

    {/* Create Club Modal */}
    <Modal
      visible={showCreateClubModal}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setShowCreateClubModal(false)}
    >
      <View style={styles.createClubModalOverlay}>
        <View style={styles.createClubModalContent}>
          <View style={styles.createClubModalHeader}>
            <Text style={styles.createClubModalTitle}>Create New Club</Text>
            <TouchableOpacity onPress={() => setShowCreateClubModal(false)}>
              <Ionicons name="close" size={28} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.createClubForm}>
            <Text style={styles.inputLabel}>Club Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Family Savings Club"
              value={clubName}
              onChangeText={setClubName}
            />

            <Text style={styles.inputLabel}>Club Type</Text>
            <View style={styles.typeSelector}>
              {['savings', 'burial', 'investment', 'grocery', 'social'].map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.typeButton, clubType === type && styles.typeButtonActive]}
                  onPress={() => setClubType(type)}
                >
                  <Text style={[styles.typeButtonText, clubType === type && styles.typeButtonTextActive]}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Monthly Contribution (R) *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 500"
              value={monthlyContribution}
              onChangeText={setMonthlyContribution}
              keyboardType="numeric"
            />

            <Text style={styles.inputLabel}>Payment Due Date (Day of Month)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 25"
              value={paymentDueDate}
              onChangeText={setPaymentDueDate}
              keyboardType="numeric"
              maxLength={2}
            />

            <Text style={styles.inputLabel}>Bank Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. FNB, Standard Bank"
              value={bankName}
              onChangeText={setBankName}
            />

            <Text style={styles.inputLabel}>Bank Account Number *</Text>
            <TextInput
              style={styles.input}
              placeholder="Account number"
              value={bankAccountNumber}
              onChangeText={setBankAccountNumber}
              keyboardType="numeric"
            />

            <Text style={styles.inputLabel}>Account Holder Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="Name on the account"
              value={bankAccountHolder}
              onChangeText={setBankAccountHolder}
            />
          </ScrollView>

          <TouchableOpacity
            style={[styles.createClubSubmitButton, creatingClub && styles.buttonDisabled]}
            onPress={handleCreateClub}
            disabled={creatingClub}
          >
            {creatingClub ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.createClubSubmitText}>Create Club</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
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
  moneyValue: {
    color: Colors.mediumGreen,
  },
  lateValue: {
    color: Colors.statusLate,
  },
  createClubSection: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  createClubButton: {
    backgroundColor: Colors.mediumGreen,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  createClubButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: 'bold',
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
  urgentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  urgentTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.statusLate,
  },
  urgentCard: {
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.statusLate,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  urgentInfo: {
    flex: 1,
    marginRight: 12,
  },
  urgentMemberName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  urgentDetails: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  remindButton: {
    backgroundColor: '#25D366',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  remindButtonText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: 'bold',
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
    alignItems: 'center',
    marginBottom: 8,
  },
  clubName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    flex: 1,
  },
  lateBadge: {
    backgroundColor: Colors.statusLate,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  lateBadgeText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: 'bold',
  },
  paidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  paidBadgeText: {
    color: Colors.statusPaid,
    fontSize: 12,
    fontWeight: '600',
  },
  clubMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  clubMetaText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  clubProgress: {
    gap: 8,
  },
  progressBar: {
    height: 8,
    backgroundColor: Colors.lightBackground,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'right',
  },
  tapHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  tapHintText: {
    fontSize: 12,
    color: Colors.textMuted,
    marginRight: 4,
  },
  card: {
    backgroundColor: Colors.white,
    padding: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  claimCard: {
    backgroundColor: Colors.lightGold,
    borderColor: Colors.gold,
  },
  claimHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  claimAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  claimMember: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  claimDetails: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  emptyState: {
    backgroundColor: Colors.white,
    padding: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: 12,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 4,
    textAlign: 'center',
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
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.gold,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
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
  // Create Club Modal Styles
  createClubModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  createClubModalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: 32,
  },
  createClubModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  createClubModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  createClubForm: {
    padding: 20,
    maxHeight: 400,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: Colors.lightBackground,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  typeSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.lightBackground,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  typeButtonActive: {
    backgroundColor: Colors.mediumGreen,
    borderColor: Colors.mediumGreen,
  },
  typeButtonText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  typeButtonTextActive: {
    color: Colors.white,
    fontWeight: '600',
  },
  createClubSubmitButton: {
    backgroundColor: Colors.mediumGreen,
    marginHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  createClubSubmitText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  buttonDisabled: {
    opacity: 0.6,
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
});
