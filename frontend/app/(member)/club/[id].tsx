import ClubMemberDirectory from '../../../components/ClubMemberDirectory';
import { paymentStateLabel, paymentMoney } from '../../../services/paymentSummaryRecords';
import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Alert, Platform, BackHandler } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../../contexts/AuthContext';
import { StatusPill } from '../../../components/StatusPill';
import { Colors } from '../../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import axios from 'axios';

interface ClubDetails {
  group: {
    id: string;
    name: string;
    type: string;
    monthly_contribution: number;
    payment_due_date: number;
    bank_name: string;
    bank_account_number: string;
    bank_account_holder?: string;
  };
  current_contribution: {
    id: string;
    amount_due: number;
    status: string;
    due_date: string;
    proof_uploaded: boolean;
    payment_date: string | null;
    proof_version?: string | null;
    proof_review_status?: 'pending' | 'declined' | 'approved' | null;
    proof_decline_reason?: string | null;
    proof_delete_eligible?: boolean;
  } | null;
  contributions?: (NonNullable<ClubDetails['current_contribution']> & { contribution_id: string; amount_paid?: number; payment_state?: string; confirmed_amount?: number | null; outstanding_amount?: number | null; historical_only?: boolean; proof_eligible?: boolean; payment_reference?: string })[];
  payment_reference: {
    reference_code: string;
    bank_name: string;
    account_number: string;
    amount: number | null;
  };
  payment_history: Array<{
    month: number;
    year: number;
    amount: number;
    contribution_id?: string;
    payment_state?: string;
    confirmed_amount?: number | null;
    outstanding_amount?: number | null;
    status: string;
    payment_date: string | null;
  }>;
}

