import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert, ActivityIndicator, Modal } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { StatusPill } from '../../components/StatusPill';
import { useAuth } from '../../contexts/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';

interface Club {
  id: string;
  name: string;
  contribution_id?: string;
  amount_due: number;
  status: string;
}

interface Proof {
  id: string;
  groupName: string;
  month: string;
  amount: number;
  status: string;
  uploadDate: string;
  hasImage: boolean;
}

export default function ProofOfPaymentsScreen() {
  const { user } = useAuth();
  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
  
  const [showClubModal, setShowClubModal] = useState(false);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loadingClubs, setLoadingClubs] = useState(false);
  const [proofs, setProofs] = useState<Proof[]>([
    {
      id: '1',
      groupName: 'Soshanguve Savings Club',
      month: 'April 2026',
      amount: 500,
      status: 'confirmed',
      uploadDate: '2026-04-05',
      hasImage: true,
    },
    {
      id: '2',
      groupName: 'Mamelodi Burial Society',
      month: 'March 2026',
      amount: 300,
      status: 'proof_uploaded',
      uploadDate: '2026-03-15',
      hasImage: true,
    },
    {
      id: '3',
      groupName: 'Soshanguve Savings Club',
      month: 'March 2026',
      amount: 500,
      status: 'confirmed',
      uploadDate: '2026-03-03',
      hasImage: true,
    },
  ]);

  const fetchClubs = async () => {
    setLoadingClubs(true);
    try {
      const response = await axios.get(`${API_URL}/api/member/dashboard/${user?.id}`);
      // Filter clubs that need payment (pending status)
      const pendingClubs = response.data.clubs
        .filter((club: any) => club.status === 'pending' || club.status === 'due')
        .map((club: any) => ({
          id: club.id,
          name: club.name,
          amount_due: club.monthly_contribution,
          status: club.status,
        }));
      setClubs(pendingClubs);
    } catch (error) {
      console.error('Error fetching clubs:', error);
    } finally {
      setLoadingClubs(false);
    }
  };

  const handleUploadPress = async () => {
    await fetchClubs();
    setShowClubModal(true);
  };

  const handleSelectClub = async (club: Club) => {
    setShowClubModal(false);
    
    // Request permission and pick image
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photo library to upload proof of payment.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setUploading(true);
      try {
        // Get contribution ID for this club
        const clubResponse = await axios.get(`${API_URL}/api/member/club/${club.id}/user/${user?.id}`);
        const contributionId = clubResponse.data.current_contribution?.id;

        if (!contributionId) {
          Alert.alert('Error', 'No pending contribution found for this club.');
          return;
        }

        // Upload proof
        await axios.post(`${API_URL}/api/contributions/upload-proof`, {
          contribution_id: contributionId,
          proof_image: `data:image/jpeg;base64,${result.assets[0].base64}`,
        });

        Alert.alert(
          'Success!',
          `Proof of payment for ${club.name} has been uploaded. Awaiting treasurer confirmation.`,
          [{ text: 'OK' }]
        );

        // Add to local proofs list
        const newProof: Proof = {
          id: Date.now().toString(),
          groupName: club.name,
          month: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
          amount: club.amount_due,
          status: 'proof_uploaded',
          uploadDate: new Date().toISOString().split('T')[0],
          hasImage: true,
        };
        setProofs([newProof, ...proofs]);

      } catch (error) {
        console.error('Upload error:', error);
        Alert.alert('Upload Failed', 'Failed to upload proof of payment. Please try again.');
      } finally {
        setUploading(false);
      }
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Proof of Payments</Text>
        <Text style={styles.headerSubtitle}>All your uploaded payment proofs</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Upload Button */}
        <TouchableOpacity 
          style={styles.uploadButton}
          onPress={handleUploadPress}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <>
              <Ionicons name="cloud-upload" size={24} color={Colors.white} />
              <Text style={styles.uploadButtonText}>Upload Proof of Payment</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Total Uploaded</Text>
              <Text style={styles.summaryValue}>{proofs.length}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Confirmed</Text>
              <Text style={[styles.summaryValue, styles.confirmedValue]}>
                {proofs.filter(p => p.status === 'confirmed').length}
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Pending</Text>
              <Text style={[styles.summaryValue, styles.pendingValue]}>
                {proofs.filter(p => p.status === 'proof_uploaded').length}
              </Text>
            </View>
          </View>
        </View>

        {/* Proofs List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Uploads</Text>

          {proofs.map((proof) => (
            <View key={proof.id} style={styles.proofCard}>
              <View style={styles.proofHeader}>
                <Ionicons name="document-text" size={24} color={Colors.mediumGreen} />
                <View style={styles.proofInfo}>
                  <Text style={styles.proofGroupName}>{proof.groupName}</Text>
                  <Text style={styles.proofMonth}>{proof.month}</Text>
                </View>
                <StatusPill status={proof.status} />
              </View>

              <View style={styles.proofDetails}>
                <View style={styles.proofDetailRow}>
                  <Text style={styles.proofDetailLabel}>Amount:</Text>
                  <Text style={styles.proofDetailValue}>R{proof.amount.toFixed(2)}</Text>
                </View>
                <View style={styles.proofDetailRow}>
                  <Text style={styles.proofDetailLabel}>Uploaded:</Text>
                  <Text style={styles.proofDetailValue}>{new Date(proof.uploadDate).toLocaleDateString()}</Text>
                </View>
              </View>

              {proof.hasImage && (
                <TouchableOpacity style={styles.viewProofButton}>
                  <Ionicons name="eye" size={18} color={Colors.mediumGreen} />
                  <Text style={styles.viewProofText}>View Proof Image</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={24} color={Colors.mediumGreen} />
          <View style={styles.infoText}>
            <Text style={styles.infoTitle}>About Proof of Payments</Text>
            <Text style={styles.infoBody}>
              Upload proof after making each payment. Your treasurer will review and confirm. Keep records of all confirmed payments for your financial history.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Club Selection Modal */}
      <Modal
        visible={showClubModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowClubModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Club</Text>
              <TouchableOpacity onPress={() => setShowClubModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Choose which club to upload proof for</Text>

            {loadingClubs ? (
              <ActivityIndicator size="large" color={Colors.mediumGreen} style={{ marginVertical: 20 }} />
            ) : clubs.length === 0 ? (
              <View style={styles.noClubsContainer}>
                <Ionicons name="checkmark-circle" size={48} color={Colors.mediumGreen} />
                <Text style={styles.noClubsText}>All payments are up to date!</Text>
                <Text style={styles.noClubsSubtext}>No pending payments to upload proof for.</Text>
              </View>
            ) : (
              <ScrollView style={styles.clubList}>
                {clubs.map((club) => (
                  <TouchableOpacity
                    key={club.id}
                    style={styles.clubItem}
                    onPress={() => handleSelectClub(club)}
                  >
                    <View style={styles.clubIcon}>
                      <Ionicons name="people" size={24} color={Colors.mediumGreen} />
                    </View>
                    <View style={styles.clubInfo}>
                      <Text style={styles.clubName}>{club.name}</Text>
                      <Text style={styles.clubAmount}>Amount Due: R{club.amount_due.toFixed(2)}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
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
  confirmedValue: {
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
  proofCard: {
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 12,
  },
  proofHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  proofInfo: {
    flex: 1,
  },
  proofGroupName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  proofMonth: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  proofDetails: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
    marginBottom: 12,
  },
  proofDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  proofDetailLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  proofDetailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  viewProofButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
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
  infoBox: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    marginHorizontal: 24,
    marginTop: 16,
    marginBottom: 24,
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
  uploadButton: {
    backgroundColor: Colors.gold,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: 24,
    marginTop: 16,
    paddingVertical: 16,
    borderRadius: 12,
  },
  uploadButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  clubList: {
    paddingHorizontal: 24,
  },
  clubItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.lightBackground,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  clubIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  clubInfo: {
    flex: 1,
  },
  clubName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  clubAmount: {
    fontSize: 14,
    color: Colors.gold,
    fontWeight: '500',
  },
  noClubsContainer: {
    alignItems: 'center',
    padding: 32,
  },
  noClubsText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.mediumGreen,
    marginTop: 16,
  },
  noClubsSubtext: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
});
