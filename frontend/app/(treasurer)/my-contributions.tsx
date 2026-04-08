import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { StatusPill } from '../../components/StatusPill';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';

interface MyContribution {
  id: string;
  group_name: string;
  group_id: string;
  month: string;
  amount_due: number;
  status: string;
  due_date: string;
  proof_uploaded: boolean;
  payment_reference: string;
}

export default function MyContributionsScreen() {
  const { user } = useAuth();
  const [contributions, setContributions] = useState<MyContribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);

  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

  useEffect(() => {
    fetchMyContributions();
  }, []);

  const fetchMyContributions = async () => {
    try {
      // Mock data for now - in production this would fetch treasurer's personal contributions
      const mockContributions: MyContribution[] = [
        {
          id: 'contrib1',
          group_name: 'Soshanguve Savings Club',
          group_id: 'group1',
          month: 'April 2026',
          amount_due: 500,
          status: 'confirmed',
          due_date: '2026-04-05',
          proof_uploaded: true,
          payment_reference: 'SSH003',
        },
        {
          id: 'contrib2',
          group_name: 'Mamelodi Investment Group',
          group_id: 'group3',
          month: 'April 2026',
          amount_due: 800,
          status: 'pending',
          due_date: '2026-04-10',
          proof_uploaded: false,
          payment_reference: 'MIG001',
        },
      ];
      setContributions(mockContributions);
    } catch (error) {
      console.error('Error fetching contributions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadProof = async (contributionId: string, groupId: string) => {
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
      setUploading(contributionId);
      try {
        const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
        
        await axios.post(`${API_URL}/api/contributions/upload-proof`, {
          contribution_id: contributionId,
          proof_image: base64Image,
          reference_number: contributions.find(c => c.id === contributionId)?.payment_reference,
        });

        Alert.alert('Success', 'Proof of payment uploaded successfully!');
        fetchMyContributions(); // Refresh data
      } catch (error: any) {
        Alert.alert('Error', error.response?.data?.detail || 'Failed to upload proof of payment');
      } finally {
        setUploading(null);
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

  const pendingContributions = contributions.filter(c => c.status !== 'confirmed');
  const completedContributions = contributions.filter(c => c.status === 'confirmed');

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Contributions</Text>
        <Text style={styles.headerSubtitle}>Your personal payments as a member</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Total Clubs</Text>
              <Text style={styles.summaryValue}>{contributions.length}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Paid</Text>
              <Text style={[styles.summaryValue, styles.paidValue]}>{completedContributions.length}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Pending</Text>
              <Text style={[styles.summaryValue, styles.pendingValue]}>{pendingContributions.length}</Text>
            </View>
          </View>
        </View>

        {/* Pending Contributions */}
        {pendingContributions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pending Payments</Text>

            {pendingContributions.map((contribution) => (
              <View key={contribution.id} style={styles.contributionCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <Text style={styles.groupName}>{contribution.group_name}</Text>
                    <Text style={styles.month}>{contribution.month}</Text>
                  </View>
                  <StatusPill status={contribution.status} />
                </View>

                <View style={styles.cardBody}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Amount Due:</Text>
                    <Text style={styles.detailValue}>R{contribution.amount_due.toFixed(2)}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Due Date:</Text>
                    <Text style={styles.detailValue}>{new Date(contribution.due_date).toLocaleDateString()}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Reference:</Text>
                    <Text style={styles.detailValue}>{contribution.payment_reference}</Text>
                  </View>
                </View>

                {!contribution.proof_uploaded ? (
                  <TouchableOpacity
                    style={[styles.uploadButton, uploading === contribution.id && styles.uploadButtonDisabled]}
                    onPress={() => handleUploadProof(contribution.id, contribution.group_id)}
                    disabled={uploading === contribution.id}
                  >
                    <Ionicons name="camera" size={20} color={Colors.white} />
                    <Text style={styles.uploadButtonText}>
                      {uploading === contribution.id ? 'Uploading...' : 'Upload Proof of Payment'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.uploadedBanner}>
                    <Ionicons name="time" size={20} color={Colors.gold} />
                    <Text style={styles.uploadedText}>Proof uploaded - Awaiting confirmation</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Completed Contributions */}
        {completedContributions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Completed Payments</Text>

            {completedContributions.map((contribution) => (
              <View key={contribution.id} style={[styles.contributionCard, styles.completedCard]}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <Text style={styles.groupName}>{contribution.group_name}</Text>
                    <Text style={styles.month}>{contribution.month}</Text>
                  </View>
                  <StatusPill status={contribution.status} />
                </View>

                <View style={styles.cardBody}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Amount Paid:</Text>
                    <Text style={styles.detailValue}>R{contribution.amount_due.toFixed(2)}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Reference:</Text>
                    <Text style={styles.detailValue}>{contribution.payment_reference}</Text>
                  </View>
                </View>

                <View style={styles.confirmedBanner}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.statusPaid} />
                  <Text style={styles.confirmedText}>Payment confirmed</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={24} color={Colors.mediumGreen} />
          <View style={styles.infoText}>
            <Text style={styles.infoTitle}>About Your Contributions</Text>
            <Text style={styles.infoBody}>
              This tab shows your personal payments for clubs where you're a regular member. Upload proof after paying, and another treasurer will confirm your payment.
            </Text>
          </View>
        </View>

        {/* Advertisement */}
        <View style={styles.adContainer}>
          <Text style={styles.adLabel}>Sponsored</Text>
          <View style={styles.adCard}>
            <Text style={styles.adTitle}>Build your savings with us</Text>
            <Text style={styles.adBody}>
              Get up to 10% interest on your personal savings. Start with just R50. No monthly fees.
            </Text>
          </View>
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
  header: {
    backgroundColor: Colors.mediumGreen,
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 24,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.white,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  summaryCard: {
    backgroundColor: Colors.white,
    marginHorizontal: 24,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: Colors.cardBorder,
  },
  summaryLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  paidValue: {
    color: Colors.statusPaid,
  },
  pendingValue: {
    color: Colors.gold,
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
  contributionCard: {
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 12,
  },
  completedCard: {
    opacity: 0.8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flex: 1,
    marginRight: 12,
  },
  groupName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  month: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  cardBody: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.gold,
    paddingVertical: 12,
    borderRadius: 8,
  },
  uploadButtonDisabled: {
    opacity: 0.6,
  },
  uploadButtonText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: 'bold',
  },
  uploadedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.lightGold,
    paddingVertical: 12,
    borderRadius: 8,
  },
  uploadedText: {
    color: Colors.gold,
    fontSize: 13,
    fontWeight: '600',
  },
  confirmedBanner: {
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
  infoBox: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    marginHorizontal: 24,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    gap: 12,
  },
  infoText: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.mediumGreen,
    marginBottom: 6,
  },
  infoBody: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  adContainer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
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
});
