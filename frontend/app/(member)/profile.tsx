import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image, ActivityIndicator, Modal, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import ProfilePhotoViewer from '../../components/ProfilePhotoViewer';
import ProfilePhotoFrame from '../../components/ProfilePhotoFrame';
import EditProfile from '../../components/EditProfile';

interface UserStats {
  clubs_count: number;
  total_saved: number;
  on_time_percentage: number;
  trust_score: number | null;
  date_joined?: string | null;
}

interface Club {
  id: string;
  name: string;
  monthly_contribution: number;
}

interface PayoutSchedule {
  club_name: string;
  payout_date: string | null;
  amount: number | null;
  position: number | null;
}

export default function ProfileScreen() {
  const { user, token, logout, updateProfilePhoto } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [uploading, setUploading] = useState(false);
  const [photoExpanded, setPhotoExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<UserStats>({ clubs_count: 0, total_saved: 0, on_time_percentage: 0, trust_score: null, date_joined: null });
  const [clubs, setClubs] = useState<Club[]>([]);
  const [payoutSchedules, setPayoutSchedules] = useState<PayoutSchedule[]>([]);
  const [showClubsModal, setShowClubsModal] = useState(false);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [manageProfileExpanded, setManageProfileExpanded] = useState(false);

  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

  useEffect(() => {
    fetchProfileData();
  }, []);

  const fetchProfileData = async () => {
    if (!user?.id || !token) {
      setLoading(false);
      return;
    }

    try {
      const headers = { Authorization: `Bearer ${token}` };

      const [statsResult, clubsResult, payoutResult] = await Promise.allSettled([
        axios.get(`${API_URL}/api/user/stats/${user.id}`, {
          headers,
          timeout: 15000,
        }),
        axios.get(`${API_URL}/api/member/clubs/${user.id}`, {
          headers,
          timeout: 15000,
        }),
        axios.get(`${API_URL}/api/member/payout-schedule/${user.id}`, {
          headers,
          timeout: 15000,
        }),
      ]);

      if (statsResult.status === 'fulfilled') {
        setStats(statsResult.value.data);
      } else {
        console.error('Error fetching user stats:', statsResult.reason);
      }

      if (clubsResult.status === 'fulfilled') {
        setClubs(clubsResult.value.data.clubs || []);
      } else {
        console.error('Error fetching user clubs:', clubsResult.reason);
      }

      if (payoutResult.status === 'fulfilled') {
        setPayoutSchedules(payoutResult.value.data.schedules || []);
      } else {
        console.error('Error fetching payout schedules:', payoutResult.reason);
      }
    } finally {
      setLoading(false);
    }
  };

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

  const handleTakePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Required', 'Please allow camera access to take a profile photo.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
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
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const handlePhotoOptions = () => {
    Alert.alert('Update Profile Photo', 'Choose how you would like to add your photo.', [
      { text: 'Take Photo', onPress: handleTakePhoto },
      { text: 'Choose from Gallery', onPress: handleChangePhoto },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleRemovePhoto = () => {
    Alert.alert(
      "Remove profile photo?",
      "Your profile will return to the default avatar.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove photo",
          style: "destructive",
          onPress: async () => {
            setUploading(true);
            try {
              await updateProfilePhoto(null);
              setPhotoExpanded(false);
              Alert.alert("Success", "Profile photo removed.");
            } catch (error: any) {
              Alert.alert("Error", error.message || "Failed to remove profile photo");
            } finally {
              setUploading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <ProfilePhotoViewer visible={photoExpanded} photoUri={user?.profile_photo} displayName={user?.full_name} onClose={() => setPhotoExpanded(false)} />
      {/* Profile Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <View style={styles.headerTitleRow} />
        <View style={styles.profileHeaderRow}>
          <View style={styles.avatarContainer}>
            <TouchableOpacity
              onPress={() => user?.profile_photo ? setPhotoExpanded(true) : handlePhotoOptions()}
              disabled={uploading}
              accessibilityRole="button"
              accessibilityLabel={user?.profile_photo ? "View full-size profile photo" : "Add profile photo"}
            >
              <ProfilePhotoFrame size={148}>
                {user?.profile_photo ? (
                  <Image source={{ uri: user.profile_photo }} style={styles.avatarImage} resizeMode="cover" />
                ) : (
                  <View style={styles.avatar}>
                    <Ionicons name="person" size={44} color={Colors.white} />
                  </View>
                )}
              </ProfilePhotoFrame>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.editBadge}
              onPress={handlePhotoOptions}
              disabled={uploading}
              accessibilityRole="button"
              accessibilityLabel="Take or choose a profile photo"
            >
              {uploading ? <ActivityIndicator size="small" color={Colors.white} /> : <Ionicons name="camera" size={14} color={Colors.white} />}
            </TouchableOpacity>
          </View>
          <View style={styles.profileHeaderInfo}>
            <Text style={styles.greeting}>Hello</Text>
            <Text style={styles.name}>{user?.full_name}</Text>
          </View>
        </View>
        <View style={styles.headerDivider} />
        <View style={styles.headerDateRow}>
          <Text style={styles.headerDate}>{new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
          <Text style={styles.headerClubsLabel}>MY PROFILE</Text>
        </View>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.menuSection}>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => setManageProfileExpanded(!manageProfileExpanded)}
            accessibilityRole="button"
            accessibilityLabel="Manage My Profile"
            accessibilityState={{ expanded: manageProfileExpanded }}
          >
            <View style={styles.menuItemLeft}>
              <Ionicons name="person-circle-outline" size={24} color="#343A40" />
              <Text style={styles.menuItemText}>Manage My Profile</Text>
            </View>
            <Ionicons name={manageProfileExpanded ? "chevron-up" : "chevron-down"} size={18} color="#343A40" />
          </TouchableOpacity>
          {manageProfileExpanded && (
            <>
              <View style={styles.divider} />
              <TouchableOpacity style={styles.menuItem} onPress={handleChangePhoto} disabled={uploading}>
                <View style={styles.menuItemLeft}>
                  <Ionicons name="camera-outline" size={22} color="#343A40" />
                  <Text style={styles.menuItemText}>Change Photo</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#343A40" />
              </TouchableOpacity>
              <View style={styles.divider} />
              <TouchableOpacity style={styles.menuItem} onPress={handleRemovePhoto} disabled={!user?.profile_photo || uploading}>
                <View style={styles.menuItemLeft}>
                  <Ionicons name="trash-outline" size={22} color="#343A40" />
                  <Text style={[styles.menuItemText, !user?.profile_photo && styles.disabledMenuText]}>Remove Photo</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#343A40" />
              </TouchableOpacity>
              <View style={styles.divider} />
              <View style={styles.menuItem}>
                <View style={styles.menuItemLeft}>
                  <Ionicons name="person-outline" size={22} color="#343A40" />
                  <EditProfile />
                </View>
                <Ionicons name="chevron-forward" size={18} color="#343A40" />
              </View>
            </>
          )}
          <View style={styles.divider} />
          <TouchableOpacity style={styles.menuItem} onPress={() => setShowClubsModal(true)}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="people" size={24} color={'#343A40'} />
              <Text style={styles.menuItemText}>My Clubs</Text>
            </View>
            <View style={styles.menuItemRight}>
              <Text style={styles.menuItemCount}>{clubs.length}</Text>
              <Ionicons name="chevron-forward" size={18} color={'#343A40'} />
            </View>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.menuItem} onPress={() => setShowPayoutModal(true)}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="calendar" size={24} color={'#343A40'} />
              <Text style={styles.menuItemText}>Payout Schedule</Text>
            </View>
            <View style={styles.menuItemRight}>
              <Text style={styles.menuItemCount}>{payoutSchedules.length}</Text>
              <Ionicons name="chevron-forward" size={18} color={'#343A40'} />
            </View>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(member)/notifications')}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="notifications" size={24} color={'#343A40'} />
              <Text style={styles.menuItemText}>Notification Settings</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={'#343A40'} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(member)/privacy')}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="shield-checkmark" size={24} color={'#343A40'} />
              <Text style={styles.menuItemText}>Privacy Policy</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={'#343A40'} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(member)/support')}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="help-circle" size={24} color={'#343A40'} />
              <Text style={styles.menuItemText}>Contact Us</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={'#343A40'} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.signOutButton} onPress={handleLogout}>
          <Ionicons name="log-out" size={20} color={Colors.white} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
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
              <TouchableOpacity onPress={() => setShowClubsModal(false)} style={styles.modalCloseButton} accessibilityRole="button" accessibilityLabel="Close My Clubs">
                <Ionicons name="close" size={22} color={Colors.white} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} contentContainerStyle={{ flexGrow: 1 }}>
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
              <TouchableOpacity onPress={() => setShowPayoutModal(false)} style={styles.modalCloseButton} accessibilityRole="button" accessibilityLabel="Close Payout Schedule">
                <Ionicons name="close" size={22} color={Colors.white} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} contentContainerStyle={{ flexGrow: 1 }}>
              {payoutSchedules.length > 0 ? (
                payoutSchedules.map((schedule, index) => (
                  <View key={index} style={styles.scheduleItem}>
                    <View style={styles.scheduleIcon}>
                      <Ionicons name="calendar" size={24} color={Colors.corporateBlue} />
                    </View>
                    <View style={styles.scheduleInfo}>
                      <Text style={styles.scheduleName}>{schedule.club_name}</Text>
                      <Text style={styles.scheduleDate}>{schedule.payout_date || 'Date unavailable'}</Text>
                      <Text style={styles.scheduleAmount}>{schedule.amount == null ? 'Amount unavailable' : `R${schedule.amount.toLocaleString()}`}</Text>
                    </View>
                    <View style={styles.schedulePosition}>
                      <Text style={styles.positionText}>{schedule.position == null ? '--' : `#${schedule.position}`}</Text>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="calendar-outline" size={48} color={Colors.textMuted} />
                  <Text style={styles.emptyStateText}>No Payout Schedule</Text>
                  <Text style={styles.emptyStateSubtext}>No recorded payout schedule is available yet</Text>
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
    backgroundColor: Colors.white,
  },
  header: {
    backgroundColor: '#D9D9D9',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerTitleRow: { minHeight: 44 },
  profileHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  headerDivider: {
    height: 1,
    backgroundColor: 'rgba(38,53,45,0.16)',
    marginTop: 10,
  },
  headerDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  headerDate: {
    fontSize: 10,
    color: '#26352D',
    fontWeight: '700',
    letterSpacing: 1,
  },
  headerClubsLabel: {
    fontSize: 10,
    color: '#26352D',
    fontWeight: '700',
    letterSpacing: 1,
  },
  profileHeaderInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  photoActionText: {
    color: '#343A40',
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 8,
  },
  avatar: {
    width: 148,
    height: 148,
    borderRadius: 74,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center', },
  avatarContainer: {
    position: 'relative',
    marginBottom: 0,
  },
  avatarImage: {
    width: 148,
    height: 148,
    borderRadius: 74,
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
  greeting: {
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '400',
    color: '#4A4A4A',
  },
  name: {
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '700',
    color: '#000000',
    marginTop: 2,
  },
  memberSince: {
    fontSize: 14,
    color: '#343A40',
    marginTop: 16,
    textAlign: 'center',
    alignSelf: 'stretch',
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
  profileSection: {
    backgroundColor: Colors.white,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  sectionTitle: {
    color: '#343A40',
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  editProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  disabledMenuText: {
    opacity: 0.45,
  },
  menuSection: {
    backgroundColor: Colors.white,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  signOutButton: {
    backgroundColor: '#D96540',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 24,
    borderRadius: 12,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  signOutText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuItemText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#343A40',
  },
  menuItemCount: {
    fontSize: 14,
    color: '#343A40',
    fontWeight: '500',
  },
  logoutText: {
    color: Colors.white,
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
    marginHorizontal: 24,
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
    backgroundColor: Colors.iceBlue,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
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
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 24,
  },
  modalContent: {
    width: '92%',
    maxWidth: 560,
    height: '75%',
    minHeight: '55%',
    maxHeight: '88%',
    backgroundColor: '#FFF8E8',
    borderRadius: 18,
    borderWidth: 3,
    borderColor: '#343A40',
    padding: 10,
    overflow: 'hidden',
  },
  modalHeader: {
    minHeight: 58,
    backgroundColor: '#343A40',
    borderRadius: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#C96B45',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  modalBody: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 10,
  },
  emptyState: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
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
    backgroundColor: Colors.iceBlue,
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
    backgroundColor: Colors.corporateBlue,
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