export default function ClubDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; month?: string; year?: string; contribution_id?: string; scope?: string; from?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const routeKey = JSON.stringify([id, params.month, params.year, params.contribution_id]);
  const [appliedRoute, setAppliedRoute] = useState(routeKey);
  const invalidPeriod = !!(params.month || params.year) && !(Number.isInteger(Number(params.month)) && Number(params.month) >= 1 && Number(params.month) <= 12 && Number.isInteger(Number(params.year)) && Number(params.year) >= 1 && Number(params.year) <= 9999);
  const { user, token } = useAuth();
  const router = useRouter();
  const [clubData, setClubData] = useState<ClubDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingProof, setDeletingProof] = useState(false);

  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
  const [period, setPeriod] = useState(() => ({ month: Number(params.month) >= 1 && Number(params.month) <= 12 ? Number(params.month) : new Date().getMonth() + 1, year: Number(params.year) >= 1 && Number(params.year) <= 9999 ? Number(params.year) : new Date().getFullYear() }));
  const [selectedContributionId, setSelectedContributionId] = useState<string | null>(params.contribution_id || null);
  const [loadedContext, setLoadedContext] = useState<string | null>(null);

  const clubRequest = useRef<{ key: string; sequence: number } | null>(null);
  const clubSequence = useRef(0);
  const requestContext = `${id}:${user?.id}:${token}:${period.year}:${period.month}:${params.month || ""}:${params.year || ""}`;
  const latestContext = useRef(requestContext);
  latestContext.current = requestContext;
  const latestSelection = useRef(selectedContributionId);
  latestSelection.current = selectedContributionId;
  const screenActive = useRef(true);
  const actionTicket = useRef(0);
  const uploadPending = useRef(false);
  const actionOwner = `${requestContext}:${selectedContributionId}:${params.contribution_id || ""}`;
  const previousAction = useRef(actionOwner);
  if (previousAction.current !== actionOwner) {
    previousAction.current = actionOwner;
    ++actionTicket.current;
    uploadPending.current = false;
  }
  React.useEffect(() => { setUploading(false); setDeletingProof(false); }, [actionOwner]);
  React.useEffect(() => {
    setAppliedRoute(routeKey);
    setSelectedContributionId(params.contribution_id || null);
    if (Number(params.month) >= 1 && Number(params.month) <= 12 && Number(params.year) >= 1 && Number(params.year) <= 9999) {
      setPeriod(current => current.month === Number(params.month) && current.year === Number(params.year) ? current : { month: Number(params.month), year: Number(params.year) });
    }
  }, [id, params.month, params.year, params.contribution_id, routeKey]);

  const fetchClubDetails = useCallback(async (force = false) => {
    if (appliedRoute !== routeKey) return;
    if (invalidPeriod || !id || !user?.id || !token) { setLoading(false); setClubData(null); setError(invalidPeriod ? 'Invalid contribution period.' : 'Unable to open this club. Please sign in again.'); return; }
    const key = requestContext;
    if (!force && clubRequest.current?.key === key) return;
    const sequence = ++clubSequence.current;
    clubRequest.current = { key, sequence };

    setError(null);
    try {
      const response = await axios.get(`${API_URL}/api/member/club/${id}/user/${user?.id}`, {
        params: period, headers: { Authorization: `Bearer ${token}` }, timeout: 15000
      });
      const data = response.data;
      if (!data?.group || data.group.id !== id || typeof data.group.name !== 'string' ||
          !data.payment_reference || !Array.isArray(data.payment_history) ||
          (data.current_contribution != null && (typeof data.current_contribution.amount_due !== 'number' || !Number.isFinite(data.current_contribution.amount_due))) ||
          (data.payment_reference.amount != null && (typeof data.payment_reference.amount !== 'number' || !Number.isFinite(data.payment_reference.amount))) ||
          data.payment_history.some((payment: any) => !payment || typeof payment.amount !== 'number' || !Number.isFinite(payment.amount))) {
        throw new Error('Invalid club response');
      }
      if (screenActive.current && sequence === clubSequence.current && latestContext.current === key) { setClubData(data); setLoadedContext(key); }
    } catch (error: any) {
      if (!screenActive.current || sequence !== clubSequence.current || latestContext.current !== key) return;
      setClubData(null);
      setError(error.response?.status === 403 ? 'You no longer have access to this club.' : 'Unable to load this club. Please try again.');
    } finally {
      if (clubRequest.current?.sequence === sequence) {
        clubRequest.current = null;
        setLoading(false);
      }
    }
  }, [API_URL, id, user?.id, token, period, invalidPeriod, requestContext, appliedRoute, routeKey]);

  useFocusEffect(useCallback(() => {
    screenActive.current = true;
    void fetchClubDetails();
    return () => {
      screenActive.current = false;
      ++actionTicket.current;
      uploadPending.current = false;
      setUploading(false);
      setDeletingProof(false);
    };
  }, [fetchClubDetails]));

  const matchingContributions = clubData?.contributions?.filter(row => row.contribution_id === selectedContributionId);
  const selectedContribution = selectedContributionId ? matchingContributions?.length === 1 ? matchingContributions[0] : undefined : clubData?.contributions?.length === 1 ? clubData.contributions[0] : undefined;
  const displayedClub = clubData?.contributions ? { ...clubData, current_contribution: selectedContribution ? { ...selectedContribution, id: selectedContribution.contribution_id } : null } : selectedContributionId && clubData?.current_contribution?.id !== selectedContributionId ? { ...clubData, current_contribution: null } : clubData;

  const back = () => params.scope === 'club' ? router.replace({ pathname: '/club/[id]', params: { id: id || '', month: String(period.month), year: String(period.year), contribution_id: selectedContributionId || '', from: params.from || 'member' } }) : router.back();
  useFocusEffect(useCallback(() => {
    if (params.scope !== 'club') return;
    const subscription = BackHandler?.addEventListener('hardwareBackPress', () => {
      router.replace({ pathname: '/club/[id]', params: { id: id || '', month: String(period.month), year: String(period.year), contribution_id: selectedContributionId || '', from: params.from || 'member' } });
      return true;
    });
    return () => subscription?.remove();
  }, [router, params.scope, params.from, id, period.month, period.year, selectedContributionId]));

  const handleDeleteProof = () => {
    const contribution = displayedClub?.current_contribution;
    if (!screenActive.current || latestContext.current !== requestContext || previousAction.current !== actionOwner || !contribution || !token || deletingProof) return;
    const actionContext = requestContext;
    const selection = selectedContributionId;
    const dialogTicket = actionTicket.current;
    Alert.alert('Delete Pending Proof', 'Remove this proof? Your contribution will remain unpaid.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        if (!screenActive.current || latestContext.current !== actionContext || latestSelection.current !== selection || actionTicket.current !== dialogTicket || uploadPending.current) return;
        const ticket = ++actionTicket.current;
        uploadPending.current = true;
        setDeletingProof(true);
        try {
          await axios.delete(`${API_URL}/api/contributions/${contribution.id}/proof`, {
            data: { proof_version: contribution.proof_version },
            headers: { Authorization: `Bearer ${token}` }
          });
          if (screenActive.current && latestContext.current === actionContext && latestSelection.current === selection && actionTicket.current === ticket) await fetchClubDetails(true);
        } catch (error: any) {
          if (!screenActive.current || latestContext.current !== actionContext || latestSelection.current !== selection || actionTicket.current !== ticket) return;
          Alert.alert('Error', error.response?.data?.detail || 'Failed to delete pending proof');
        } finally {
          if (screenActive.current && latestContext.current === actionContext && latestSelection.current === selection && actionTicket.current === ticket) { uploadPending.current = false; setDeletingProof(false); }
        }
      } }
    ]);
  };

  const handleUploadProof = async () => {
    if (latestContext.current !== requestContext || previousAction.current !== actionOwner || !screenActive.current || !displayedClub?.current_contribution || !user?.id || !token || uploadPending.current) return;
    if (selectedContribution?.historical_only || selectedContribution?.proof_eligible === false) return;
    const owner = actionOwner;
    const ticket = ++actionTicket.current;
    const current = () => screenActive.current && previousAction.current === owner && actionTicket.current === ticket;
    const target = displayedClub.current_contribution;
    const reference = selectedContribution?.payment_reference || clubData?.payment_reference.reference_code;
    const actor = user.id;
    const sessionToken = token;
    uploadPending.current = true;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true, multiple: false });
      if (!current() || result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (asset.size && asset.size > 5 * 1024 * 1024) {
        Alert.alert('File Too Large', 'Please select a proof of payment smaller than 5 MB.');
        return;
      }
      const mimeType = asset.mimeType || (asset.name?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      if (!current()) return;
      setUploading(true);
      await axios.post(`${API_URL}/api/contributions/upload-proof`, { contribution_id: target.id, proof_image: `data:${mimeType};base64,${base64}`, proof_mime_type: mimeType, proof_file_name: asset.name || null, reference_number: reference, user_id: actor }, { headers: { Authorization: `Bearer ${sessionToken}` } });
      if (!current()) return;
      Alert.alert('Success', 'Proof of payment uploaded successfully! Your treasurer will confirm shortly.');
      await fetchClubDetails(true);
    } catch (error: any) {
      if (!current()) return;
      Alert.alert('Error', error.response?.data?.detail || 'Failed to upload proof of payment. Retry proof upload only.');
    } finally {
      if (current()) { uploadPending.current = false; setUploading(false); }
    }
  };

  if (appliedRoute !== routeKey || !clubData || clubData.group.id !== id || loadedContext !== requestContext) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={back} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Club</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          {loading || (clubData && loadedContext !== requestContext) ? <ActivityIndicator size="large" color={Colors.mediumGreen} /> :
            <View><Text style={styles.errorText}>{error || 'Unable to load club details'}</Text><TouchableOpacity onPress={() => void fetchClubDetails(true)}><Text style={styles.errorText}>Retry</Text></TouchableOpacity></View>}
        </View>
      </View>
    );
  }

  const getMonthName = (month: number) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[month - 1];
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={back} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{clubData.group.name}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView>
        {params.scope !== 'club' && <ClubMemberDirectory groupId={id} />}
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open club payments" onPress={() => router.push({ pathname: "/(member)/proofs", params: { group_id: id, month: String(period.month), year: String(period.year), contribution_id: selectedContribution?.contribution_id || selectedContributionId || "", scope: params.scope, from: params.from } })}><Text>Payments and contribution records</Text></TouchableOpacity>
        <View style={styles.cardHeader}>
          <TouchableOpacity accessibilityLabel="Previous contribution month" onPress={() => { const d = new Date(period.year, period.month - 2, 1); setSelectedContributionId(null); setPeriod({ year: d.getFullYear(), month: d.getMonth() + 1 }); }}><Text>‹</Text></TouchableOpacity>
          <Text>{getMonthName(period.month)} {period.year}</Text>
          <TouchableOpacity accessibilityLabel="Next contribution month" onPress={() => { const d = new Date(period.year, period.month, 1); setSelectedContributionId(null); setPeriod({ year: d.getFullYear(), month: d.getMonth() + 1 }); }}><Text>›</Text></TouchableOpacity>
        </View>
        {clubData.contributions?.map((row, index) => <TouchableOpacity key={row.contribution_id} accessibilityRole="button" onPress={() => setSelectedContributionId(row.contribution_id)}><Text>Contribution {index + 1}: {paymentMoney(row.amount_due)} · {paymentStateLabel(row.payment_state)}</Text></TouchableOpacity>)}

        {/* Current Contribution Status */}
        <View style={styles.section}>
          <View style={styles.card}>
            {displayedClub?.current_contribution ? <>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Selected Contribution</Text>
              <StatusPill label={paymentStateLabel(selectedContribution?.payment_state)} status={displayedClub?.current_contribution.proof_review_status === 'declined' ? 'proof_declined' : displayedClub?.current_contribution.status} />
            </View>

            <View style={styles.amountRow}>
              <Text style={styles.amountLabel}>Amount Due</Text>
              <Text style={styles.amountValue}>{paymentMoney(displayedClub?.current_contribution.amount_due)}</Text>
            </View>

            {selectedContribution && <Text>Confirmed Collected: {paymentMoney(selectedContribution.confirmed_amount)} · Outstanding: {paymentMoney(selectedContribution.outstanding_amount)}</Text>}
            {selectedContribution?.amount_paid != null && selectedContribution.confirmed_amount === 0 && selectedContribution.amount_paid > 0 && <Text>Recorded, unconfirmed: {paymentMoney(selectedContribution.amount_paid)}</Text>}
            <View style={styles.divider} />

            <View style={styles.infoRow}>
              <Ionicons name="calendar" size={16} color={Colors.textSecondary} />
              <Text style={styles.infoText}>{displayedClub?.current_contribution.due_date ? `Due date: ${displayedClub.current_contribution.due_date}` : 'Flexible contribution'}</Text>
            </View>

            {selectedContribution?.historical_only || (selectedContribution?.payment_state ? ['confirmed', 'excused'].includes(selectedContribution.payment_state) : ['confirmed', 'paid', 'excused'].includes(displayedClub?.current_contribution.status)) ? (
              <TouchableOpacity style={styles.buttonSecondary}>
                <Ionicons name="checkmark-circle" size={20} color={Colors.mediumGreen} />
                <Text style={styles.buttonSecondaryText}>{selectedContribution?.historical_only ? 'Historical contribution — read only' : selectedContribution?.payment_state === 'excused' ? 'Excused' : 'Payment Confirmed'}</Text>
              </TouchableOpacity>
            ) : displayedClub?.current_contribution.proof_review_status === 'declined' ? (
              <View>
                <Text style={styles.waitingText}>Proof Declined</Text>
                {!!displayedClub?.current_contribution.proof_decline_reason && (
                  <Text style={styles.infoText}>{displayedClub?.current_contribution.proof_decline_reason}</Text>
                )}
                <TouchableOpacity style={[styles.buttonOutline, uploading && styles.buttonDisabled]}
                  onPress={handleUploadProof} disabled={uploading}>
                  <Text style={styles.buttonOutlineText}>{uploading ? 'Uploading...' : 'Replace Proof'}</Text>
                </TouchableOpacity>
              </View>
            ) : displayedClub?.current_contribution.proof_uploaded ? (
              <View>
                <View style={styles.waitingContainer}>
                  <Ionicons name="time" size={20} color={Colors.gold} />
                  <Text style={styles.waitingText}>Awaiting treasurer confirmation</Text>
                </View>
                {displayedClub?.current_contribution.proof_delete_eligible && (
                  <TouchableOpacity style={[styles.buttonOutline, deletingProof && styles.buttonDisabled]}
                    onPress={handleDeleteProof} disabled={deletingProof || uploading}>
                    <Ionicons name="trash-outline" size={18} color={Colors.mediumGreen} />
                    <Text style={styles.buttonOutlineText}>{deletingProof ? 'Deleting...' : 'Delete Pending Proof'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : selectedContribution?.proof_eligible === false ? <Text style={styles.infoText}>Recorded amount is not confirmed. Contact your administrator.</Text> : (
              <TouchableOpacity
                style={[styles.button, uploading && styles.buttonDisabled]}
                onPress={handleUploadProof}
                disabled={uploading}
              >
                <Ionicons name="camera" size={20} color={Colors.white} />
                <Text style={styles.buttonText}>
                  {uploading ? 'Uploading...' : 'Upload Proof of Payment'}
                </Text>
              </TouchableOpacity>
            )}
            </> : <Text style={styles.infoText}>{selectedContributionId ? 'Requested contribution unavailable. Select a recorded contribution.' : (clubData.contributions?.length || 0) > 1 ? 'Select a contribution record.' : 'No contribution recorded for this month.'}</Text>}
          </View>
        </View>

        {/* Payment Reference */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Payment Reference</Text>
          <View style={[styles.card, styles.referenceCard]}>
            <View style={styles.referenceCodeContainer}>
              <Text style={styles.referenceLabel}>Reference Code</Text>
              <Text style={styles.referenceCode}>{selectedContribution?.payment_reference || clubData?.payment_reference.reference_code || 'Not available'}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.bankDetails}>
              <View style={styles.bankDetailRow}>
                <Text style={styles.bankDetailLabel}>Bank</Text>
                <Text style={styles.bankDetailValue}>{clubData.payment_reference.bank_name || 'Not available'}</Text>
              </View>
              <View style={styles.bankDetailRow}>
                <Text style={styles.bankDetailLabel}>Account Number</Text>
                <Text style={styles.bankDetailValue}>{clubData.payment_reference.account_number || 'Not available'}</Text>
              </View>
              <View style={styles.bankDetailRow}><Text style={styles.bankDetailLabel}>Account Holder</Text><Text style={styles.bankDetailValue}>{clubData.group.bank_account_holder || "Not available"}</Text></View>
              <View style={styles.bankDetailRow}>
                <Text style={styles.bankDetailLabel}>Amount</Text>
                <Text style={styles.bankDetailValue}>{selectedContribution ? paymentMoney(selectedContribution.outstanding_amount) : clubData.payment_reference.amount == null ? 'Not recorded' : paymentMoney(clubData.payment_reference.amount)} </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Payment History */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment History</Text>
          {clubData.payment_history.length > 0 ? (
            clubData.payment_history.map((payment, index) => (
              <View key={payment.contribution_id || index} style={styles.historyCard}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyMonth}>
                    {getMonthName(payment.month)} {payment.year}
                  </Text>
                  <StatusPill status={payment.status} label={paymentStateLabel(payment.payment_state)} />
                </View>
                <Text style={styles.historyAmount}>Recorded amount: {paymentMoney(payment.amount)}</Text>
                {payment.confirmed_amount !== undefined && <Text>Confirmed Collected: {paymentMoney(payment.confirmed_amount)} · Outstanding: {paymentMoney(payment.outstanding_amount)}</Text>}
              </View>
            ))
          ) : (
            <View style={styles.emptyHistory}>
              <Text style={styles.emptyHistoryText}>No payment history yet</Text>
            </View>
          )}
        </View>
      </ScrollView>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.lightBackground,
  },
  errorText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  header: {
    backgroundColor: Colors.darkGreen,
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 40,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.white,
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  section: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  card: {
    backgroundColor: Colors.white,
    padding: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  amountLabel: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  amountValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.cardBorder,
    marginVertical: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  infoText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  button: {
    backgroundColor: Colors.gold,
    paddingVertical: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonSecondary: {
    backgroundColor: Colors.lightBackground,
    paddingVertical: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonSecondaryText: {
    color: Colors.mediumGreen,
    fontSize: 16,
    fontWeight: 'bold',
  },
  waitingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    backgroundColor: Colors.lightGold,
    borderRadius: 12,
    marginBottom: 12,
  },
  waitingText: {
    color: Colors.gold,
    fontSize: 14,
    fontWeight: '600',
  },
  buttonOutline: {
    borderWidth: 1,
    borderColor: Colors.mediumGreen,
    paddingVertical: 12,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonOutlineText: {
    color: Colors.mediumGreen,
    fontSize: 14,
    fontWeight: '600',
  },
  referenceCard: {
    backgroundColor: Colors.darkGreen,
  },
  referenceCodeContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  referenceLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 8,
  },
  referenceCode: {
    fontSize: 32,
    fontWeight: 'bold',
    color: Colors.white,
    letterSpacing: 2,
  },
  bankDetails: {
    gap: 12,
  },
  bankDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bankDetailLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  bankDetailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
  },
  historyCard: {
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 8,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  historyMonth: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  historyAmount: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  emptyHistory: {
    backgroundColor: Colors.white,
    padding: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
  },
  emptyHistoryText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
});
