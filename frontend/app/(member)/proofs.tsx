import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { StatusPill } from '../../components/StatusPill';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'expo-router';
import { AdBanner } from '../../components/AdBanner';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import axios from 'axios';

interface Club {
  id: string;
  name: string;
  contribution_id?: string;
  amount_due: number;
  status: string | null;
  group_type: string;
  contribution_mode: string;
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
  const { user, token } = useAuth();
  const router = useRouter();
  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
  
  const [showClubModal, setShowClubModal] = useState(false);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [selectedFlexibleClub, setSelectedFlexibleClub] = useState<Club | null>(null);
  const [flexibleAmount, setFlexibleAmount] = useState('');
  const [uploading, setUploading] = useState(false);
  const [loadingClubs, setLoadingClubs] = useState(false);
  const [proofs, setProofs] = useState<Proof[]>([]); // uploads made in this session; never presented as complete history
  const [viewingProof, setViewingProof] = useState<string | null>(null);
  const [proofImage, setProofImage] = useState<string | null>(null);
  const [proofMimeType, setProofMimeType] = useState<string>('image/jpeg');
  const [proofFileName, setProofFileName] = useState<string | null>(null);
  const [loadingProof, setLoadingProof] = useState(false);

  const fetchClubs = async () => {
    setLoadingClubs(true);
    try {
      const response = await axios.get(`${API_URL}/api/member/dashboard/${user?.id}`);
      const availableClubs = response.data.clubs.map((club: any) => ({
        id: club.id,
        name: club.name,
        amount_due: Number(club.monthly_contribution) || 0,
        status: club.status ?? null,
        group_type: club.group_type,
        contribution_mode: club.contribution_mode,
      }));
      setClubs(availableClubs);
    } catch (error) {
      console.error('Error fetching clubs:', error);
      setClubs([]);
    } finally {
      setLoadingClubs(false);
    }
  };

  const handleUploadPress = async () => {
    setShowClubModal(true);
    await fetchClubs();
  };

  const uploadProofForClub = async (
    club: Club,
    contributionId?: string,
    contributionAmount?: number
  ) => {
    setShowClubModal(false);

    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];

      if (asset.size && asset.size > 5 * 1024 * 1024) {
        Alert.alert('File Too Large', 'Please select a proof of payment smaller than 5 MB.');
        return;
      }

      const mimeType =
        asset.mimeType ||
        (asset.name?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const proofData = `data:${mimeType};base64,${base64}`;

      setUploading(true);
      try {
        let resolvedContributionId = contributionId;

        if (!resolvedContributionId) {
          const clubResponse = await axios.get(
            `${API_URL}/api/member/club/${club.id}/user/${user?.id}`
          );
          resolvedContributionId = clubResponse.data.current_contribution?.id;
        }

        if (!resolvedContributionId) {
          Alert.alert('Error', 'No pending contribution found for this group.');
          return;
        }

        await axios.post(`${API_URL}/api/contributions/upload-proof`, {
          contribution_id: resolvedContributionId,
          proof_image: proofData,
          proof_mime_type: mimeType,
          proof_file_name: asset.name || null,
          reference_number: '',
          user_id: user?.id,
        });

        Alert.alert(
          'Success!',
          `Proof of payment for ${club.name} has been uploaded. Awaiting admin confirmation.`,
          [{ text: 'OK' }]
        );

        const newProof: Proof = {
          id: Date.now().toString(),
          contribution_id: resolvedContributionId,
          groupName: club.name,
          month: new Date().toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric',
          }),
          amount: contributionAmount ?? club.amount_due,
          status: 'proof_uploaded',
          uploadDate: new Date().toISOString().split('T')[0],
          hasImage: true,
        };

