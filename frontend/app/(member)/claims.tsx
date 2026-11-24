import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProfilePhotoViewer from '../../components/ProfilePhotoViewer';
import ProfilePhotoFrame from '../../components/ProfilePhotoFrame';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import ClubvelSpotlight from '../../components/ClubvelSpotlight';
import { useAuth } from '../../contexts/AuthContext';
import { usePersonalClaims, PersonalClaim } from '../../hooks/usePersonalClaims';

import HomeSponsoredCard from '../../components/HomeSponsoredCard';
const statusLabel = (status: string) => {
  switch (status) {
    case 'pending_review': return 'Pending Review';
    case 'approved': return 'Approved';
    case 'rejected': return 'Rejected';
    case 'ready': return 'Ready';
    case 'processing': return 'Processing';
    case 'paid': return 'Paid';
    case 'confirmed': return 'Confirmed';
    case 'upcoming': return 'Upcoming';
    default: return status.replace(/_/g, ' ');
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'approved':
    case 'paid':
    case 'confirmed':
      return '#343A40'; // Charcoal for positive statuses
    case 'rejected':
      return '#D96540'; // Terracotta for rejected
    case 'pending_review':
    case 'processing':
      return '#D96540'; // Terracotta for pending
    default:
      return Colors.textSecondary;
  }
};

const formatDate = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString();
};

