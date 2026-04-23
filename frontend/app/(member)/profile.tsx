import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image, ActivityIndicator, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';

interface UserStats {
  clubs_count: number;
  total_saved: number;
  on_time_percentage: number;
  trust_score: number;
}

interface Club {
  id: string;
  name: string;
  monthly_contribution: number;
}

interface PayoutSchedule {
  club_name: string;
  payout_date: string;
  amount: number;
  position: number;
}

export default function ProfileScreen() {
  const { user, logout, updateProfilePhoto } = useAuth();
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<UserStats>({ clubs_count: 0, total_saved: 0, on_time_percentage: 0, trust_score: 0 });
  const [clubs, setClubs] = useState<Club[]>([]);
  const [payoutSchedules, setPayoutSchedules] = useState<PayoutSchedule[]>([]);
  const [showClubsModal, setShowClubsModal] = useState(false);
  const [showPayoutModal, setShowPayoutModal] = useState(false);

  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

  useEffect(() => {
    fetchProfileData();
  }, []);

  const fetchProfileData = async () => {
    try {
      // Fetch user stats
      const statsResponse = await axios.get(`${API_URL}/api/user/stats/${user?.id}`);
      setStats(statsResponse.data);

      // Fetch user clubs
      const clubsResponse = await axios.get(`${API_URL}/api/member/clubs/${user?.id}`);
      setClubs(clubsResponse.data.clubs || []);

      // Fetch payout schedules
      const payoutResponse = await axios.get(`${API_URL}/api/member/payout-schedule/${user?.id}`);
      setPayoutSchedules(payoutResponse.data.schedules || []);
    } catch (error) {
      console.error('Error fetching profile data:', error);
      // Set defaults if API fails
      setStats({ clubs_count: 0, total_saved: 0, on_time_percentage: 0, trust_score: 0 });
      setClubs([]);
      setPayoutSchedules([]);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
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
        <Text style={styles.memberSince}>Member since 2024</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Stats - Dynamically loaded */}
        {loading ? (
          <View style={styles.statsLoading}>
            <ActivityIndicator size="small" color={Colors.mediumGreen} />
          </View>
        ) : (
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.clubs_count}</Text>
              <Text style={styles.statLabel}>Clubs</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>R{stats.total_saved.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Total Saved</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.on_time_percentage}%</Text>
              <Text style={styles.statLabel}>On Time</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, styles.trustScoreValue]}>{stats.trust_score}</Text>
              <Text style={styles.statLabel}>Trust Score</Text>
            </View>
          </View>
        )}

        {/* Menu */}
        <View style={styles.menuSection}>
          <TouchableOpacity style={styles.menuItem} onPress={() => setShowClubsModal(true)}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="people" size={24} color={Colors.mediumGreen} />
              <Text style={styles.menuItemText}>My Clubs</Text>
            </View>
            <View style={styles.menuItemRight}>
              <Text style={styles.menuItemCount}>{clubs.length}</Text>
              <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => setShowPayoutModal(true)}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="calendar" size={24} color={Colors.mediumGreen} />
              <Text style={styles.menuItemText}>Payout Schedule</Text>
            </View>
            <View style={styles.menuItemRight}>
              <Text style={styles.menuItemCount}>{payoutSchedules.length}</Text>
              <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.menuItem}
            onPress={() => router.push('/(member)/trust-score')}
          >
            <View style={styles.menuItemLeft}>
              <Ionicons name="trophy" size={24} color={Colors.gold} />
              <Text style={styles.menuItemText}>Trust Score</Text>
            </View>
            <View style={styles.menuItemRight}>
              <View style={styles.trustScoreBadge}>
                <Text style={styles.trustScoreBadgeText}>{stats.trust_score || '--'}</Text>
              </View>
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

        {/* Ad at bottom */}
        <View style={styles.adContainer}>
          <Text style={styles.adLabel}>Sponsored</Text>
          <View style={styles.adCard}>
            <Text style={styles.adTitle}>Your trust score opens doors</Text>
            <Text style={styles.adBody}>Pre-approved for a R50,000 personal loan at 15% interest. Apply now with no paperwork.</Text>
          </View>
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
              {clubs.length > 0 ? (
                clubs.map((club, index) => (
                  <View key={index} style={styles.clubItem}>
                    <View style={styles.clubIcon}>
                      <Ionicons name="people" size={24} color={Colors.mediumGreen} />
                    </View>
                    <View style={styles.clubInfo}>
                      <Text style={styles.clubName}>{club.name}</Text>
                      <Text style={styles.clubContribution}>R{club.monthly_contribution}/month</Text>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
                  <Text style={styles.emptyStateText}>No Clubs Available</Text>
                  <Text style={styles.emptyStateSubtext}>You haven't joined any clubs yet</Text>
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
              {payoutSchedules.length > 0 ? (
                payoutSchedules.map((schedule, index) => (
                  <View key={index} style={styles.scheduleItem}>
                    <View style={styles.scheduleIcon}>
                      <Ionicons name="calendar" size={24} color={Colors.gold} />
                    </View>
                    <View style={styles.scheduleInfo}>
                      <Text style={styles.scheduleName}>{schedule.club_name}</Text>
                      <Text style={styles.scheduleDate}>{schedule.payout_date}</Text>
                      <Text style={styles.scheduleAmount}>R{schedule.amount.toLocaleString()}</Text>
                    </View>
                    <View style={styles.schedulePosition}>
                      <Text style={styles.positionText}>#{schedule.position}</Text>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="calendar-outline" size={48} color={Colors.textMuted} />
                  <Text style={styles.emptyStateText}>No Payout Schedule</Text>
                  <Text style={styles.emptyStateSubtext}>Join a club to see your payout schedule</Text>
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
    backgroundColor: Colors.darkGreen,
    paddingTop: 50,
    paddingBottom: 20,
    alignItems: 'center',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.gold,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: Colors.gold,
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
    fontWeight: 'bold',
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
