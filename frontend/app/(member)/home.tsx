import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Alert, Modal, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { StatusPill } from '../../components/StatusPill';
import { AdBanner } from '../../components/AdBanner';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

interface Club {
  id: string;
  name: string;
  member_count: number;
  monthly_contribution: number;
  status: string;
  status_label: string;
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
  };
  clubs: Club[];
}

export default function MemberHomeScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

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
            router.replace('/');
          },
        },
      ]
    );
  };

  const fetchDashboard = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/member/dashboard/${user?.id}`);
      setDashboardData(response.data);
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
  }, [user]);

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
          <Text style={styles.summaryLabel}>Total Saved</Text>
          <Text style={styles.summaryValue}>
            R{dashboardData?.summary.total_saved.toFixed(2) || '0.00'}
          </Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Active Clubs</Text>
          <Text style={styles.summaryValue}>{dashboardData?.summary.active_clubs || 0}</Text>
        </View>
      </View>

      <View style={styles.summaryContainer}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Next Claim</Text>
          <Text style={styles.summaryValue}>
            {dashboardData?.summary.days_until_next_claim !== null
              ? `${dashboardData?.summary.days_until_next_claim} days`
              : 'None'}
          </Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Overdue</Text>
          <Text style={[styles.summaryValue, dashboardData?.summary.overdue_contributions ? styles.overdueText : null]}>
            {dashboardData?.summary.overdue_contributions || 0}
          </Text>
        </View>
      </View>

      {/* My Clubs Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>My Clubs</Text>

        {dashboardData?.clubs && dashboardData.clubs.length > 0 ? (
          dashboardData.clubs.map((club) => (
            <TouchableOpacity
              key={club.id}
              style={styles.clubCard}
              onPress={() => router.push(`/(member)/club/${club.id}`)}
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
            <Text style={styles.emptyStateSubtext}>Join a stokvel group to get started</Text>
          </View>
        )}
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
          
          <TouchableOpacity style={styles.dropdownItem} onPress={navigateToPrivacy}>
            <Ionicons name="shield-checkmark-outline" size={20} color={Colors.textPrimary} />
            <Text style={styles.dropdownItemText}>Privacy Policy</Text>
          </TouchableOpacity>
          
          <View style={styles.dropdownDivider} />
          
          <TouchableOpacity style={styles.dropdownItemLogout} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color={Colors.statusLate} />
            <Text style={styles.dropdownItemTextLogout}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
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
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.gold,
    justifyContent: 'center',
    alignItems: 'center',
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
});
