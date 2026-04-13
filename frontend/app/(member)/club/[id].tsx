import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Alert, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../../contexts/AuthContext';
import { StatusPill } from '../../../components/StatusPill';
import { Colors } from '../../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
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
    bank_account_holder: string;
  };
  current_contribution: {
    id: string;
    amount_due: number;
    status: string;
    due_date: string;
    proof_uploaded: boolean;
    payment_date: string | null;
  };
  payment_reference: {
    reference_code: string;
    bank_name: string;
    account_number: string;
    amount: number;
  };
  payment_history: Array<{
    month: number;
    year: number;
    amount: number;
    status: string;
    payment_date: string | null;
  }>;
}

export default function ClubDetailScreen() {
  const { id } = useLocalSearchParams();
  const { user } = useAuth();
  const router = useRouter();
  const [clubData, setClubData] = useState<ClubDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

  const fetchClubDetails = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/member/club/${id}/user/${user?.id}`);
      setClubData(response.data);
    } catch (error) {
      console.error('Error fetching club details:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && id) {
      fetchClubDetails();
    }
  }, [user, id]);

  const handleUploadProof = async () => {
    // Request permissions
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow access to your photos to upload proof of payment');
        return;
      }
    }

    // Pick image
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setUploading(true);
      try {
        const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
        
        await axios.post(`${API_URL}/api/contributions/upload-proof`, {
          contribution_id: clubData?.current_contribution.id,
          proof_image: base64Image,
          reference_number: clubData?.payment_reference.reference_code,
          user_id: user?.id,  // Authorization: Pass user ID for access control
        });

        Alert.alert('Success', 'Proof of payment uploaded successfully! Your treasurer will confirm shortly.');
        fetchClubDetails(); // Refresh data
      } catch (error: any) {
        Alert.alert('Error', error.response?.data?.detail || 'Failed to upload proof of payment');
      } finally {
        setUploading(false);
      }
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.mediumGreen} />
      </View>
    );
  }

  if (!clubData) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load club details</Text>
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{clubData.group.name}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView>
        {/* Current Contribution Status */}
        <View style={styles.section}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Current Month</Text>
              <StatusPill status={clubData.current_contribution.status} />
            </View>

            <View style={styles.amountRow}>
              <Text style={styles.amountLabel}>Amount Due</Text>
              <Text style={styles.amountValue}>R{clubData.current_contribution.amount_due.toFixed(2)}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.infoRow}>
              <Ionicons name="calendar" size={16} color={Colors.textSecondary} />
              <Text style={styles.infoText}>Due date: {clubData.current_contribution.due_date}</Text>
            </View>

            {clubData.current_contribution.status === 'confirmed' ? (
              <TouchableOpacity style={styles.buttonSecondary}>
                <Ionicons name="checkmark-circle" size={20} color={Colors.mediumGreen} />
                <Text style={styles.buttonSecondaryText}>Payment Confirmed</Text>
              </TouchableOpacity>
            ) : clubData.current_contribution.proof_uploaded ? (
              <View>
                <View style={styles.waitingContainer}>
                  <Ionicons name="time" size={20} color={Colors.gold} />
                  <Text style={styles.waitingText}>Awaiting treasurer confirmation</Text>
                </View>
                <TouchableOpacity
                  style={[styles.buttonOutline, uploading && styles.buttonDisabled]}
                  onPress={handleUploadProof}
                  disabled={uploading}
                >
                  <Ionicons name="refresh" size={18} color={Colors.mediumGreen} />
                  <Text style={styles.buttonOutlineText}>
                    {uploading ? 'Uploading...' : 'Re-upload Proof'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
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
          </View>
        </View>

        {/* Payment Reference */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Payment Reference</Text>
          <View style={[styles.card, styles.referenceCard]}>
            <View style={styles.referenceCodeContainer}>
              <Text style={styles.referenceLabel}>Reference Code</Text>
              <Text style={styles.referenceCode}>{clubData.payment_reference.reference_code}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.bankDetails}>
              <View style={styles.bankDetailRow}>
                <Text style={styles.bankDetailLabel}>Bank</Text>
                <Text style={styles.bankDetailValue}>{clubData.payment_reference.bank_name}</Text>
              </View>
              <View style={styles.bankDetailRow}>
                <Text style={styles.bankDetailLabel}>Account Number</Text>
                <Text style={styles.bankDetailValue}>{clubData.payment_reference.account_number}</Text>
              </View>
              <View style={styles.bankDetailRow}>
                <Text style={styles.bankDetailLabel}>Amount</Text>
                <Text style={styles.bankDetailValue}>R{clubData.payment_reference.amount.toFixed(2)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Payment History */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment History</Text>
          {clubData.payment_history.length > 0 ? (
            clubData.payment_history.map((payment, index) => (
              <View key={index} style={styles.historyCard}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyMonth}>
                    {getMonthName(payment.month)} {payment.year}
                  </Text>
                  <StatusPill status={payment.status} />
                </View>
                <Text style={styles.historyAmount}>R{payment.amount.toFixed(2)}</Text>
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