        setProofs(current => [newProof, ...current]);
      } catch (error: any) {
        console.error('Upload error:', error);
        Alert.alert(
          'Upload Failed',
          error.response?.data?.detail || 'Failed to upload proof of payment. Please try again.'
        );
      } finally {
        setUploading(false);
      }
    }
  };

  const handleSelectClub = async (club: Club) => {
    const isFlexible =
      club.contribution_mode === 'flexible_goal' ||
      club.group_type === 'travel';

    if (isFlexible) {
      setShowClubModal(false);
      setSelectedFlexibleClub(club);
      setFlexibleAmount('');
      return;
    }

    await uploadProofForClub(club);
  };

  const handleFlexibleContribution = async () => {
    if (!selectedFlexibleClub || !token) {
      Alert.alert('Error', 'Please sign in again and retry.');
      return;
    }

    const amount = Number(flexibleAmount.replace(',', '.'));

    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter the amount you paid.');
      return;
    }

    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    const asset = result.assets[0];

    if (asset.size && asset.size > 5 * 1024 * 1024) {
      Alert.alert('File Too Large', 'Please select a proof of payment smaller than 5 MB.');
      return;
    }

    const mimeType =
      asset.mimeType ||
      (asset.name?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

    const base64 = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const proofData = `data:${mimeType};base64,${base64}`;

    setUploading(true);

    try {
      const club = selectedFlexibleClub;

      const response = await axios.post(
        `${API_URL}/api/member/contributions/flexible`,
        {
          group_id: club.id,
          amount,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const contributionId = response.data.contribution_id;

      await axios.post(`${API_URL}/api/contributions/upload-proof`, {
        contribution_id: contributionId,
        proof_image: proofData,
        proof_mime_type: mimeType,
        proof_file_name: asset.name || null,
        reference_number: '',
        user_id: user?.id,
      });

      setSelectedFlexibleClub(null);
      setFlexibleAmount('');

      Alert.alert(
        'Success!',
        `Proof of payment for ${club.name} has been uploaded. Awaiting admin confirmation.`,
        [{ text: 'OK' }]
      );

      const newProof: Proof = {
        id: Date.now().toString(),
        contribution_id: contributionId,
        groupName: club.name,
        month: new Date().toLocaleDateString('en-US', {
          month: 'long',
          year: 'numeric',
        }),
        amount,
        status: 'proof_uploaded',
        uploadDate: new Date().toISOString().split('T')[0],
        hasImage: true,
      };

      setProofs(current => [newProof, ...current]);
    } catch (error: any) {
      console.error('Flexible contribution error:', error);
      Alert.alert(
        'Upload Failed',
        error.response?.data?.detail ||
          'Could not record and upload this proof of payment. Please try again.'
      );
    } finally {
      setUploading(false);
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
      const proofData = response.data.proof_image;
      const mimeType =
        response.data.proof_mime_type ||
        (proofData?.startsWith('data:application/pdf') ? 'application/pdf' : 'image/jpeg');

      setProofMimeType(mimeType);
      setProofFileName(response.data.proof_file_name || null);

      if (mimeType === 'application/pdf') {
        const isAvailable = await Sharing.isAvailableAsync();
        if (!isAvailable) {
          Alert.alert('Error', 'Opening PDF files is not available on this device.');
          setViewingProof(null);
          return;
        }

        const base64Data = proofData.replace(/^data:application\/pdf;base64,/, '');
        const fileUri = FileSystem.documentDirectory + `proof_${Date.now()}.pdf`;

        await FileSystem.writeAsStringAsync(fileUri, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });

        setViewingProof(null);

        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Open Proof of Payment',
        });
        return;
      }

      setProofImage(proofData);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to load proof of payment');
      setViewingProof(null);
    } finally {
      setLoadingProof(false);
    }
  };

  const handleDownloadProof = async () => {
    if (!proofImage) return;

    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Error', 'Sharing is not available on this device');
        return;
      }

      const isPdf =
        proofMimeType === 'application/pdf' ||
        proofImage.startsWith('data:application/pdf');

      const extension = isPdf ? 'pdf' : 'jpg';
      const filename = proofFileName || `proof_${Date.now()}.${extension}`;
      const fileUri = FileSystem.documentDirectory + filename;

      const base64Data = proofImage.replace(/^data:[^;]+;base64,/, '');

      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await Sharing.shareAsync(fileUri, {
        mimeType: isPdf ? 'application/pdf' : proofMimeType,
        dialogTitle: 'Save Proof of Payment',
      });
    } catch (error) {
      console.error('Download error:', error);
      Alert.alert('Error', 'Failed to save proof of payment');
    }
  };

  return (
    <View style={styles.container}>
      {/* Header with Profile Photo */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Proof of Payments</Text>
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
              <Text style={styles.summaryLabel}>This Session</Text>
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
          <Text style={styles.sectionTitle}>Uploads This Session</Text>

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
              Upload proof against a specific current group contribution. Your club admin can then review that recorded contribution.
            </Text>
          </View>
        </View>
        
        {/* Ad Banner */}
        <AdBanner size="banner" />
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
              <Text style={styles.modalTitle}>Select Group</Text>
              <TouchableOpacity onPress={() => setShowClubModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Choose which Group to upload proof for</Text>

            {loadingClubs ? (
              <ActivityIndicator size="large" color={Colors.mediumGreen} style={{ marginVertical: 20 }} />
            ) : clubs.length === 0 ? (
              <View style={styles.noClubsContainer}>
                <Ionicons name="checkmark-circle" size={48} color={Colors.mediumGreen} />
                <Text style={styles.noClubsText}>No Groups available</Text>
                <Text style={styles.noClubsSubtext}>You do not have an active Group available for proof upload.</Text>
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
                      <Text style={styles.clubAmount}>
                        {club.contribution_mode === 'flexible_goal' || club.group_type === 'travel'
                          ? 'Enter amount paid'
                          : `Amount Due: R${club.amount_due.toFixed(2)}`}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Flexible / Travel Contribution Amount Modal */}
      <Modal
        visible={selectedFlexibleClub !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setSelectedFlexibleClub(null);
          setFlexibleAmount('');
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Amount Paid</Text>
              <TouchableOpacity
                onPress={() => {
                  setSelectedFlexibleClub(null);
                  setFlexibleAmount('');
                }}
              >
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Enter the amount you paid to {selectedFlexibleClub?.name}.
            </Text>

            <View style={styles.amountInputContainer}>
              <Text style={styles.currencyPrefix}>R</Text>
              <TextInput
                style={styles.amountInput}
                value={flexibleAmount}
                onChangeText={setFlexibleAmount}
                placeholder="0.00"
                keyboardType="decimal-pad"
                editable={!uploading}
              />
            </View>

            <TouchableOpacity
              style={styles.continueButton}
              onPress={handleFlexibleContribution}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.continueButtonText}>Continue to Upload Proof</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
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
    alignItems: 'flex-end',
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: Colors.cardBorder,
    alignSelf: 'stretch',
  },
  summaryLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 6,
    textAlign: 'center',
    minHeight: 32,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    textAlign: 'center',
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
    backgroundColor: Colors.primary,
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
    marginBottom: 16,
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
  amountInputContainer: {
    marginHorizontal: 24,
    marginBottom: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 12,
    backgroundColor: Colors.white,
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencyPrefix: {
    fontSize: 18,
    color: Colors.textPrimary,
    marginRight: 4,
  },
  amountInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 18,
    color: Colors.textPrimary,
  },
  continueButton: {
    marginHorizontal: 24,
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
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