export default function ClaimsScreen() {
  const [photoExpanded, setPhotoExpanded] = React.useState(false);
  const { user, token } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { claim_id: selectedClaimId, view } = useLocalSearchParams<{ claim_id?: string; view?: string }>();
  const [showAllClaims, setShowAllClaims] = useState(false);
  const [myClaimsExpanded, setMyClaimsExpanded] = useState(false);
  const [claimsMenuExpanded, setClaimsMenuExpanded] = useState(false);
  useFocusEffect(useCallback(() => {
    if (view === 'payouts') setShowAllClaims(false);
    return () => {
      setClaimsMenuExpanded(false);
      setMyClaimsExpanded(false);
      setShowAllClaims(false);
      panelScroll.current?.scrollTo({ y: 0, animated: false });
    };
  }, [view]));
  const [activeGroups, setActiveGroups] = useState<Array<{
    id: string;
    name: string;
    status: string;
  }>>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const {
    records: claims,
    phase,
    refreshing,
    reload,
  } = usePersonalClaims(user?.id, token);

  const payoutsOnly = view === 'payouts' && !selectedClaimId && !showAllClaims;
  const payoutClaims = claims.filter(claim => claim.status === 'approved' && claim.amount != null && Math.max(claim.amount - (claim.actual_amount_paid || 0), 0) > 0);
  const visibleClaims = payoutsOnly ? payoutClaims : claims;
  const remainingPayout = payoutClaims.reduce((sum, claim) => sum + Math.max((claim.amount || 0) - (claim.actual_amount_paid || 0), 0), 0);

  const [formOpen, setFormOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resubmittedFrom, setResubmittedFrom] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const formScroll = useRef<ScrollView>(null);
  const panelScroll = useRef<ScrollView>(null);
  const reasonFocused = useRef(false);
  const submitInFlight = useRef(false);
  const removeInFlight = useRef(false);

  const loadActiveGroups = async () => {
    if (!user?.id || !token) return [];

    setGroupsLoading(true);
    try {
      const response = await axios.get(
        `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/member/dashboard/${user.id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 15000,
        }
      );

      const groups = Array.isArray(response.data?.clubs)
        ? response.data.clubs
        : [];

      setActiveGroups(groups);
      return groups;
    } finally {
      setGroupsLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id && token) {
      void loadActiveGroups().catch(() => {
        setActiveGroups([]);
      });
    }
  }, [user?.id, token]);

  const selectedGroup = useMemo(
    () => activeGroups.find(group => group.id === selectedGroupId) ?? null,
    [activeGroups, selectedGroupId]
  );

  const openForm = async () => {
    try {
      const groups = activeGroups.length ? activeGroups : await loadActiveGroups();
      if (!groups.length) {
        Alert.alert(
          'No active groups',
          'You need an active group membership before you can submit a claim.'
        );
        return;
      }
      setResubmittedFrom(null);
      setSelectedGroupId(groups.length === 1 ? groups[0].id : '');
      setFormOpen(true);
    } catch {
      Alert.alert(
        'Unable to load groups',
        'Your active group memberships could not be verified. Please try again.'
      );
    }
  };

  const closeForm = () => {
    if (submitting) return;
    setFormOpen(false);
    setSelectedGroupId('');
    setAmount('');
    setReason('');
  };

  const resubmitClaim = (claim: PersonalClaim) => {
    setSelectedGroupId(claim.group_id);
    setAmount(claim.amount == null ? '' : String(claim.amount));
    setReason(claim.reason || '');
    setResubmittedFrom(claim.claim_id);
    setFormOpen(true);
  };

  const removeClaim = (claim: PersonalClaim) => {
    Alert.alert('Remove rejected claim', 'Remove this claim from your view? Your group will retain its claim history.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        if (removeInFlight.current) return;
        removeInFlight.current = true;
        setRemoving(claim.claim_id);
        try {
          await axios.post(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/member/claims/${claim.claim_id}/dismiss`, {}, {
            headers: { Authorization: `Bearer ${token}` }, timeout: 15000,
          });
          await reload();
        } catch {
          Alert.alert('Unable to remove claim', 'Please try again. Your claim history has not been deleted.');
        } finally { removeInFlight.current = false; setRemoving(null); }
      } },
    ]);
  };

  const submitClaim = async () => {
    if (submitInFlight.current) return;
    if (!token) {
      Alert.alert('Sign in required', 'Please sign in again before submitting a claim.');
      return;
    }

    if (!selectedGroupId) {
      Alert.alert('Select a group', 'Choose the group this claim belongs to.');
      return;
    }

    const numericAmount = Number(amount.replace(/,/g, '').trim());
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      Alert.alert('Enter an amount', 'Claim amount must be greater than zero.');
      return;
    }

    const cleanReason = reason.trim();
    if (!cleanReason) {
      Alert.alert('Reason required', 'Please tell your group what this claim is for.');
      return;
    }

    if (cleanReason.length > 1000) {
      Alert.alert('Reason too long', 'Please keep the reason to 1000 characters or fewer.');
      return;
    }

    submitInFlight.current = true;
    setSubmitting(true);
    try {
      await axios.post(
        `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/member/claims`,
        {
          group_id: selectedGroupId,
          claim_amount: numericAmount,
          reason: cleanReason,
          ...(resubmittedFrom ? { resubmitted_from_claim_id: resubmittedFrom } : {}),
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 15000,
        }
      );

      setFormOpen(false);
      setSelectedGroupId('');
      setAmount('');
      setReason('');
      await reload();

      Alert.alert(
        'Claim submitted',
        'Your claim has been sent to the group for review.'
      );
    } catch (error) {
      let message = 'Your claim could not be submitted. Please try again.';
      if (axios.isAxiosError(error)) {
        const detail = error.response?.data?.detail;
        if (typeof detail === 'string' && detail.trim()) message = detail;
      }
      Alert.alert('Unable to submit claim', message);
    } finally {
      submitInFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <ProfilePhotoViewer visible={photoExpanded} photoUri={user?.profile_photo} displayName={user?.full_name} onClose={() => setPhotoExpanded(false)} />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <View style={styles.headerTitleRow} />
        <View style={styles.welcomeRow}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Expand profile photo"
            style={styles.profileButton}
            onPress={() => user?.profile_photo ? setPhotoExpanded(true) : router.push('/(member)/profile')}
          >
            <ProfilePhotoFrame size={148}>{user?.profile_photo ? (
              <Image source={{ uri: user.profile_photo }} style={styles.profileImage} resizeMode="cover" />
            ) : (
              <View style={styles.profilePlaceholder}>
                <Ionicons name="person" size={44} color="#FFFFFF" />
              </View>
            )}</ProfilePhotoFrame>
          </TouchableOpacity>
          <View style={styles.greetingBlock}>
            <Text style={styles.greeting}>Claims</Text>
          </View>
        </View>
        <View style={styles.headerDivider} />
        <View style={styles.headerDateRow}>
          <Text style={styles.headerDate}>{new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
          <Text style={styles.headerClubsLabel}>YOUR CLAIMS</Text>
        </View>
      </View>

      <ScrollView ref={panelScroll} contentContainerStyle={styles.content}>
        <View style={{ backgroundColor: '#E4C447', marginHorizontal: -16, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 2 }}>
          <Text
            accessibilityRole="button"
            onPress={() => setClaimsMenuExpanded(value => !value)}
            style={{ color: '#26352D', fontSize: 15, fontWeight: '400', letterSpacing: 1.1 }}
          >CLAIMS & PAYOUTS</Text>
          <View style={{ height: 180, alignItems: 'center', justifyContent: 'center' }}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={claimsMenuExpanded ? 'Close claim actions' : 'Open claim actions'}
              accessibilityState={{ expanded: claimsMenuExpanded }}
              onPress={() => setClaimsMenuExpanded(value => !value)}
              style={{ height: 170, width: 170, alignItems: 'center', justifyContent: 'center' }}
            >
              {claimsMenuExpanded ? (
                <>
                  <View style={{ position: 'absolute', width: 70, height: 6, backgroundColor: '#26352D', transform: [{ rotate: '45deg' }] }} />
                  <View style={{ position: 'absolute', width: 70, height: 6, backgroundColor: '#26352D', transform: [{ rotate: '-45deg' }] }} />
                </>
              ) : (
                <>
                  <View style={{ position: 'absolute', width: 70, height: 6, backgroundColor: '#26352D' }} />
                  <View style={{ position: 'absolute', width: 6, height: 70, backgroundColor: '#26352D' }} />
                </>
              )}
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 3 }}>
            <Text accessibilityRole="button" onPress={() => setClaimsMenuExpanded(value => !value)} style={{ color: '#26352D', fontSize: 14, fontWeight: '400', letterSpacing: 1 }}>
              {claimsMenuExpanded ? 'SELECT AN OPTION' : 'TAP TO MANAGE'}
            </Text>
            <Text accessibilityRole="button" onPress={() => setClaimsMenuExpanded(value => !value)} style={{ color: '#26352D', fontSize: 14, fontWeight: '400', letterSpacing: 1 }}>
              {claimsMenuExpanded ? 'CLOSE MENU' : '2 OPTIONS'}
            </Text>
          </View>
        </View>
        {claimsMenuExpanded && (
          <View style={{ marginHorizontal: -16 }}>
          <View style={{ backgroundColor: '#343A40' }}>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => {
                setClaimsMenuExpanded(false);
                void openForm();
              }}
              style={{ minHeight: 49, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.18)' }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>Submit a Claim</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ expanded: payoutsOnly ? showAllClaims : myClaimsExpanded }}
              onPress={() => {
                if (payoutsOnly) {
                  setShowAllClaims(true);
                }
                setMyClaimsExpanded(true);
                setClaimsMenuExpanded(false);
              }}
              style={{ minHeight: 49, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>
                {payoutsOnly ? 'Show all claims' : 'My Claims'}
              </Text>
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          </View>
        )}

        <View style={{ marginHorizontal: -16 }}>
          <HomeSponsoredCard />
          <ClubvelSpotlight homeBackgroundColor="#343A40" />
        </View>

        {payoutsOnly && <Text style={styles.sectionTitle}>Upcoming Payouts</Text>}
        {payoutsOnly && <View>
          <Text style={styles.helperText}>Approved claims with a remaining balance in your active Clubvels. Figures reflect the latest claim records.</Text>
          {(phase === 'ready' || phase === 'empty') && <Text style={styles.meta}>Remaining total: R{remainingPayout.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>}
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Show all claims" onPress={() => { setShowAllClaims(true); setMyClaimsExpanded(true); }}><Text style={styles.retryText}>Show all claims</Text></TouchableOpacity>
        </View>}

        {myClaimsExpanded && (
          <Modal visible transparent animationType="fade" onRequestClose={() => setMyClaimsExpanded(false)}>
            <View style={styles.claimsPopupOverlay}>
              <View style={styles.claimsPopupCard}>
                <View style={styles.claimsPopupHeader}>
                  <Text style={styles.claimsPopupTitle}>My Claims</Text>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close My Claims" onPress={() => setMyClaimsExpanded(false)} style={styles.claimsPopupClose}>
                    <Ionicons name="close" size={22} color={Colors.white} />
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.claimsPopupScroll} contentContainerStyle={styles.claimsPopupContent} nestedScrollEnabled showsVerticalScrollIndicator>
                  <View>
        {refreshing && phase !== 'loading' && (
          <Text accessibilityLiveRegion="polite" style={styles.helperText}>
            Updating claims…
          </Text>
        )}

        {phase === 'loading' ? (
          <ActivityIndicator color={Colors.accent} style={styles.loader} />
        ) : phase === 'error' ? (
          <View style={styles.empty}>
            <Ionicons name="alert-circle-outline" size={48} color={Colors.textSecondary} />
            <Text style={styles.emptyTitle}>Unable to load claims</Text>
            <Text style={styles.emptyText}>
              Your claim records could not be verified.
            </Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => void reload()}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : visibleClaims.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={52} color={Colors.accent} />
            <Text style={styles.emptyTitle}>{payoutsOnly ? 'No payouts awaiting payment' : 'No claims submitted yet'}</Text>
            <Text style={styles.emptyText}>
              {payoutsOnly ? 'No approved claims have a remaining payout balance.' : 'Your submitted claims will appear here.'}
            </Text>
          </View>
        ) : (
          [...visibleClaims].sort((a, b) => Number(b.claim_id === selectedClaimId) - Number(a.claim_id === selectedClaimId)).map(claim => {
            const submitted = formatDate(claim.submitted_at);
            const scheduled = formatDate(claim.scheduled_claim_date);

            return (
              <View key={claim.claim_id} style={[styles.card, claim.claim_id === selectedClaimId && { borderColor: Colors.accent }]}>
                <View style={styles.cardHeader}>
                  <View style={styles.claimIcon}>
                    <Ionicons name="document-text-outline" size={20} color="#343A40" />
                  </View>
                  <View style={styles.cardHeading}>
                    <Text style={styles.groupName}>{claim.group_name}</Text>
                    <Text style={[styles.statusText, { color: getStatusColor(claim.status) }]}>{statusLabel(claim.status)}</Text>
                  </View>
                </View>

                <Text style={styles.amount}>
                  {claim.amount == null
                    ? 'Amount unavailable'
                    : `R${claim.amount.toLocaleString()}`}
                </Text>

                {claim.reason ? (
                  <Text style={styles.reason}>{claim.reason}</Text>
                ) : null}

                {submitted ? (
                  <Text style={styles.meta}>Submitted {submitted}</Text>
                ) : null}

                {payoutsOnly && <Text style={styles.meta}>Remaining: R{Math.max((claim.amount || 0) - (claim.actual_amount_paid || 0), 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>}
                {claim.status === 'approved' ? (
                  <Text style={styles.meta}>Payout date: {scheduled || 'To be scheduled'}</Text>
                ) : scheduled ? (
                  <Text style={styles.meta}>Scheduled payout {scheduled}</Text>
                ) : null}

                {(claim.status === 'approved' || claim.status === 'paid') && (claim.actual_amount_paid || 0) > 0 ? (
                  <View>
                    <Text style={styles.meta}>Paid: R{claim.actual_amount_paid?.toLocaleString()}{claim.status === 'approved' ? ' (partially paid)' : ''}</Text>
                    <Text style={styles.meta}>{claim.status === 'paid' ? 'Payment date' : 'Last payment date'}: {formatDate(claim.actual_payment_date) || 'Not recorded'}</Text>
                    {!payoutsOnly && <Text style={styles.meta}>Remaining: R{Math.max((claim.amount || 0) - (claim.actual_amount_paid || 0), 0).toLocaleString()}</Text>}
                  </View>
                ) : null}

                {claim.rejection_reason ? (
                  <View style={styles.rejectionBox}>
                    <Text style={styles.rejectionLabel}>Reason for rejection</Text>
                    <Text style={styles.rejectionText}>{claim.rejection_reason}</Text>
                  </View>
                ) : null}
                {claim.status === 'rejected' && (
                  <View style={{ flexDirection: 'row', gap: 20, marginTop: 14 }}>
                    <TouchableOpacity accessibilityRole="button" disabled={!!removing} onPress={() => resubmitClaim(claim)}>
                      <Text style={styles.retryText}>Resubmit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity accessibilityRole="button" disabled={!!removing} onPress={() => removeClaim(claim)}>
                      <Text style={styles.retryText}>{removing === claim.claim_id ? 'Removing…' : 'Remove'}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}
                  </View>
                </ScrollView>
              </View>
            </View>
          </Modal>
        )}

      </ScrollView>

      <Modal
        visible={formOpen}
        animationType="fade"
        transparent
        onRequestClose={closeForm}
      >
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'android' ? 'height' : 'padding'}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Submit a Claim</Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Close claim form"
                onPress={closeForm}
                disabled={submitting}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={22} color={Colors.white} />
              </TouchableOpacity>
            </View>

            <ScrollView ref={formScroll} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
              onLayout={() => { if (reasonFocused.current) formScroll.current?.scrollToEnd({ animated: true }); }}>
              <Text style={styles.label}>Group</Text>

              {activeGroups.map(group => (
                <TouchableOpacity
                  key={group.id}
                  style={[
                    styles.groupOption,
                    selectedGroupId === group.id && styles.groupOptionSelected,
                  ]}
                  onPress={() => setSelectedGroupId(group.id)}
                  disabled={submitting}
                >
                  <View style={[
                    styles.radio,
                    selectedGroupId === group.id && styles.radioSelected,
                  ]}>
                    {selectedGroupId === group.id ? (
                      <View style={styles.radioDot} />
                    ) : null}
                  </View>
                  <Text style={styles.groupOptionText}>{group.name}</Text>
                </TouchableOpacity>
              ))}

              {selectedGroup ? (
                <Text style={styles.selectedHint}>
                  Claim will be submitted to {selectedGroup.name}.
                </Text>
              ) : null}

              <Text style={styles.label}>Amount</Text>
              <View style={styles.amountInputRow}>
                <Text style={styles.currency}>R</Text>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={Colors.textSecondary}
                  style={styles.amountInput}
                  editable={!submitting}
                />
              </View>

              <Text style={styles.label}>Reason</Text>
              <TextInput
                value={reason}
                onFocus={() => { reasonFocused.current = true; formScroll.current?.scrollToEnd({ animated: true }); }}
                onBlur={() => { reasonFocused.current = false; }}
                onChangeText={setReason}
                placeholder="What is this claim for?"
                placeholderTextColor={Colors.textSecondary}
                multiline
                maxLength={1000}
                style={styles.reasonInput}
                editable={!submitting}
                textAlignVertical="top"
              />

              <Text style={styles.characterCount}>{reason.length}/1000</Text>

              <TouchableOpacity
                style={[styles.confirmButton, submitting && styles.disabledButton]}
                accessibilityRole="button"
                onPress={() => void submitClaim()}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.confirmButtonText}>Submit Claim</Text>
                )}
              </TouchableOpacity>

              <Text style={styles.reviewNote}>
                Your group will review the claim before any payout is recorded.
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
    backgroundColor: '#D9D9D9',
    paddingBottom: 8,
    paddingHorizontal: 20,
  },
  headerTitle: {
    flex: 1,
    fontSize: 24,
    fontWeight: '400',
    color: '#343A40',
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', minHeight: 44 },
  welcomeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  greetingBlock: { flex: 1, minWidth: 0, justifyContent: 'center' },
  greeting: { fontSize: 25, lineHeight: 31, fontWeight: '400', color: '#4A4A4A' },
  greetingName: { fontSize: 30, lineHeight: 36, fontWeight: '400', color: '#000000', marginTop: 2 },
  headerDivider: { height: 1, backgroundColor: 'rgba(38,53,45,0.16)', marginTop: 10 },
  headerDateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 },
  headerDate: { fontSize: 10, color: '#26352D', fontWeight: '700', letterSpacing: 1 },
  headerClubsLabel: { fontSize: 10, color: '#26352D', fontWeight: '700', letterSpacing: 1 },
  profileButton: { padding: 0, flexShrink: 0 },
  profileImage: {
    width: 148,
    height: 148,
    borderRadius: 74,
},
  profilePlaceholder: {
    width: 148,
    height: 148,
    borderRadius: 74,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
},
  content: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 0,
  },
  submitButton: {
    height: 52,
    minHeight: 52,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#343A40',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    marginBottom: 16,
  },
  submitButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  myClaimsDropdown: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: '#E4C447',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  myClaimsDropdownLabel: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  myClaimsDropdownText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 14,
  },
  helperText: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  loader: {
    marginTop: 40,
  },
  empty: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 54,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 14,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 7,
  },
  retryText: {
    color: Colors.accent,
    fontWeight: '700',
    marginTop: 14,
  },
  card: {
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  claimIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F8EDC2',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 11,
  },
  cardHeading: {
    flex: 1,
  },
  groupName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  amount: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  reason: {
    fontSize: 14,
    color: Colors.textPrimary,
    lineHeight: 20,
    marginBottom: 8,
  },
  meta: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 3,
  },
  rejectionBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FBE5DF',
  },
  rejectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D96540',
    marginBottom: 4,
  },
  rejectionText: {
    fontSize: 13,
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  claimsPopupOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 28,
  },
  claimsPopupCard: {
    width: '92%',
    maxWidth: 560,
    height: '75%',
    minHeight: '55%',
    maxHeight: '88%',
    backgroundColor: '#FFF8E8',
    borderColor: '#343A40',
    borderWidth: 3,
    borderRadius: 18,
    overflow: 'hidden',
  },
  claimsPopupHeader: {
    minHeight: 58,
    backgroundColor: '#343A40',
    paddingLeft: 18,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  claimsPopupTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
  },
  claimsPopupClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#C96B45',
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimsPopupScroll: {
    flex: 1,
  },
  claimsPopupContent: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 22,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 28,
  },
  modalCard: {
    width: '92%',
    maxWidth: 560,
    height: '75%',
    minHeight: '55%',
    maxHeight: '88%',
    backgroundColor: '#FFF8E8',
    borderColor: '#343A40',
    borderWidth: 3,
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 20,
    overflow: 'hidden',
  },
  modalHeader: {
    minHeight: 58,
    backgroundColor: '#343A40',
    marginHorizontal: -20,
    marginBottom: 16,
    paddingLeft: 18,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#C96B45',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 9,
    marginTop: 8,
  },
  groupOption: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 11,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  groupOptionSelected: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentLight,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.textSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 11,
  },
  radioSelected: {
    borderColor: Colors.accent,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.accent,
  },
  groupOptionText: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  selectedHint: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  amountInputRow: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  currency: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 17,
    color: Colors.textPrimary,
    paddingVertical: 12,
  },
  reasonInput: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 11,
    padding: 14,
    fontSize: 15,
    color: Colors.textPrimary,
    lineHeight: 21,
  },
  characterCount: {
    textAlign: 'right',
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 5,
  },
  confirmButton: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: '#343A40',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  disabledButton: {
    opacity: 0.65,
  },
  confirmButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  reviewNote: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 12,
  },
});
