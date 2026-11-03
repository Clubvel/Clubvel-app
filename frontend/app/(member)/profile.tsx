import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image, ActivityIndicator, Modal, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import { usePersonalClaims } from '../../hooks/usePersonalClaims';

interface UserStats {
  clubs_count: number;
  total_saved: number;
  on_time_percentage: number;
  trust_score: number | null;
  date_joined?: string | null;
}

export default function ProfileScreen() {
  const { user, token, logout, updateProfilePhoto } = useAuth();
  const router = useRouter();
  const { showClubs } = useLocalSearchParams<{ showClubs?: string }>();
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [statsError, setStatsError] = useState(false);
  const statsRequest = useRef(0);
  const { clubs: membershipClubs, membershipError, refreshMemberships, selectGroup } = useWorkspace();
  const clubs = membershipClubs || [];
  const clubsError = !!membershipError;
  const clubsLoading = membershipClubs === null && !clubsError;
  const payouts = usePersonalClaims(user?.id, token);
  const payoutSchedules = payouts.records;
  const [showClubsModal, setShowClubsModal] = useState(false);
  const [showPayoutModal, setShowPayoutModal] = useState(false);

  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

  const fetchProfileData = useCallback(async () => {
    const ticket = ++statsRequest.current;
    setLoading(true); setStatsError(false);
    try {
      if (!user?.id || !token) throw new Error('Sign in required');
      const response = await axios.get(`${API_URL}/api/user/stats/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 15000,
      });
      const value = response.data;
      if (!value || !Number.isFinite(value.total_saved) || value.total_saved < 0 ||
          !Number.isFinite(value.on_time_percentage) || value.on_time_percentage < 0 || value.on_time_percentage > 100) {
        throw new Error('Invalid profile statistics');
      }
      if (ticket === statsRequest.current) setStats(value);
    } catch {
      if (ticket === statsRequest.current) { setStats(null); setStatsError(true); }
    } finally {
      if (ticket === statsRequest.current) setLoading(false);
    }
  }, [API_URL, user?.id, token]);

  useEffect(() => {
    if (showClubs === 'true') {
      setShowClubsModal(true);
      router.setParams({ showClubs: undefined });
    }
  }, [showClubs, router]);

  useEffect(() => {
    void fetchProfileData();
    void refreshMemberships().catch(() => {});
    return () => { statsRequest.current += 1; };
  }, [fetchProfileData, refreshMemberships]);

  const handleLogout = async () => {
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

  const handleChangePhoto = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow access to your photo library to change your profile picture.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        setUploading(true);
        try {
          await updateProfilePhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
          Alert.alert('Success', 'Profile photo updated successfully!');
        } catch (error: any) {
          Alert.alert('Error', error.message || 'Failed to update profile photo');
        } finally {
          setUploading(false);
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.avatarContainer} onPress={handleChangePhoto} disabled={uploading}>
          {user?.profile_photo ? (
            <Image source={{ uri: user.profile_photo }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatar}>
              <Ionicons name="person" size={32} color={Colors.white} />
            </View>
          )}
          <View style={styles.editBadge}>
            {uploading ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Ionicons name="camera" size={14} color={Colors.white} />
            )}
          </View>
        </TouchableOpacity>
        <Text style={styles.name}>{user?.full_name}</Text>
        {stats?.date_joined && (
          <Text style={styles.memberSince}>Joined {new Date(stats?.date_joined).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}</Text>
        )}
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            {clubsLoading ? <ActivityIndicator accessibilityLabel="Loading clubs" color={Colors.mediumGreen} /> :
              <Text accessibilityLabel={clubsError ? 'Clubs unavailable' : `${clubs.length} clubs`}
                style={styles.statValue}>{clubsError ? '—' : clubs.length}</Text>}
            <Text style={styles.statLabel}>Clubs</Text>
          </View>
          <View style={styles.statCard}>
            {loading ? <ActivityIndicator accessibilityLabel="Loading savings" color={Colors.mediumGreen} /> :
              <Text accessibilityLabel={statsError ? 'Savings unavailable' : undefined} style={styles.statValue}>
                {stats ? `R${stats.total_saved.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
              </Text>}
            <Text style={styles.statLabel}>Total Saved</Text>
          </View>
          <View style={styles.statCard}>
            {loading ? <ActivityIndicator accessibilityLabel="Loading payment statistics" color={Colors.mediumGreen} /> :
              <Text accessibilityLabel={statsError ? 'On time percentage unavailable' : undefined} style={styles.statValue}>{stats ? `${stats.on_time_percentage}%` : '—'}</Text>}
            <Text style={styles.statLabel}>On Time</Text>
          </View>
        </View>
        {clubsError && <TouchableOpacity accessibilityRole="button" onPress={() => void refreshMemberships().catch(() => {})}>
          <Text style={styles.dataError}>Could not load your clubs. Tap to retry.</Text>
        </TouchableOpacity>}
        {statsError && <TouchableOpacity accessibilityRole="button" onPress={() => void fetchProfileData()}>
          <Text style={styles.dataError}>Could not load your statistics. Tap to retry.</Text>
        </TouchableOpacity>}

        {/* Menu */}
        <View style={styles.menuSection}>
          <TouchableOpacity style={styles.menuItem} onPress={() => setShowClubsModal(true)}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="people" size={24} color={Colors.mediumGreen} />
              <Text style={styles.menuItemText}>My Clubs</Text>
            </View>
            <View style={styles.menuItemRight}>
              <Text style={styles.menuItemCount}>{clubsLoading ? 'Loading…' : clubsError ? 'Unavailable' : clubs.length}</Text>
              <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => setShowPayoutModal(true)}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="calendar" size={24} color={Colors.mediumGreen} />
              <Text style={styles.menuItemText}>Payout Schedule</Text>
            </View>
            <View style={styles.menuItemRight}>
              <Text style={styles.menuItemCount}>{payouts.phase === 'loading' ? 'Loading...' : payouts.phase === 'error' ? 'Unavailable' : payoutSchedules.length}</Text>
              <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
            </View>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity 
            style={styles.menuItem}
            onPress={() => router.push('/(member)/notifications')}
          >
            <View style={styles.menuItemLeft}>
              <Ionicons name="notifications" size={24} color={Colors.mediumGreen} />
              <Text style={styles.menuItemText}>Notification Settings</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity 
            style={styles.menuItem}
            onPress={() => router.push('/(member)/support')}
          >
            <View style={styles.menuItemLeft}>
              <Ionicons name="help-circle" size={24} color={Colors.mediumGreen} />
              <Text style={styles.menuItemText}>Contact Us</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.menuItem}
            onPress={() => router.push('/(member)/privacy')}
          >
            <View style={styles.menuItemLeft}>
              <Ionicons name="shield-checkmark" size={24} color={Colors.mediumGreen} />
              <Text style={styles.menuItemText}>Privacy Policy</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="log-out" size={24} color={Colors.statusLate} />
              <Text style={[styles.menuItemText, styles.logoutText]}>Sign Out</Text>
            </View>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* My Clubs Modal */}
      <Modal
        visible={showClubsModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowClubsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>My Clubs</Text>
              <TouchableOpacity onPress={() => setShowClubsModal(false)}>
                <Ionicons name="close" size={28} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              {clubsLoading ? <ActivityIndicator color={Colors.mediumGreen} /> : clubsError ? (
                <TouchableOpacity accessibilityRole="button" onPress={() => void refreshMemberships().catch(() => {})}>
                  <Text style={styles.emptyStateText}>Could not load your clubs. Tap to retry.</Text>
                </TouchableOpacity>
              ) : clubs.length > 0 ? (
                clubs.map((club) => (
                  <TouchableOpacity key={club.id} style={styles.clubItem} accessibilityRole="button" onPress={() => { setShowClubsModal(false); void selectGroup(club.id); }}>
                    <View style={styles.clubIcon}>
                      <Ionicons name="people" size={24} color={Colors.mediumGreen} />
                    </View>
                    <View style={styles.clubInfo}>
                      <Text style={styles.clubName}>{club.name}</Text>
                      <Text style={styles.clubContribution}>{club.role}</Text>
                      <Text style={styles.clubContribution}>{club.contribution_mode === 'flexible_goal' ? (club.target_amount_per_member == null ? 'Goal amount unavailable' : `Goal R${club.target_amount_per_member.toLocaleString()}`) : `R${club.monthly_contribution}/month`}</Text>
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
                  <Text style={styles.emptyStateText}>No Clubs Available</Text>
                  <Text style={styles.emptyStateSubtext}>You haven&apos;t joined any clubs yet</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Payout Schedule Modal */}
      <Modal
        visible={showPayoutModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowPayoutModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Payout Schedule</Text>
              <TouchableOpacity onPress={() => setShowPayoutModal(false)}>
                <Ionicons name="close" size={28} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              {payouts.phase === 'loading' ? <ActivityIndicator color={Colors.mediumGreen} />
              : payouts.phase === 'error' ? <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>Unable to load payout records</Text>
                  <TouchableOpacity accessibilityRole="button" onPress={() => void payouts.reload()}><Text style={styles.emptyStateSubtext}>Retry</Text></TouchableOpacity>
                </View>
              : payoutSchedules.length > 0 ? (
                payoutSchedules.map((schedule, index) => (
                  <View key={index} style={styles.scheduleItem}>
                    <View style={styles.scheduleIcon}>
                      <Ionicons name="calendar" size={24} color={Colors.gold} />
                    </View>
                    <View style={styles.scheduleInfo}>
                      <Text style={styles.scheduleName}>{schedule.club_name}</Text>
                      <Text style={styles.scheduleDate}>{schedule.payout_date || 'Date unavailable'}</Text>
                      <Text style={styles.scheduleAmount}>{schedule.amount == null ? 'Amount unavailable' : `R${schedule.amount.toLocaleString()}`}</Text>
                    </View>

                  </View>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="calendar-outline" size={48} color={Colors.textMuted} />
                  <Text style={styles.emptyStateText}>No payout schedule set</Text>
                  <Text style={styles.emptyStateSubtext}>No explicit payout or claim has been recorded.</Text>
                </View>
              )}
            </ScrollView>
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
    backgroundColor: Colors.midnightNavy,
    paddingTop: 50,
    paddingBottom: 20,
    alignItems: 'center',
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.clementine,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  avatarImage: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: Colors.clementine,
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: Colors.mediumGreen,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },
  name: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.white,
    marginBottom: 4,
  },
  memberSince: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  content: {
    flex: 1,
  },
  dataError: { marginHorizontal: 24, marginBottom: 12, fontSize: 14, lineHeight: 20, color: Colors.textSecondary },
  statsLoading: {
    padding: 32,
    alignItems: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.white,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  trustScoreValue: {
    color: Colors.mediumGreen,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  menuSection: {
    backgroundColor: Colors.white,
    marginHorizontal: 24,
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  menuItemLeft: {
    flex: 1,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  menuItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuItemText: {
    flexShrink: 1,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  menuItemCount: {
    fontSize: 14,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  logoutText: {
    color: Colors.statusLate,
  },
  trustScoreBadge: {
    backgroundColor: Colors.mediumGreen,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  trustScoreBadgeText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.cardBorder,
    marginHorizontal: 16,
  },
  adContainer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
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
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
    paddingBottom: 50,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  modalBody: {
    padding: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 4,
  },
  clubItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  clubIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.lightBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clubInfo: {
    marginLeft: 12,
    flex: 1,
  },
  clubName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  clubContribution: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  scheduleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  scheduleIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.lightGold,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scheduleInfo: {
    marginLeft: 12,
    flex: 1,
  },
  scheduleName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  scheduleDate: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  scheduleAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.mediumGreen,
    marginTop: 2,
  },
  schedulePosition: {
    backgroundColor: Colors.gold,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  positionText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.white,
  },
});
