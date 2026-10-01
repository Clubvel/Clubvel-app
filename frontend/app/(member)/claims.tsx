import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../contexts/AuthContext';
import { usePersonalClaims } from '../../hooks/usePersonalClaims';

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

const formatDate = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString();
};

export default function ClaimsScreen() {
  const { user, token } = useAuth();
  const router = useRouter();
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

  const [formOpen, setFormOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
        ? response.data.clubs.filter(
            (group: { id: string; name: string; status: string }) =>
              group.status === 'active'
          )
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

  const submitClaim = async () => {
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

    setSubmitting(true);
    try {
      await axios.post(
        `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/member/claims`,
        {
          group_id: selectedGroupId,
          claim_amount: numericAmount,
          reason: cleanReason,
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
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Claims</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Open profile"
          onPress={() => router.push('/(member)/profile')}
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

      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity
          style={styles.submitButton}
          accessibilityRole="button"
          onPress={() => void openForm()}
        >
          <Ionicons name="add-circle-outline" size={21} color={Colors.white} />
          <Text style={styles.submitButtonText}>Submit a Claim</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Your Claims</Text>

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
        ) : claims.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={52} color={Colors.accent} />
            <Text style={styles.emptyTitle}>No claims yet</Text>
            <Text style={styles.emptyText}>
              Claims you submit to your groups will appear here.
            </Text>
          </View>
        ) : (
          claims.map(claim => {
            const submitted = formatDate(claim.submitted_at);
            const scheduled = formatDate(claim.scheduled_claim_date);

            return (
              <View key={claim.claim_id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.claimIcon}>
                    <Ionicons name="document-text-outline" size={20} color={Colors.accent} />
                  </View>
                  <View style={styles.cardHeading}>
                    <Text style={styles.groupName}>{claim.group_name}</Text>
                    <Text style={styles.statusText}>{statusLabel(claim.status)}</Text>
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

                {scheduled ? (
                  <Text style={styles.meta}>Scheduled payout {scheduled}</Text>
                ) : null}

                {claim.rejection_reason ? (
                  <View style={styles.rejectionBox}>
                    <Text style={styles.rejectionLabel}>Reason for rejection</Text>
                    <Text style={styles.rejectionText}>{claim.rejection_reason}</Text>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal
        visible={formOpen}
        animationType="slide"
        transparent
        onRequestClose={closeForm}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Submit a Claim</Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Close claim form"
                onPress={closeForm}
                disabled={submitting}
              >
                <Ionicons name="close" size={26} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
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
  profileImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  profilePlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flexGrow: 1,
    padding: 24,
    paddingBottom: 40,
  },
  submitButton: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: Colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    marginBottom: 26,
  },
  submitButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
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
    padding: 18,
    borderRadius: 14,
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
    backgroundColor: Colors.accentLight,
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
    color: Colors.accent,
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
    backgroundColor: Colors.primaryLight,
  },
  rejectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  rejectionText: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.38)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    maxHeight: '88%',
    backgroundColor: Colors.white,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
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
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
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
