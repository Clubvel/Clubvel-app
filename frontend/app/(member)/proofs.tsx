import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert, ActivityIndicator, Modal } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { StatusPill } from '../../components/StatusPill';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
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
  contribution_id: string;
  groupName: string;
  month: string;
  amount: number;
  status: string;
  uploadDate: string;
  hasImage: boolean;
}

export default function ProofOfPaymentsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
  
  const [showClubModal, setShowClubModal] = useState(false);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loadingClubs, setLoadingClubs] = useState(false);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [viewingProof, setViewingProof] = useState<string | null>(null);
  const [proofImage, setProofImage] = useState<string | null>(null);
  const [loadingProof, setLoadingProof] = useState(false);

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
      setClubs([]);
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
          reference_number: '',
          user_id: user?.id,
        });

        Alert.alert(
          'Success!',
          `Proof of payment for ${club.name} has been uploaded. Awaiting admin confirmation.`,
          [{ text: 'OK' }]
        );

        // Add to local proofs list
        const newProof: Proof = {
          id: Date.now().toString(),
          contribution_id: contributionId,
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

  const handleViewProof = async (proof: Proof) => {
    if (!proof.contribution_id) {
      Alert.alert('Error', 'Cannot view proof - contribution ID not found');
      return;
    }

    setLoadingProof(true);
    setViewingProof(proof.id);
    
    try {
      const response = await axios.get(
        `${API_URL}/api/contributions/${proof.contribution_id}/proof?user_id=${user?.id}`
      );
      setProofImage(response.data.proof_image);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to load proof image');
      setViewingProof(null);
    } finally {
      setLoadingProof(false);
    }
  };

  const handleDownloadProof = async () => {
    if (!proofImage) return;

    try {
      // Check if sharing is available
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Error', 'Sharing is not available on this device');
        return;
      }

      // Save to file system and share
      const filename = `proof_${Date.now()}.jpg`;
      const fileUri = FileSystem.documentDirectory + filename;
      
      // Remove data URL prefix if present
      const base64Data = proofImage.replace(/^data:image\/\w+;base64,/, '');
      
      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await Sharing.shareAsync(fileUri, {
        mimeType: 'image/jpeg',
        dialogTitle: 'Save Proof of Payment',
      });
    } catch (error) {
      console.error('Download error:', error);
      Alert.alert('Error', 'Failed to download proof image');
    }
  };

  return (
    <View style={styles.container}>
      {/* Header with Profile Photo */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Proof of Payments</Text>
          <Text style={styles.headerSubtitle}>Upload and view your payment proofs</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(member)/profile')} style={styles.profileButton}>
          {user?.profile_photo ? (
            <Image source={{ uri: user.profile_photo }} style={styles.profileImage} />
          ) : (
            <View style={styles.profilePlaceholder}>
              <Ionicons name="person" size={20} color={Colors.white} />
            </View>
          )}
        </TouchableOpacity>
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

          {proofs.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyStateText}>No proofs uploaded yet</Text>
              <Text style={styles.emptyStateSubtext}>Tap the button above to upload your first proof</Text>
            </View>
          ) : (
            proofs.map((proof) => (
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
                  <View style={styles.proofActions}>
                    <TouchableOpacity 
                      style={styles.viewProofButton}
                      onPress={() => handleViewProof(proof)}
                    >
                      <Ionicons name="eye" size={18} color={Colors.mediumGreen} />
                      <Text style={styles.viewProofText}>View Proof</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))
          )}
        </View>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={24} color={Colors.mediumGreen} />
          <View style={styles.infoText}>
            <Text style={styles.infoTitle}>About Proof of Payments</Text>
            <Text style={styles.infoBody}>
              Upload proof after making each payment. Your club admin will review and confirm. You can download any uploaded proof for your records.
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

      {/* View Proof Modal */}
      <Modal
        visible={viewingProof !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setViewingProof(null);
          setProofImage(null);
        }}
      >
        <View style={styles.proofModalOverlay}>
          <View style={styles.proofModalContent}>
            <View style={styles.proofModalHeader}>
              <Text style={styles.proofModalTitle}>Proof of Payment</Text>
              <TouchableOpacity onPress={() => {
                setViewingProof(null);
                setProofImage(null);
              }}>
                <Ionicons name="close" size={28} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {loadingProof ? (
              <View style={styles.proofLoading}>
                <ActivityIndicator size="large" color={Colors.mediumGreen} />
                <Text style={styles.proofLoadingText}>Loading proof image...</Text>
              </View>
            ) : proofImage ? (
              <>
                <Image 
                  source={{ uri: proofImage }} 
                  style={styles.proofImageDisplay}
                  resizeMode="contain"
                />
                <TouchableOpacity 
                  style={styles.downloadButton}
                  onPress={handleDownloadProof}
                >
                  <Ionicons name="download" size={20} color={Colors.white} />
                  <Text style={styles.downloadButtonText}>Download / Share</Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.proofLoading}>
                <Ionicons name="image-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.proofLoadingText}>No proof image available</Text>
              </View>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flex: 1,
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
  emptyState: {
    backgroundColor: Colors.white,
    padding: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
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
  proofActions: {
    flexDirection: 'row',
    gap: 12,
  },
  viewProofButton: {
    flex: 1,
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
  // Proof View Modal Styles
  proofModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    padding: 20,
  },
  proofModalContent: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    overflow: 'hidden',
    maxHeight: '85%',
  },
  proofModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  proofModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  proofLoading: {
    padding: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proofLoadingText: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.textSecondary,
  },
  proofImageDisplay: {
    width: '100%',
    height: 400,
    backgroundColor: Colors.lightBackground,
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.mediumGreen,
    margin: 16,
    paddingVertical: 14,
    borderRadius: 12,
  },
  downloadButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
