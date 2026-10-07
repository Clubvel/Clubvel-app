import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Image, Modal, TextInput, RefreshControl } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { StatusPill } from '../../components/StatusPill';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter, useFocusEffect } from 'expo-router';
import { AdBanner } from '../../components/AdBanner';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import axios from 'axios';

interface Contribution {
  id: string | null;
  member_id: string;
  member_name: string;
  reference_code: string;
  amount_due: number | null;
  amount_paid: number;
  status: string;
  contribution_status: string | null;
  proof_uploaded: boolean;
  proof_version: string | null;
  proof_review_status?: string | null;
  payment_date: string | null;
}

export default function ContributionsScreen() {
  const { user, token } = useAuth();
  const router = useRouter();
  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
  const [loading, setLoading] = useState(true);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [summary, setSummary] = useState({ collected: 0, outstanding: 0, total_expected: 0, collection_rate: 0 });
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [selectedProof, setSelectedProof] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [clubs, setClubs] = useState<{ id: string; name: string }[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [showClubs, setShowClubs] = useState(false);
  const [declining, setDeclining] = useState<Contribution | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const context = `${groupId}:${currentMonth}:${currentYear}:${user?.id}:${token}`;
  const latestContext = useRef(context);
  latestContext.current = context;
  const request = useRef<{ key: string; sequence: number } | null>(null);
  const sequence = useRef(0);
  const clubsRequest = useRef<string | null>(null);
  const clubsContext = `${user?.id}:${token}`;
  const latestClubsContext = useRef(clubsContext);
  latestClubsContext.current = clubsContext;

  const fetchClubs = useCallback(async () => {
    if (!user?.id) return;
    const key = `${user.id}:${token}`;
    if (clubsRequest.current === key) return;
    clubsRequest.current = key;
    try {
      const response = await axios.get(`${API_URL}/api/admin/clubs/${user.id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (latestClubsContext.current !== key) return;
      const managed = response.data.clubs;
      setClubs(managed);
      setGroupId(previous => managed.some((club: { id: string }) => club.id === previous) ? previous : managed[0]?.id ?? null);
      if (!managed.length) setLoading(false);
    } catch (err: any) {
      if (latestClubsContext.current !== key) return;
      setError(err.response?.data?.detail || 'Unable to load clubs. Please try again.');
      setLoading(false);
    } finally {
      if (clubsRequest.current === key) clubsRequest.current = null;
    }
  }, [API_URL, user?.id, token]);

  const fetchContributions = useCallback(async (force = false) => {
    if (!groupId || !user?.id) return;
    const key = `${groupId}:${currentMonth}:${currentYear}:${user.id}:${token}`;
    if (!force && request.current?.key === key) return;
    const ticket = ++sequence.current;
    request.current = { key, sequence: ticket };
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`${API_URL}/api/treasurer/contributions/${groupId}/month/${currentMonth}/year/${currentYear}`, {
        params: { treasurer_id: user.id }, headers: { Authorization: `Bearer ${token}` }
      });
      if (sequence.current !== ticket || latestContext.current !== key) return;
      setContributions(response.data.contributions);
      setSummary(response.data.summary);
      setLoadedKey(key);
    } catch (err: any) {
      if (sequence.current === ticket && latestContext.current === key) setError(err.response?.data?.detail || 'Unable to load payments. Please try again.');
    } finally {
      if (request.current?.sequence === ticket) { request.current = null; setLoading(false); }
    }
  }, [API_URL, groupId, currentMonth, currentYear, user?.id, token]);

  useFocusEffect(useCallback(() => { void fetchClubs(); }, [fetchClubs]));
  useFocusEffect(useCallback(() => { void fetchContributions(); }, [fetchContributions]));

  const handlePreviousMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
    setLoading(true);
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
    setLoading(true);
  };

  const handleViewProof = async (contributionId: string) => {
    try {
      const response = await axios.get(`${API_URL}/api/contributions/${contributionId}/proof`, { params: { user_id: user?.id }, headers: { Authorization: `Bearer ${token}` } });
      const proof = response.data.proof_image;
      if (!proof) throw new Error('Proof unavailable');
      const mime = response.data.proof_mime_type || (proof.startsWith('data:application/pdf') ? 'application/pdf' : 'image/jpeg');
      if (mime !== 'application/pdf') {
        setSelectedProof(proof.startsWith('data:') ? proof : `data:${mime};base64,${proof}`);
        setModalVisible(true);
        return;
      }
      if (!await Sharing.isAvailableAsync()) { Alert.alert('Error', 'Opening PDF files is not available on this device.'); return; }
      const fileUri = FileSystem.documentDirectory + `proof_${Date.now()}.pdf`;
      await FileSystem.writeAsStringAsync(fileUri, proof.replace(/^data:[^;]+;base64,/, ''), { encoding: FileSystem.EncodingType.Base64 });
      await Sharing.shareAsync(fileUri, { mimeType: 'application/pdf', dialogTitle: 'Open Proof of Payment' });
    } catch (err: any) { Alert.alert('Error', err.response?.data?.detail || 'Failed to open proof of payment.'); }
  };

  const handleConfirmPayment = async (contribution: Contribution) => {
    if (!contribution.id || !contribution.proof_version || confirmingId) return;
    setConfirmingId(contribution.id);
    try {
      await axios.post(`${API_URL}/api/treasurer/confirm-payment`, {
        contribution_id: contribution.id, proof_version: contribution.proof_version,
        notes: 'Payment confirmed by treasurer', treasurer_id: user?.id,
      }, { headers: { Authorization: `Bearer ${token}` } });
      Alert.alert('Success', 'Payment confirmed! Member has been notified.');
      await fetchContributions(true);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to confirm payment');
      if (err.response?.status === 409) await fetchContributions(true);
    } finally { setConfirmingId(null); }
  };

  const handleDeclineProof = async () => {
    if (!declining?.id || !declining.proof_version || confirmingId) return;
    setConfirmingId(declining.id);
    try {
      await axios.post(`${API_URL}/api/contributions/${declining.id}/decline-proof`, {
        proof_version: declining.proof_version, reason: reason.trim() || null,
      }, { headers: { Authorization: `Bearer ${token}` } });
      setDeclining(null);
      await fetchContributions(true);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to decline proof');
      if (err.response?.status === 409) { setDeclining(null); await fetchContributions(true); }
    } finally { setConfirmingId(null); }
  };

  const getMonthName = (month: number) => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return months[month - 1];
  };

  return (
    <View style={styles.container}>
      {/* Header with Month Navigation and Profile */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Payments</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(treasurer)/profile')} style={styles.profileButton}>
          {user?.profile_photo ? (
            <Image source={{ uri: user.profile_photo }} style={styles.profileImage} resizeMode="cover" />
          ) : (
            <View style={styles.profilePlaceholder}>
              <Ionicons name="person" size={32} color={Colors.white} />
            </View>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.monthNav}>
        <TouchableOpacity onPress={handlePreviousMonth} style={styles.monthButton}>
          <Ionicons name="chevron-back" size={20} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.monthText}>
          {getMonthName(currentMonth)} {currentYear}
        </Text>
        <TouchableOpacity onPress={handleNextMonth} style={styles.monthButton}>
          <Ionicons name="chevron-forward" size={20} color={Colors.white} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.summaryContainer} onPress={() => setShowClubs(true)}>
        <Text>{clubs.find(club => club.id === groupId)?.name || 'Select Club'}</Text>
        <Ionicons name="chevron-down" size={20} color={Colors.mediumGreen} />
      </TouchableOpacity>
      {error && <View style={styles.summaryContainer}><Text>{error}</Text><TouchableOpacity onPress={() => { void fetchClubs(); void fetchContributions(); }}><Text>Retry</Text></TouchableOpacity></View>}
      {loadedKey === context && <>
      {/* Summary Totals */}
      <View style={styles.summaryContainer}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Collected</Text>
          <Text style={[styles.summaryValue, styles.collectedValue]}>R{summary.collected.toFixed(2)}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Outstanding</Text>
          <Text style={[styles.summaryValue, styles.outstandingValue]}>R{summary.outstanding.toFixed(2)}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Collection Rate</Text>
          <Text style={styles.summaryValue}>{summary.collection_rate}%</Text>
        </View>
      </View>

      </>}
      {/* Contributions List */}
      <ScrollView style={styles.content} refreshControl={<RefreshControl refreshing={loading && loadedKey === context} onRefresh={() => void fetchContributions()} />}>
        {loading && loadedKey !== context && <ActivityIndicator size="large" color={Colors.mediumGreen} />}
        {!loading && !groupId && !error && <Text>No managed clubs yet.</Text>}
        {(loadedKey === context ? contributions : []).map((contribution) => (
          <View key={contribution.id ?? contribution.member_id} style={styles.contributionCard}>
            <View style={styles.contributionHeader}>
              <View>
                <Text style={styles.memberName}>{contribution.member_name}</Text>
                <Text style={styles.memberReference}>{contribution.reference_code}</Text>
              </View>
              <StatusPill status={contribution.proof_review_status === 'declined' ? 'proof_declined' : contribution.status} />
            </View>

            <View style={styles.contributionAmount}>
              <Text style={styles.amountLabel}>Amount</Text>
              <Text style={styles.amountValue}>{contribution.amount_due == null ? 'Not recorded' : `R${contribution.amount_due.toFixed(2)}`}</Text>
            </View>

            {contribution.proof_uploaded && contribution.id && (
              <View style={styles.contributionActions}>
                <TouchableOpacity
                  style={styles.viewProofButton}
                  onPress={() => handleViewProof(contribution.id!)}
                >
                  <Ionicons name="eye" size={18} color={Colors.mediumGreen} />
                  <Text style={styles.viewProofText}>View Proof</Text>
                </TouchableOpacity>

                {contribution.contribution_status === 'proof_uploaded' && contribution.proof_review_status !== 'declined' && contribution.proof_review_status !== 'approved' && contribution.proof_version && <>
                  <Text>Awaiting Review</Text>
                <TouchableOpacity
                  style={[styles.confirmButton, confirmingId === contribution.id && styles.confirmButtonDisabled]}
                  onPress={() => handleConfirmPayment(contribution)}
                  disabled={!!confirmingId}
                >
                  <Ionicons name="checkmark-circle" size={18} color={Colors.white} />
                  <Text style={styles.confirmButtonText}>
                    {confirmingId === contribution.id ? 'Confirming...' : 'Approve Payment'}
                  </Text>
                </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.viewProofButton}
                    disabled={!!confirmingId}
                    onPress={() => { setReason(''); setDeclining(contribution); }}
                  >
                    <Text style={styles.viewProofText}>Decline Proof</Text>
                  </TouchableOpacity>
                </>}
              </View>
            )}

            {contribution.status === 'confirmed' && contribution.payment_date && (
              <View style={styles.confirmedInfo}>
                <Ionicons name="checkmark-circle" size={16} color={Colors.statusPaid} />
                <Text style={styles.confirmedText}>Confirmed on {new Date(contribution.payment_date).toLocaleDateString()}</Text>
              </View>
            )}
          </View>
        ))}
        
        {/* Ad Banner */}
        <AdBanner size="banner" />
      </ScrollView>

      <Modal visible={showClubs} transparent animationType="fade" onRequestClose={() => setShowClubs(false)}>
        <View style={styles.modalOverlay}><View style={[styles.modalContent, { padding: 20 }]}>
          <Text style={styles.modalTitle}>Select Club</Text>
          <ScrollView>
            {clubs.map(club => <TouchableOpacity key={club.id} style={styles.viewProofButton} onPress={() => { setGroupId(club.id); setShowClubs(false); }}><Text>{club.name}</Text></TouchableOpacity>)}
          </ScrollView>
          <TouchableOpacity onPress={() => setShowClubs(false)}><Text>Cancel</Text></TouchableOpacity>
        </View></View>
      </Modal>
      <Modal visible={!!declining} transparent animationType="fade" onRequestClose={() => setDeclining(null)}>
        <View style={styles.modalOverlay}><View style={[styles.modalContent, { padding: 20 }]}>
          <Text style={styles.modalTitle}>Decline Proof</Text>
          <TextInput value={reason} onChangeText={setReason} maxLength={200} placeholder="Reason (optional)" />
          <TouchableOpacity style={styles.confirmButton} disabled={!!confirmingId} onPress={handleDeclineProof}><Text style={styles.confirmButtonText}>Confirm Decline</Text></TouchableOpacity>
          <TouchableOpacity disabled={!!confirmingId} onPress={() => setDeclining(null)}><Text>Cancel</Text></TouchableOpacity>
        </View></View>
      </Modal>
      {/* Proof of Payment Modal */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Proof of Payment</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={28} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            {selectedProof && (
              <Image
                source={{ uri: selectedProof }}
                style={styles.proofImage}
                resizeMode="contain"
              />
            )}
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
    paddingBottom: 20,
    paddingHorizontal: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.white,
  },
  profileButton: {
    padding: 4,
    flexShrink: 0,
  },
  profileImage: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    borderColor: Colors.gold,
  },
  profilePlaceholder: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: Colors.gold,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthNav: {
    backgroundColor: Colors.darkGreen,
    paddingHorizontal: 24,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  monthButton: {
    padding: 8,
  },
  monthText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.white,
    flex: 1,
    flexShrink: 1,
    textAlign: 'center',
  },
  summaryContainer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 12,
    alignItems: 'stretch',
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.white,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 80,
  },
  summaryLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginBottom: 4,
    textAlign: 'center',
    minHeight: 30,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  collectedValue: {
    color: Colors.statusPaid,
  },
  outstandingValue: {
    color: Colors.statusLate,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  contributionCard: {
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 12,
  },
  contributionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  memberReference: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  contributionAmount: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
    marginBottom: 12,
  },
  amountLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  amountValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  contributionActions: {
    flexDirection: 'column',
    gap: 8,
  },
  viewProofButton: {
    flex: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.mediumGreen,
    backgroundColor: Colors.white,
  },
  viewProofText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.mediumGreen,
  },
  confirmButton: {
    flex: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: Colors.mediumGreen,
  },
  confirmButtonDisabled: {
    opacity: 0.6,
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
  },
  confirmedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDF4',
    padding: 8,
    borderRadius: 8,
  },
  confirmedText: {
    fontSize: 12,
    color: Colors.statusPaid,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    width: '100%',
    maxHeight: '80%',
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
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  proofImage: {
    width: '100%',
    height: 400,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
});
