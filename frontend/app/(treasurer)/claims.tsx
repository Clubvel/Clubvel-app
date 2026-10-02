import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'expo-router';
import { AdBanner } from '../../components/AdBanner';
import axios from 'axios';

interface Group {
  id: string;
  name: string;
}

interface GroupClaim {
  claim_id: string;
  group_id: string;
  group_name: string;
  member_name: string;
  amount: number | null;
  reason: string | null;
  status: string;
  submitted_at: string | null;
  scheduled_claim_date: string | null;
  actual_amount_paid: number | null;
  rejection_reason: string | null;
}

export default function TreasurerClaimsScreen() {
  const { user, token } = useAuth();
  const router = useRouter();
  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [claims, setClaims] = useState<GroupClaim[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [claimsError, setClaimsError] = useState<string | null>(null);
  const [reviewingClaim, setReviewingClaim] = useState<string | null>(null);
  const [rejectingClaim, setRejectingClaim] = useState<GroupClaim | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const fetchGroups = async () => {
    if (!user?.id) return;

    setLoadingGroups(true);

    try {
      const response = await axios.get(
        `${API_URL}/api/treasurer/dashboard/${user.id}`
      );

      const groupList: Group[] = (response.data.clubs || []).map((group: any) => ({
        id: group.id,
        name: group.name,
      }));

      setGroups(groupList);
      setSelectedGroup(current => {
        if (current && groupList.some(group => group.id === current.id)) {
          return current;
        }
        return groupList[0] || null;
      });
    } catch (error) {
      console.error('Error fetching groups for claims:', error);
      setGroups([]);
      setSelectedGroup(null);
    } finally {
      setLoadingGroups(false);
    }
  };

  const fetchClaims = async (groupId: string) => {
    if (!token) return;

    setClaimsLoading(true);
    setClaimsError(null);

    try {
      const response = await axios.get(
        `${API_URL}/api/treasurer/groups/${groupId}/claims`,
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 15000,
        }
      );

      if (!response.data || !Array.isArray(response.data.claims)) {
        throw new Error('Invalid claims response');
      }

      setClaims(response.data.claims);
    } catch (err: any) {
      console.error('Error fetching claims:', err);
      setClaims([]);
      setClaimsError(
        err.response?.status === 403
          ? 'You are not authorized to review claims for this group.'
          : 'Unable to load claims. Please try again.'
      );
    } finally {
      setClaimsLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, [user?.id]);

  useEffect(() => {
    if (selectedGroup?.id && token) {
      fetchClaims(selectedGroup.id);
    } else {
      setClaims([]);
    }
  }, [selectedGroup?.id, token]);

  const reviewClaim = async (
    claim: GroupClaim,
    action: 'approve' | 'reject',
    reason?: string
  ) => {
    if (!selectedGroup || !token || reviewingClaim) return;

    setReviewingClaim(claim.claim_id);

    try {
      await axios.post(
        `${API_URL}/api/treasurer/groups/${selectedGroup.id}/claims/${claim.claim_id}/review`,
        {
          action,
          rejection_reason: action === 'reject' ? reason : null,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 15000,
        }
      );

      await fetchClaims(selectedGroup.id);

      Alert.alert(
        action === 'approve' ? 'Claim Approved' : 'Claim Rejected',
        action === 'approve'
          ? 'The claim has been approved. No payment has been recorded.'
          : 'The claim has been rejected.'
      );
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      Alert.alert(
        'Unable to Review Claim',
        typeof detail === 'string'
          ? detail
          : 'The claim could not be reviewed. Please try again.'
      );
    } finally {
      setReviewingClaim(null);
    }
  };

  const handleApproveClaim = (claim: GroupClaim) => {
    Alert.alert(
      'Approve Claim',
      `Approve ${claim.member_name}'s claim${
        claim.amount == null ? '' : ` for R${claim.amount.toLocaleString()}`
      }? This does not mark the claim as paid.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: () => reviewClaim(claim, 'approve'),
        },
      ]
    );
  };

  const handleRejectClaim = (claim: GroupClaim) => {
    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Reject Claim',
        'Enter the reason for rejecting this claim.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Reject',
            style: 'destructive',
            onPress: (value?: string) => {
              const reason = value?.trim();
              if (!reason) {
                Alert.alert('Reason Required', 'Please provide a reason for rejecting the claim.');
                return;
              }
              reviewClaim(claim, 'reject', reason);
            },
          },
        ],
        'plain-text'
      );
      return;
    }

    setRejectingClaim(claim);
    setRejectionReason('');
  };

  const confirmAndroidRejection = async () => {
    const reason = rejectionReason.trim();

    if (!rejectingClaim || !reason) {
      Alert.alert('Reason Required', 'Please provide a reason for rejecting the claim.');
      return;
    }

    const claim = rejectingClaim;
    setRejectingClaim(null);
    setRejectionReason('');
    await reviewClaim(claim, 'reject', reason);
  };

  const statusLabel = (status: string) => {
    if (status === 'pending_review') return 'Pending Review';
    if (status === 'approved') return 'Approved';
    if (status === 'rejected') return 'Rejected';
    return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Claims Management</Text>

        <TouchableOpacity
          onPress={() => router.push('/(treasurer)/profile')}
          style={styles.profileButton}
        >
          {user?.profile_photo ? (
            <Image source={{ uri: user.profile_photo }} style={styles.profileImage} />
          ) : (
            <View style={styles.profilePlaceholder}>
              <Ionicons name="person" size={20} color={Colors.white} />
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        {loadingGroups ? (
          <View style={styles.emptyState}>
            <ActivityIndicator color={Colors.accent} />
            <Text style={styles.emptySubtitle}>Loading groups...</Text>
          </View>
        ) : groups.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={64} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No Groups Yet</Text>
            <Text style={styles.emptySubtitle}>
              Claims will appear here once you have a Group with members.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.selectorLabel}>Group</Text>
            <TouchableOpacity
              style={styles.groupSelector}
              onPress={() => setShowGroupPicker(!showGroupPicker)}
            >
              <Text style={styles.groupSelectorText}>
                {selectedGroup?.name || 'Select a Group'}
              </Text>
              <Ionicons name="chevron-down" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>

            {showGroupPicker && (
              <View style={styles.groupPickerDropdown}>
                {groups.map(group => (
                  <TouchableOpacity
                    key={group.id}
                    style={[
                      styles.groupPickerItem,
                      selectedGroup?.id === group.id && styles.groupPickerItemSelected,
                    ]}
                    onPress={() => {
                      setSelectedGroup(group);
                      setShowGroupPicker(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.groupPickerItemText,
                        selectedGroup?.id === group.id && styles.groupPickerItemTextSelected,
                      ]}
                    >
                      {group.name}
                    </Text>
                    {selectedGroup?.id === group.id && (
                      <Ionicons name="checkmark" size={20} color={Colors.mediumGreen} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {claimsLoading ? (
              <View style={styles.emptyState}>
                <ActivityIndicator color={Colors.accent} />
                <Text style={styles.emptySubtitle}>Loading claims...</Text>
              </View>
            ) : claimsError ? (
              <View style={styles.emptyState}>
                <Ionicons name="alert-circle-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>Unable to load claims</Text>
                <Text style={styles.emptySubtitle}>{claimsError}</Text>
                {selectedGroup && (
                  <TouchableOpacity
                    style={styles.retryButton}
                    onPress={() => fetchClaims(selectedGroup.id)}
                  >
                    <Text style={styles.retryButtonText}>Retry</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : claims.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No claims yet</Text>
                <Text style={styles.emptySubtitle}>
                  Claims submitted by members of this Group will appear here.
                </Text>
              </View>
            ) : (
              <View style={styles.claimsList}>
                {claims.map(claim => {
                  const pending = claim.status === 'pending_review';

                  return (
                    <View key={claim.claim_id} style={styles.claimCard}>
                      <View style={styles.claimHeader}>
                        <Ionicons
                          name="document-text-outline"
                          size={28}
                          color={Colors.accent}
                        />
                        <View style={styles.claimInfo}>
                          <Text style={styles.claimTitle}>
                            {statusLabel(claim.status)}
                          </Text>
                          <Text style={styles.claimAmount}>
                            {claim.amount == null
                              ? 'Amount unavailable'
                              : `R${claim.amount.toLocaleString()}`}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.claimDetail}>
                        <Text style={styles.claimLabel}>Member</Text>
                        <Text style={styles.claimValue}>{claim.member_name}</Text>
                      </View>

                      {claim.reason ? (
                        <View style={styles.claimDetail}>
                          <Text style={styles.claimLabel}>Reason</Text>
                          <Text style={styles.claimValue}>{claim.reason}</Text>
                        </View>
                      ) : null}

                      {claim.submitted_at ? (
                        <Text style={styles.claimDate}>
                          Submitted {new Date(claim.submitted_at).toLocaleDateString()}
                        </Text>
                      ) : null}

                      {claim.status === 'rejected' && claim.rejection_reason ? (
                        <Text style={styles.claimDate}>
                          Rejection reason: {claim.rejection_reason}
                        </Text>
                      ) : null}

                      {pending ? (
                        <View style={styles.claimActions}>
                          <TouchableOpacity
                            style={styles.rejectButton}
                            disabled={reviewingClaim === claim.claim_id}
                            onPress={() => handleRejectClaim(claim)}
                          >
                            <Text style={styles.rejectButtonText}>Reject</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.approveButton}
                            disabled={reviewingClaim === claim.claim_id}
                            onPress={() => handleApproveClaim(claim)}
                          >
                            {reviewingClaim === claim.claim_id ? (
                              <ActivityIndicator color={Colors.white} />
                            ) : (
                              <Text style={styles.approveButtonText}>Approve</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}

            <AdBanner size="banner" />
          </>
        )}
      </ScrollView>

      <Modal
        visible={rejectingClaim !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setRejectingClaim(null);
          setRejectionReason('');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Reject Claim</Text>
            <Text style={styles.modalDescription}>
              Enter the reason for rejecting this claim.
            </Text>

            <TextInput
              style={styles.reasonInput}
              value={rejectionReason}
              onChangeText={setRejectionReason}
              placeholder="Reason for rejection"
              multiline
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setRejectingClaim(null);
                  setRejectionReason('');
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalRejectButton}
                onPress={confirmAndroidRejection}
              >
                <Text style={styles.modalRejectText}>Reject</Text>
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
  header: {
    backgroundColor: Colors.mediumGreen,
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.white,
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
  contentContainer: {
    padding: 24,
    paddingBottom: 40,
  },
  selectorLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  groupSelector: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  groupSelectorText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  groupPickerDropdown: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 12,
    marginTop: 8,
    overflow: 'hidden',
  },
  groupPickerItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.cardBorder,
  },
  groupPickerItemSelected: {
    backgroundColor: Colors.lightBackground,
  },
  groupPickerItemText: {
    fontSize: 15,
    color: Colors.textPrimary,
  },
  groupPickerItemTextSelected: {
    fontWeight: '700',
    color: Colors.mediumGreen,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryButtonText: {
    color: Colors.white,
    fontWeight: '700',
  },
  claimsList: {
    marginTop: 20,
    gap: 12,
  },
  claimCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  claimHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  claimInfo: {
    marginLeft: 12,
    flex: 1,
  },
  claimTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  claimAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 2,
  },
  claimDetail: {
    marginTop: 8,
  },
  claimLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  claimValue: {
    fontSize: 15,
    color: Colors.textPrimary,
  },
  claimDate: {
    marginTop: 10,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  claimActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  rejectButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.statusLate,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectButtonText: {
    color: Colors.statusLate,
    fontWeight: '700',
  },
  approveButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveButtonText: {
    color: Colors.white,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  modalDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 8,
  },
  reasonInput: {
    minHeight: 100,
    marginTop: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 12,
    padding: 12,
    textAlignVertical: 'top',
    color: Colors.textPrimary,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalCancelButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  modalRejectButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: Colors.statusLate,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalRejectText: {
    color: Colors.white,
    fontWeight: '700',
  },
});
