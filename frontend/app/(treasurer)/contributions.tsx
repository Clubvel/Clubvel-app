import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Image, Modal } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { StatusPill } from '../../components/StatusPill';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'expo-router';
import axios from 'axios';

interface Contribution {
  id: string | null;
  member_id: string;
  member_name: string;
  reference_code: string;
  amount_due: number;
  amount_paid: number;
  status: string;
  proof_uploaded: boolean;
  proof_of_payment: string | null;
  payment_date: string | null;
  reference_number: string | null;
}

export default function ContributionsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [summary, setSummary] = useState({ collected: 0, outstanding: 0, total_expected: 0, collection_rate: 0 });
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [selectedProof, setSelectedProof] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

  const fetchContributions = async () => {
    try {
      // Empty contributions - real data will come from API when user creates a club
      setContributions([]);
      setSummary({ collected: 0, outstanding: 0, total_expected: 0, collection_rate: 0 });
    } catch (error) {
      console.error('Error fetching contributions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContributions();
  }, [currentMonth, currentYear]);

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

  const handleViewProof = (proof: string) => {
    setSelectedProof(proof);
    setModalVisible(true);
  };

  const handleConfirmPayment = async (contributionId: string) => {
    setConfirmingId(contributionId);
    try {
      await axios.post(`${API_URL}/api/treasurer/confirm-payment`, {
        contribution_id: contributionId,
        notes: 'Payment confirmed by treasurer',
        treasurer_id: user?.id,  // Authorization: Pass treasurer ID for access control
      });

      Alert.alert('Success', 'Payment confirmed! Member has been notified.');
      fetchContributions(); // Refresh data
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to confirm payment');
    } finally {
      setConfirmingId(null);
    }
  };

  const getMonthName = (month: number) => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return months[month - 1];
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.mediumGreen} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with Month Navigation and Profile */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Payments</Text>
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
        </View>
        <TouchableOpacity onPress={() => router.push('/(treasurer)/profile')} style={styles.profileButton}>
          {user?.profile_photo ? (
            <Image source={{ uri: user.profile_photo }} style={styles.profileImage} />
          ) : (
            <View style={styles.profilePlaceholder}>
              <Ionicons name="person" size={20} color={Colors.white} />
            </View>
          )}
        </TouchableOpacity>
      </View>

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

      {/* Contributions List */}
      <ScrollView style={styles.content}>
        {contributions.map((contribution, index) => (
          <View key={index} style={styles.contributionCard}>
            <View style={styles.contributionHeader}>
              <View>
                <Text style={styles.memberName}>{contribution.member_name}</Text>
                <Text style={styles.memberReference}>{contribution.reference_code}</Text>
              </View>
              <StatusPill status={contribution.status} />
            </View>

            <View style={styles.contributionAmount}>
              <Text style={styles.amountLabel}>Amount</Text>
              <Text style={styles.amountValue}>R{contribution.amount_due.toFixed(2)}</Text>
            </View>

            {contribution.proof_uploaded && contribution.status !== 'confirmed' && (
              <View style={styles.contributionActions}>
                <TouchableOpacity
                  style={styles.viewProofButton}
                  onPress={() => handleViewProof(contribution.proof_of_payment!)}
                >
                  <Ionicons name="eye" size={18} color={Colors.mediumGreen} />
                  <Text style={styles.viewProofText}>View Proof</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.confirmButton, confirmingId === contribution.id && styles.confirmButtonDisabled]}
                  onPress={() => handleConfirmPayment(contribution.id!)}
                  disabled={confirmingId === contribution.id}
                >
                  <Ionicons name="checkmark-circle" size={18} color={Colors.white} />
                  <Text style={styles.confirmButtonText}>
                    {confirmingId === contribution.id ? 'Confirming...' : 'Confirm Payment'}
                  </Text>
                </TouchableOpacity>
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
      </ScrollView>

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
    alignItems: 'flex-start',
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.white,
    marginBottom: 12,
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
  monthNav: {
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
    minWidth: 150,
    textAlign: 'center',
  },
  summaryContainer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.white,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.textPrimary,
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
    flexDirection: 'row',
    gap: 8,
  },
  viewProofButton: {
    flex: 1,
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
    flex: 1,
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
