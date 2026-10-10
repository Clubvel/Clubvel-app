import ClubSummary from '../../components/ClubSummary';
import { ClaimPaymentRecord } from '../../components/ClaimPaymentRecord';
import { ClaimPayoutDate } from '../../components/ClaimPayoutDate';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Alert, Modal, TextInput, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import axios from 'axios';
import { addPaymentReminder } from '../../services/paymentReminder';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

interface Member {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  membership_status: string;
  role_in_group: 'member' | 'admin' | 'treasurer';
  status: string;
  amount_paid: number;
  amount_due: number | null;
  has_proof: boolean;
  contribution_id: string | null;
  proof_version?: string | null;
  proof_review_status?: 'pending' | 'declined' | 'approved' | null;
  proof_decline_reason?: string | null;
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
  actual_payment_date?: string | null;
  rejection_reason: string | null;
}

interface ClubData {
  id: string;
  name: string;
  type: string;
  monthly_contribution: number;
  due_date: number;
  bank_name: string;
  bank_account: string;
  member_count: number;
  collected: number;
  expected: number;
  members: Member[];
  contributions?: Member[];
}

export default function ClubDetailScreen() {
  const { id, name, from } = useLocalSearchParams<{ id: string; name: string; from?: string }>();
  const { user, token } = useAuth();
  const router = useRouter();

  const handleBack = () => {
    if (from === 'member') {
      router.replace('/(member)/home');
      return;
    }
    router.back();
  };
  const insets = useSafeAreaInsets();
  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

  const [showClubSummary, setShowClubSummary] = useState(false);
  const [clubData, setClubData] = useState<ClubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'members' | 'payments' | 'claims' | 'settings'>('members');
  const [error, setError] = useState<string | null>(null);
  const [proofImage, setProofImage] = useState<string | null>(null);
  const [decliningProof, setDecliningProof] = useState<Member | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [reviewingProof, setReviewingProof] = useState(false);
  const clubFetchInProgress = useRef<string | null>(null);
  const clubFetchSequence = useRef(0);
  const latestClubContext = useRef(`${id}:${user?.id}:${token}`);
  latestClubContext.current = `${id}:${user?.id}:${token}`;
  const claimsSequence = useRef(0);
  const reminderInFlight = useRef(false);
  const adminInvitationInFlight = useRef(false);
  
  const [claims, setClaims] = useState<GroupClaim[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [claimsError, setClaimsError] = useState<string | null>(null);
  const [reviewingClaim, setReviewingClaim] = useState<string | null>(null);
  const [rejectingClaim, setRejectingClaim] = useState<GroupClaim | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Admin modals state
  const [showEditNameModal, setShowEditNameModal] = useState(false);
  const [showDeleteClubModal, setShowDeleteClubModal] = useState(false);
  const [showInviteAdminModal, setShowInviteAdminModal] = useState(false);
  const [newClubName, setNewClubName] = useState('');
  const [inviteAdminPhone, setInviteAdminPhone] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchClubData = useCallback(async (force = false) => {
    if (!id || !user?.id || !token) { setClubData(null); setLoading(false); setError('Please sign in to open this club.'); return; }
    const requestKey = `${id}:${user?.id}:${token}`;
    if (!force && clubFetchInProgress.current === requestKey) return;
    clubFetchInProgress.current = requestKey;
    const sequence = ++clubFetchSequence.current;
    setError(null);
    try {
      // The bearer session authenticates the supplied treasurer ID.
      const response = await axios.get(`${API_URL}/api/treasurer/club/${id}?treasurer_id=${user?.id}`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 15000,
      });
      const data = response.data;
      if (!data || data.id !== id || typeof data.name !== 'string' || !Array.isArray(data.members) ||
          !Number.isFinite(data.collected) || !Number.isFinite(data.expected) ||
          data.members.some((member: any) => !member || typeof member.name !== 'string')) throw new Error('Invalid club response');
      if (sequence === clubFetchSequence.current && latestClubContext.current === requestKey) setClubData(data);
    } catch (err: any) {
      if (sequence !== clubFetchSequence.current || latestClubContext.current !== requestKey) return;
      setClubData(null);
      setClaims([]);
      console.error('Error fetching club data:', err);
      if (err.response?.status === 403) {
        setError('Access denied: You are not the treasurer of this group');
      } else {
        setError('Failed to load club details');
      }
    } finally {
      if (sequence === clubFetchSequence.current && clubFetchInProgress.current === requestKey) {
        setLoading(false);
        setRefreshing(false);
        clubFetchInProgress.current = null;
      }
    }
  }, [API_URL, id, user?.id, token]);

  useFocusEffect(useCallback(() => {
    void fetchClubData();
  }, [fetchClubData]));

  const fetchClaims = async () => {
    if (!id || !token) return;

    const context = `${id}:${user?.id}:${token}`;
    const sequence = ++claimsSequence.current;
    setClaimsLoading(true);
    setClaimsError(null);

    try {
      const response = await axios.get(
        `${API_URL}/api/treasurer/groups/${id}/claims`,
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 15000,
        }
      );

      if (!response.data || !Array.isArray(response.data.claims)) {
        throw new Error('Invalid claims response');
      }

      if (sequence !== claimsSequence.current || latestClubContext.current !== context) return;
      setClaims(response.data.claims);
    } catch (err: any) {
      if (sequence !== claimsSequence.current || latestClubContext.current !== context) return;
      setClaims([]);
      console.error('Error fetching claims:', err);
      setClaimsError(
        err.response?.status === 403
          ? 'You are not authorized to review claims for this group.'
          : 'Unable to load claims. Please try again.'
      );
    } finally {
      if (sequence === claimsSequence.current && latestClubContext.current === context) setClaimsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'claims' && id && token) {
      fetchClaims();
    }
  }, [activeTab, id, token]);

  const reviewClaim = async (
    claim: GroupClaim,
    action: 'approve' | 'reject',
    rejectionReason?: string
  ) => {
    if (!id || !token || reviewingClaim) return;

    setReviewingClaim(claim.claim_id);

    try {
      await axios.post(
        `${API_URL}/api/treasurer/groups/${id}/claims/${claim.claim_id}/review`,
        {
          action,
          rejection_reason: action === 'reject' ? rejectionReason : null,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 15000,
        }
      );

      await fetchClaims();

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
                Alert.alert(
                  'Reason Required',
                  'Please provide a reason for rejecting the claim.'
                );
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

  const onRefresh = () => {
    setRefreshing(true);
    fetchClubData();
    if (activeTab === 'claims') {
      fetchClaims();
    }
  };

  const handleViewProof = async (contributionId: string) => {
    try {
      const response = await axios.get(`${API_URL}/api/contributions/${contributionId}/proof`, {
        params: { user_id: user?.id }, headers: { Authorization: `Bearer ${token}` }
      });
      const proof = response.data.proof_image;
      if (response.data.proof_mime_type === 'application/pdf' || proof.startsWith('data:application/pdf')) {
        if (!await Sharing.isAvailableAsync()) {
          Alert.alert('Error', 'Opening PDF files is not available on this device.');
          return;
        }
        const fileUri = FileSystem.documentDirectory + `proof_${Date.now()}.pdf`;
        await FileSystem.writeAsStringAsync(fileUri, proof.replace(/^data:[^;]+;base64,/, ''), {
          encoding: FileSystem.EncodingType.Base64
        });
        await Sharing.shareAsync(fileUri, { mimeType: 'application/pdf', dialogTitle: 'Open Proof of Payment' });
        return;
      }
      setProofImage(proof);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to load proof of payment');
    }
  };

  const handleDeclineProof = async () => {
    if (!decliningProof?.contribution_id || !token || reviewingProof) return;
    setReviewingProof(true);
    try {
      await axios.post(`${API_URL}/api/contributions/${decliningProof.contribution_id}/decline-proof`, {
        proof_version: decliningProof.proof_version,
        reason: declineReason.trim() || null
      }, { headers: { Authorization: `Bearer ${token}` } });
      setDecliningProof(null);
      setDeclineReason('');
      await fetchClubData(true);
      Alert.alert('Proof Declined', 'The member can submit a replacement proof.');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to decline proof');
    } finally {
      setReviewingProof(false);
    }
  };

  const handleConfirmPayment = (contributionId: string | null, memberName: string, proofVersion?: string | null) => {
    if (!contributionId) {
      Alert.alert('Error', 'No contribution available to confirm');
      return;
    }
    Alert.alert(
      'Approve Payment',
      `Approve payment from ${memberName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              await axios.post(`${API_URL}/api/treasurer/confirm-payment`, {
                contribution_id: contributionId,
                proof_version: proofVersion,
                notes: null,
                treasurer_id: user?.id
              }, { headers: { Authorization: `Bearer ${token}` } });
              Alert.alert('Success', 'Payment confirmed!');
              fetchClubData(true);
            } catch (err: any) {
              if (err.response?.status === 403) {
                Alert.alert('Access Denied', 'You are not authorized to confirm payments for this group');
              } else {
                Alert.alert('Error', err.response?.data?.detail || 'Failed to confirm payment');
                if (err.response?.status === 409) void fetchClubData(true);
              }
            }
          }
        }
      ]
    );
  };

  const handleRemindMember = (member: Member) => {
    if (!token || !member.contribution_id || member.user_id === user?.id) return;
    Alert.alert('Add Payment Reminder', `Add a payment reminder to ${member.name}'s Alerts?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Add Reminder', onPress: async () => {
        if (reminderInFlight.current) return;
        reminderInFlight.current = true;
        try {
          await addPaymentReminder(API_URL, token, member.contribution_id!);
        } finally { reminderInFlight.current = false; }
      } },
    ]);
  };

  // Admin Actions
  const handleEditClubName = async () => {
    if (!newClubName.trim()) {
      Alert.alert('Error', 'Please enter a new club name');
      return;
    }
    
    setActionLoading(true);
    try {
      await axios.put(`${API_URL}/api/groups/update`, {
        group_id: id,
        admin_user_id: user?.id,
        group_name: newClubName.trim()
      }, { headers: { Authorization: `Bearer ${token}` } });
      Alert.alert('Success', 'Club name updated successfully!');
      setShowEditNameModal(false);
      setNewClubName('');
      fetchClubData();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to update club name');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteClub = async () => {
    if (deleteConfirmation !== 'DELETE') {
      Alert.alert('Error', 'Please type DELETE to confirm');
      return;
    }
    
    setActionLoading(true);
    try {
      await axios.delete(`${API_URL}/api/groups/delete`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          group_id: id,
          admin_user_id: user?.id,
          confirmation: 'DELETE'
        }
      });
      Alert.alert('Success', 'Club deleted successfully!', [
        { text: 'OK', onPress: () => router.replace('/(treasurer)/dashboard') }
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to delete club');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteMember = (memberUserId: string, memberName: string) => {
    Alert.alert(
      'Remove Member',
      `Are you sure you want to remove ${memberName} from this club? They will be notified.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${API_URL}/api/groups/member/delete`, {
                headers: { Authorization: `Bearer ${token}` },
                data: {
                  group_id: id,
                  member_user_id: memberUserId,
                  admin_user_id: user?.id,
                  reason: 'Removed by admin'
                }
              });
              Alert.alert('Success', `${memberName} has been removed from the club`);
              fetchClubData();
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to remove member');
            }
          }
        }
      ]
    );
  };

  const handleInviteAdmin = async () => {
    if (adminInvitationInFlight.current) return;
    if (!inviteAdminPhone.trim() || !token) {
      Alert.alert('Error', 'Enter a phone number and sign in before inviting an Admin.');
      return;
    }
    adminInvitationInFlight.current = true;
    setActionLoading(true);
    const payload = { group_id: id, new_admin_phone: inviteAdminPhone.trim() };
    const options = { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 };
    try {
      const { data } = await axios.post(`${API_URL}/api/groups/admin/invite`, payload, options);
      const sendSMS = async () => {
        try {
          const response = await axios.post(`${API_URL}/api/groups/admin/invite`, { ...payload, channel: 'sms' }, options);
          const status = response.data.delivery_status;
          Alert.alert(status === 'submitted' ? 'SMS submitted' : 'Invitation saved',
            status === 'submitted' ? 'The invitation was submitted to the SMS provider. The recipient must accept in Clubvel.' :
            status === 'mock' ? 'No SMS was sent in test mode. The invitation remains pending.' : 'SMS could not be sent. The invitation remains pending.');
        } catch {
          Alert.alert('SMS could not be sent', 'The Clubvel invitation remains pending.');
        }
      };
      Alert.alert('Admin invitation created', 'The recipient must accept in My Clubvel → Join Group before becoming an Admin.', [
        { text: 'Done', style: 'cancel' },
        { text: 'WhatsApp', onPress: async () => {
          try {
            const digits = data.phone_number.replace(/^\+/, '');
            await Linking.openURL(`https://wa.me/${digits}?text=${encodeURIComponent(data.invitation_message)}`);
            Alert.alert('WhatsApp opened', 'Press Send in WhatsApp. The invitation remains pending until accepted in Clubvel.');
          } catch { Alert.alert('WhatsApp could not be opened', 'The invitation remains pending. You can use SMS instead.'); }
        } },
        { text: 'SMS', onPress: sendSMS },
      ]);
      setShowInviteAdminModal(false);
      setInviteAdminPhone('');
    } catch (error: any) {
      Alert.alert('Could not create Admin invitation', error.response?.data?.detail || 'Please try again.');
    } finally {
      adminInvitationInFlight.current = false;
      setActionLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return Colors.statusPaid;
      case 'proof_uploaded': return Colors.gold;
      case 'proof_declined': return Colors.statusLate;
      case 'late': return Colors.statusLate;
      case 'active': return Colors.accent;
      default: return Colors.textMuted;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'confirmed': return 'Paid';
      case 'proof_uploaded': return 'Pending Review';
      case 'proof_declined': return 'Proof Declined';
      case 'late': return 'Late';
      case 'active': return 'Active';
      default: return 'Pending';
    }
  };

  if (!clubData || clubData.id !== id) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity onPress={handleBack} style={styles.headerBackButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.white} />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>{name || 'Club'}</Text>
          </View>
        </View>
        <View style={styles.loadingContainer}>
          {loading ? <ActivityIndicator size="large" color={Colors.mediumGreen} /> : (
            <>
              <Text style={styles.errorText}>{error || 'Club not found'}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={() => void fetchClubData()}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={handleBack} style={styles.headerBackButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.white} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>{clubData.name}</Text>
          <Text style={styles.headerSubtitle}>{clubData.member_count} {clubData.member_count === 1 ? 'member' : 'members'}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {error && <View style={styles.summaryCard}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => void fetchClubData()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>}
      {/* Summary Card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>R{clubData.collected.toFixed(2)}</Text>
          <Text style={styles.summaryLabel}>Collected</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: '#16A34A' }]}>R{clubData.expected.toFixed(2)}</Text>
          <Text style={styles.summaryLabel}>Expected</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: Colors.accent }]}>
            {clubData.expected > 0 ? Math.round((clubData.collected / clubData.expected) * 100) : 0}%
          </Text>
          <Text style={styles.summaryLabel}>Progress</Text>
        </View>
      </View>

      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open Club Summary" style={styles.retryButton} onPress={() => setShowClubSummary(true)}>
        <Text style={styles.retryButtonText}>Club Summary</Text>
      </TouchableOpacity>
      {showClubSummary && <ClubSummary clubId={id} token={token} onClose={() => setShowClubSummary(false)} />}

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'members' && styles.activeTab]}
          onPress={() => setActiveTab('members')}
        >
          <Ionicons name="people" size={20} color={activeTab === 'members' ? Colors.accent : Colors.textMuted} />
          <Text style={[styles.tabText, activeTab === 'members' && styles.activeTabText]}>Members</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'payments' && styles.activeTab]}
          onPress={() => {
            if (activeTab !== 'payments') {
              setActiveTab('payments');
              void fetchClubData();
            }
          }}
        >
          <Ionicons name="cash" size={20} color={activeTab === 'payments' ? Colors.accent : Colors.textMuted} />
          <Text style={[styles.tabText, activeTab === 'payments' && styles.activeTabText]}>Payments</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'claims' && styles.activeTab]}
          onPress={() => setActiveTab('claims')}
        >
          <Ionicons name="trophy" size={20} color={activeTab === 'claims' ? Colors.accent : Colors.textMuted} />
          <Text style={[styles.tabText, activeTab === 'claims' && styles.activeTabText]}>Claims</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'settings' && styles.activeTab]}
          onPress={() => setActiveTab('settings')}
        >
          <Ionicons name="settings" size={20} color={activeTab === 'settings' ? Colors.accent : Colors.textMuted} />
          <Text style={[styles.tabText, activeTab === 'settings' && styles.activeTabText]}>Settings</Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {activeTab === 'members' && (
          <View style={styles.section}>
            {clubData.members.map((member) => (
              <View key={member.id} style={styles.memberCard}>
                <View style={styles.memberInfo}>
                  <View style={styles.memberAvatar}>
                    <Text style={styles.memberAvatarText}>{member.name.charAt(0)}</Text>
                  </View>
                  <View style={styles.memberDetails}>
                    <Text style={styles.memberName}>{member.name}</Text>
                    <Text style={styles.memberPhone}>{member.phone}</Text>
                  </View>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: Colors.mediumGreen + '20' }]}>
                  <Text style={[styles.statusText, { color: getStatusColor(member.membership_status) }]}>
                    {getStatusLabel(member.membership_status)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {activeTab === 'payments' && (
          <View style={styles.section}>
            {(clubData.contributions ?? clubData.members).map((member) => (
              <View key={member.contribution_id ?? member.id} style={styles.paymentCard}>
                <View style={styles.paymentHeader}>
                  <View style={styles.memberInfo}>
                    <View style={[styles.memberAvatar, { width: 36, height: 36 }]}>
                      <Text style={[styles.memberAvatarText, { fontSize: 14 }]}>{member.name.charAt(0)}</Text>
                    </View>
                    <View style={styles.memberDetails}>
                      <Text style={styles.memberName}>{member.name}</Text>
                      <Text style={styles.paymentAmount}>
                        {member.amount_due == null
                          ? `R${member.amount_paid.toFixed(2)} / Not recorded`
                          : `R${member.amount_paid.toFixed(2)} / R${member.amount_due.toFixed(2)}`}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(member.proof_review_status === 'declined' ? 'proof_declined' : member.status) + '20' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(member.proof_review_status === 'declined' ? 'proof_declined' : member.status) }]}>
                      {getStatusLabel(member.proof_review_status === 'declined' ? 'proof_declined' : member.status)}
                    </Text>
                  </View>
                </View>
                
                {member.status !== 'confirmed' && (
                  <View style={styles.paymentActions}>
                    {(member.has_proof || member.status === 'proof_uploaded') && member.contribution_id ? (
                      <>
                        <TouchableOpacity
                          style={[styles.remindButton, { marginBottom: 8 }]}
                          onPress={() => handleViewProof(member.contribution_id!)}
                        >
                          <Ionicons name="image-outline" size={18} color={Colors.gold} />
                          <Text style={styles.remindButtonText}>View Proof</Text>
                        </TouchableOpacity>
                        {member.status === 'proof_uploaded' && member.proof_review_status !== 'declined' && (
                          <>
                            <TouchableOpacity
                              style={styles.confirmButton}
                              onPress={() => handleConfirmPayment(member.contribution_id, member.name, member.proof_version)}
                            >
                              <Ionicons name="checkmark-circle" size={18} color={Colors.white} />
                              <Text style={styles.confirmButtonText}>Approve Payment</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.remindButton, { marginTop: 8 }]}
                              onPress={() => { setDecliningProof(member); setDeclineReason(''); }}
                            >
                              <Ionicons name="close-circle-outline" size={18} color={Colors.statusLate} />
                              <Text style={[styles.remindButtonText, { color: Colors.statusLate }]}>Decline Proof</Text>
                            </TouchableOpacity>
                          </>
                        )}
                        {member.proof_review_status === 'declined' && member.proof_decline_reason && (
                          <Text style={styles.paymentAmount}>{member.proof_decline_reason}</Text>
                        )}
                      </>
                    ) : null}
                    {member.user_id && member.user_id !== user?.id && member.contribution_id &&
                      ['pending', 'due', 'late'].includes(member.status) &&
                      (!member.has_proof || member.proof_review_status === 'declined') &&
                      member.amount_due != null && member.amount_due > member.amount_paid && (
                      <TouchableOpacity
                        style={styles.remindButton}
                        onPress={() => handleRemindMember(member)}
                      >
                        <Ionicons name="notifications" size={18} color={Colors.gold} />
                        <Text style={styles.remindButtonText}>Send Reminder</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {activeTab === 'claims' && (
          <View style={styles.section}>
            {claimsLoading && claims.length === 0 ? (
              <View style={styles.emptyState}>
                <ActivityIndicator color={Colors.accent} />
                <Text style={styles.emptyStateSubtext}>Loading claims...</Text>
              </View>
            ) : claimsError ? (
              <View style={styles.emptyState}>
                <Ionicons name="alert-circle-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyStateText}>Unable to load claims</Text>
                <Text style={styles.emptyStateSubtext}>{claimsError}</Text>
                <TouchableOpacity style={styles.confirmButton} onPress={fetchClaims}>
                  <Text style={styles.confirmButtonText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : claims.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyStateText}>No claims yet</Text>
                <Text style={styles.emptyStateSubtext}>
                  Claims submitted by members of this group will appear here.
                </Text>
              </View>
            ) : (
              claims.map(claim => {
                const pending = claim.status === 'pending_review';
                const statusLabel =
                  claim.status === 'pending_review'
                    ? 'Pending Review'
                    : claim.status === 'approved'
                      ? 'Approved'
                      : claim.status === 'rejected'
                        ? 'Rejected'
                        : claim.status.charAt(0).toUpperCase() + claim.status.slice(1);

                return (
                  <View key={claim.claim_id} style={styles.claimCard}>
                    <View style={styles.claimHeader}>
                      <Ionicons
                        name="document-text-outline"
                        size={28}
                        color={Colors.accent}
                      />
                      <View style={styles.claimInfo}>
                        <Text style={styles.claimTitle}>{statusLabel}</Text>
                        <Text style={styles.claimAmount}>
                          {claim.amount == null
                            ? 'Amount unavailable'
                            : `R${claim.amount.toLocaleString()}`}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.claimRecipient}>
                      <Text style={styles.claimLabel}>Member</Text>
                      <Text style={styles.claimName}>{claim.member_name}</Text>
                    </View>

                    {claim.reason ? (
                      <View style={styles.claimRecipient}>
                        <Text style={styles.claimLabel}>Reason</Text>
                        <Text style={styles.claimName}>{claim.reason}</Text>
                      </View>
                    ) : null}

                    {claim.submitted_at ? (
                      <Text style={styles.claimDate}>
                        Submitted {new Date(claim.submitted_at).toLocaleDateString()}
                      </Text>
                    ) : null}

                    <ClaimPayoutDate
                      groupId={String(id)}
                      claimId={claim.claim_id}
                      status={claim.status}
                      scheduledDate={claim.scheduled_claim_date}
                      token={token}
                      onSaved={fetchClaims}
                    />

                    <ClaimPaymentRecord
                      groupId={String(id)}
                      claimId={claim.claim_id}
                      memberName={claim.member_name}
                      status={claim.status}
                      approvedAmount={claim.amount}
                      actualAmountPaid={claim.actual_amount_paid}
                      actualPaymentDate={claim.actual_payment_date}
                      scheduledDate={claim.scheduled_claim_date}
                      token={token}
                      onRecorded={fetchClaims}
                    />

                    {claim.status === 'rejected' && claim.rejection_reason ? (
                      <Text style={styles.claimDate}>
                        Rejection reason: {claim.rejection_reason}
                      </Text>
                    ) : null}

                    {pending ? (
                      <View style={styles.claimActions}>
                        <TouchableOpacity
                          style={styles.rejectClaimButton}
                          disabled={reviewingClaim === claim.claim_id}
                          onPress={() => handleRejectClaim(claim)}
                        >
                          <Text style={styles.rejectClaimButtonText}>Reject</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.approveClaimButton}
                          disabled={reviewingClaim === claim.claim_id}
                          onPress={() => handleApproveClaim(claim)}
                        >
                          {reviewingClaim === claim.claim_id ? (
                            <ActivityIndicator color={Colors.white} />
                          ) : (
                            <Text style={styles.approveClaimButtonText}>Approve</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>
        )}

        {activeTab === 'settings' && (
          <View style={styles.section}>
            <Text style={styles.settingsTitle}>Club Settings</Text>
            
            {/* Edit Club Name */}
            <TouchableOpacity 
              style={styles.settingsItem}
              onPress={() => {
                setNewClubName(clubData.name);
                setShowEditNameModal(true);
              }}
            >
              <View style={styles.settingsItemLeft}>
                <Ionicons name="pencil" size={22} color={Colors.mediumGreen} />
                <Text style={styles.settingsItemText}>Edit Club Name</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
            </TouchableOpacity>

            {/* Invite Admin */}
            <TouchableOpacity 
              style={styles.settingsItem}
              onPress={() => setShowInviteAdminModal(true)}
            >
              <View style={styles.settingsItemLeft}>
                <Ionicons name="person-add" size={22} color={Colors.mediumGreen} />
                <Text style={styles.settingsItemText}>Invite Admin (Max 5)</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
            </TouchableOpacity>

            <Text style={[styles.settingsTitle, { marginTop: 24 }]}>Members Management</Text>
            
            {/* Member List with Delete Option */}
            {clubData.members.map((member) => (
              <View key={member.id} style={styles.memberManageCard}>
                <View style={styles.memberInfo}>
                  <View style={styles.memberAvatar}>
                    <Text style={styles.memberAvatarText}>{member.name.charAt(0)}</Text>
                  </View>
                  <View style={styles.memberDetails}>
                    <Text style={styles.memberName}>{member.name}</Text>
                    <Text style={styles.memberPhone}>{member.phone}</Text>
                  </View>
                </View>
                <TouchableOpacity 
                  style={styles.deleteMemberBtn}
                  onPress={() => handleDeleteMember(member.user_id, member.name)}
                >
                  <Ionicons name="trash-outline" size={20} color={Colors.statusLate} />
                </TouchableOpacity>
              </View>
            ))}

            <Text style={[styles.settingsTitle, { marginTop: 24, color: Colors.statusLate }]}>Danger Zone</Text>
            
            {/* Delete Club */}
            <TouchableOpacity 
              style={[styles.settingsItem, { borderColor: Colors.statusLate }]}
              onPress={() => setShowDeleteClubModal(true)}
            >
              <View style={styles.settingsItemLeft}>
                <Ionicons name="trash" size={22} color={Colors.statusLate} />
                <Text style={[styles.settingsItemText, { color: Colors.statusLate }]}>Delete Club</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.statusLate} />
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      <Modal visible={proofImage !== null} transparent animationType="fade" onRequestClose={() => setProofImage(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Proof of Payment</Text>
            {proofImage && <Image source={{ uri: proofImage }} style={{ width: '100%', height: 400 }} resizeMode="contain" />}
            <TouchableOpacity style={[styles.modalCancelBtn, { flex: 0 }]} onPress={() => setProofImage(null)}>
              <Text style={styles.modalCancelText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={decliningProof !== null} transparent animationType="fade" onRequestClose={() => {
        if (!reviewingProof) setDecliningProof(null);
      }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Decline Proof</Text>
            <Text style={styles.modalSubtitle}>Decline proof from {decliningProof?.name}?</Text>
            <TextInput style={styles.modalInput} placeholder="Reason (optional)" value={declineReason}
              onChangeText={setDeclineReason} maxLength={200} editable={!reviewingProof} />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelBtn} disabled={reviewingProof} onPress={() => setDecliningProof(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} disabled={reviewingProof} onPress={handleDeclineProof}>
                <Text style={styles.modalConfirmText}>{reviewingProof ? 'Declining...' : 'Decline'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Club Name Modal */}
      <Modal visible={showEditNameModal} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Club Name</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Enter new club name"
              value={newClubName}
              onChangeText={setNewClubName}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowEditNameModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalConfirmBtn, actionLoading && { opacity: 0.6 }]} 
                onPress={handleEditClubName}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color={Colors.white} size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Reject Claim Modal - Android */}
      <Modal
        visible={!!rejectingClaim}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!reviewingClaim) {
            setRejectingClaim(null);
            setRejectionReason('');
          }
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Reject Claim</Text>
            <Text style={styles.modalSubtitle}>
              Enter the reason for rejecting this claim.
            </Text>

            <TextInput
              style={[styles.modalInput, { minHeight: 100, textAlignVertical: 'top' }]}
              placeholder="Reason for rejection"
              value={rejectionReason}
              onChangeText={setRejectionReason}
              multiline
              maxLength={1000}
              editable={!reviewingClaim}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                disabled={!!reviewingClaim}
                onPress={() => {
                  setRejectingClaim(null);
                  setRejectionReason('');
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalDeleteBtn,
                  (!!reviewingClaim || !rejectionReason.trim()) && { opacity: 0.6 },
                ]}
                disabled={!!reviewingClaim || !rejectionReason.trim()}
                onPress={async () => {
                  if (!rejectingClaim || !rejectionReason.trim()) return;

                  const claim = rejectingClaim;
                  const reason = rejectionReason.trim();

                  await reviewClaim(claim, 'reject', reason);
                  setRejectingClaim(null);
                  setRejectionReason('');
                }}
              >
                {reviewingClaim ? (
                  <ActivityIndicator color={Colors.white} size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>Reject Claim</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Invite Admin Modal */}
      <Modal visible={showInviteAdminModal} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Invite New Admin</Text>
            <Text style={styles.modalSubtitle}>Enter the phone number of the person you want to invite as an admin. They can register with this number and must accept the invitation before becoming an Admin.</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Phone number (e.g. 0712345678)"
              value={inviteAdminPhone}
              onChangeText={setInviteAdminPhone}
              keyboardType="phone-pad"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowInviteAdminModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalConfirmBtn, actionLoading && { opacity: 0.6 }]} 
                onPress={handleInviteAdmin}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color={Colors.white} size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>Invite</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Delete Club Modal */}
      <Modal visible={showDeleteClubModal} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="warning" size={48} color={Colors.statusLate} style={{ alignSelf: 'center', marginBottom: 16 }} />
            <Text style={[styles.modalTitle, { color: Colors.statusLate }]}>Delete Club?</Text>
            <Text style={styles.modalSubtitle}>This action cannot be undone. All members, contributions, and data will be permanently deleted.</Text>
            <Text style={styles.modalSubtitle}>Type DELETE to confirm:</Text>
            <TextInput
              style={[styles.modalInput, { borderColor: Colors.statusLate }]}
              placeholder="Type DELETE"
              value={deleteConfirmation}
              onChangeText={setDeleteConfirmation}
              autoCapitalize="characters"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => {
                setShowDeleteClubModal(false);
                setDeleteConfirmation('');
              }}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalDeleteBtn, actionLoading && { opacity: 0.6 }]} 
                onPress={handleDeleteClub}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color={Colors.white} size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.lightBackground,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: Colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.lightBackground,
    padding: 24,
  },
  errorText: {
    fontSize: 18,
    color: Colors.textSecondary,
    marginTop: 16,
    marginBottom: 24,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: Colors.mediumGreen,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  retryButtonText: {
    color: Colors.white,
    fontWeight: '600',
    fontSize: 16,
  },
  backButton: {
    paddingHorizontal: 32,
    paddingVertical: 12,
  },
  backButtonText: {
    color: Colors.mediumGreen,
    fontWeight: '600',
    fontSize: 16,
  },
  header: {
    backgroundColor: Colors.darkGreen,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  headerBackButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContent: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.white,
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: Colors.cardBorder,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  summaryLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 6,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: Colors.lightBackground,
  },
  tabText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '500',
    marginLeft: 4,
  },
  activeTabText: {
    color: Colors.accent,
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
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
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.mediumGreen,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberAvatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.white,
  },
  memberDetails: {
    marginLeft: 12,
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  memberPhone: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  paymentCard: {
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  paymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paymentAmount: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  paymentActions: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.mediumGreen,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  confirmButtonText: {
    color: Colors.white,
    fontWeight: '600',
    fontSize: 14,
  },
  remindButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.lightGold,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  remindButtonText: {
    color: Colors.gold,
    fontWeight: '600',
    fontSize: 14,
  },
  claimCard: {
    backgroundColor: Colors.white,
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: Colors.gold,
  },
  claimHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  claimInfo: {
    marginLeft: 16,
  },
  claimTitle: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  claimAmount: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  claimRecipient: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  claimLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  claimName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginLeft: 8,
  },
  claimActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  approveClaimButton: {
    flex: 1,
    backgroundColor: Colors.accent,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveClaimButtonText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  rejectClaimButton: {
    flex: 1,
    backgroundColor: Colors.white,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectClaimButtonText: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  claimDate: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  rotationTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  rotationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  rotationNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.lightBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rotationNumberText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  rotationName: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
    marginLeft: 12,
  },
  nextBadge: {
    backgroundColor: Colors.gold,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  nextBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: Colors.white,
  },
  // Settings styles
  settingsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  settingsItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingsItemText: {
    fontSize: 16,
    color: Colors.textPrimary,
  },
  memberManageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  deleteMemberBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(220, 53, 69, 0.1)',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 16,
    textAlign: 'center',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: Colors.lightBackground,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  modalConfirmBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: Colors.mediumGreen,
    alignItems: 'center',
  },
  modalConfirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  modalDeleteBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: Colors.statusLate,
    alignItems: 'center',
  },
});
