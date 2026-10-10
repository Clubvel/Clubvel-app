import { paymentStateLabel, paymentMoney } from '../../services/paymentSummaryRecords';
import ProfilePhotoViewer from '../../components/ProfilePhotoViewer';
import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform, RefreshControl } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { StatusPill } from '../../components/StatusPill';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
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
  paymentState?: string;
  historicalOnly?: boolean;
  confirmedAmount?: number | null;
  recordedAmount?: number | null;
  remainingAmount?: number | null;
  status: string;
  uploadDate: string | null;
  hasImage: boolean;
  groupId: string;
  proofVersion: string | null;
  declineReason: string | null;
  canDelete: boolean;
}

export default function ProofOfPaymentsScreen() {
  const [photoExpanded, setPhotoExpanded] = React.useState(false);
  const { user, token } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ group_id?: string; month?: string; year?: string; contribution_id?: string }>();
  const [selectedGroup, setSelectedGroup] = useState(params.group_id || "");
  const [period, setPeriod] = useState(() => ({ month: Number(params.month) || new Date().getMonth() + 1, year: Number(params.year) || new Date().getFullYear() }));
  const [records, setRecords] = useState<any[]>([]);
  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
  
  const [showClubModal, setShowClubModal] = useState(false);
  const [clubsOwner, setClubsOwner] = useState<string | null>(null);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [selectedFlexibleClub, setSelectedFlexibleClub] = useState<Club | null>(null);
  const [flexibleAmount, setFlexibleAmount] = useState('');
  const [uploading, setUploading] = useState(false);
  const [loadingClubs, setLoadingClubs] = useState(false);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [loadedProofContext, setLoadedProofContext] = useState<string | null>(null);
  const currentRecords = loadedProofContext === `${user?.id}:${token}` ? records : [];
  const selectedRecords = currentRecords.filter(record => (!selectedGroup || record.group_id === selectedGroup) && record.month === period.month && record.year === period.year);
  const currentProofs = loadedProofContext === `${user?.id}:${token}` ? proofs.filter(proof => (!selectedGroup || proof.groupId === selectedGroup) && proof.month === new Date(period.year, period.month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })) : [];
  const [proofFilter, setProofFilter] = useState<'all' | 'confirmed' | 'proof_uploaded'>('all');
  const confirmedProofs = currentProofs.filter(p => ['confirmed', 'paid'].includes(p.status));
  const pendingProofs = currentProofs.filter(p => p.status === 'proof_uploaded');
  const visibleProofs = proofFilter === 'confirmed' ? confirmedProofs : proofFilter === 'proof_uploaded' ? pendingProofs : currentProofs;
  const [proofsLoading, setProofsLoading] = useState(true);
  const [proofsError, setProofsError] = useState<string | null>(null);
  const [deletingProof, setDeletingProof] = useState<string | null>(null);
  const [viewingProof, setViewingProof] = useState<string | null>(null);
  const [viewerOwner, setViewerOwner] = useState<string | null>(null);
  const [proofImage, setProofImage] = useState<string | null>(null);
  const [proofMimeType, setProofMimeType] = useState<string>('image/jpeg');
  const [proofFileName, setProofFileName] = useState<string | null>(null);
  const [loadingProof, setLoadingProof] = useState(false);

  const proofRequest = useRef<{ key: string; sequence: number } | null>(null);
  const proofSequence = useRef(0);
  const requestContext = `${user?.id}:${token}`;
  const latestContext = useRef(requestContext);
  latestContext.current = requestContext;
  const actionContext = `${requestContext}:${selectedGroup}:${period.year}:${period.month}`;
  const latestAction = useRef(actionContext);
  latestAction.current = actionContext;
  React.useEffect(() => { setProofImage(null); setViewingProof(null); }, [actionContext]);
  React.useEffect(() => { setSelectedGroup(params.group_id || ""); if (params.month && params.year) setPeriod({ month: Number(params.month), year: Number(params.year) }); }, [params.group_id, params.month, params.year]);
  React.useEffect(() => { setShowClubModal(false); setSelectedFlexibleClub(null); setProofImage(null); setViewingProof(null); setClubs([]); }, [requestContext]);

  const fetchProofs = useCallback(async (force = false) => {
    if (!user?.id || !token) return;
    const key = `${user?.id}:${token}`;
    if (!force && proofRequest.current?.key === key) return;
    const sequence = ++proofSequence.current;
    proofRequest.current = { key, sequence };
    setProofsLoading(true);
    setProofsError(null);
    try {
      const response = await axios.get(`${API_URL}/api/member/contributions/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 15000
      });
      if (sequence !== proofSequence.current || latestContext.current !== key) return;
      if (!Array.isArray(response.data.contributions) || response.data.contributions.some((record: any) => !record.contribution_id || !record.group_id)) throw new Error("Invalid contribution response");
      setRecords(response.data.contributions);
      setLoadedProofContext(key);
      setProofs(response.data.contributions.filter((record: any) => record.proof_uploaded && !record.proof_dismissed).map((record: any) => ({
        id: record.contribution_id,
        contribution_id: record.contribution_id,
        groupId: record.group_id,
        groupName: record.group_name,
        month: new Date(record.year, record.month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        amount: record.amount_due,
        paymentState: record.payment_state,
        historicalOnly: record.historical_only,
        confirmedAmount: record.confirmed_amount,
        recordedAmount: record.amount_paid,
        remainingAmount: record.outstanding_amount,
        status: record.payment_state === 'confirmed' ? 'confirmed' : record.payment_state === 'awaiting_confirmation' ? 'proof_uploaded' : record.proof_review_status === 'declined' ? 'proof_declined' : record.contribution_status || record.status,
        uploadDate: record.payment_date,
        hasImage: !record.historical_only,
        proofVersion: record.proof_version,
        declineReason: record.proof_decline_reason,
        canDelete: record.proof_delete_eligible
      })));
    } catch (error: any) {
      if (sequence !== proofSequence.current || latestContext.current !== key) return;
      setProofsError(error.response?.data?.detail || 'Unable to load proofs. Please try again.');
    } finally {
      if (proofRequest.current?.sequence === sequence) {
        proofRequest.current = null;
        setProofsLoading(false);
      }
    }
  }, [API_URL, user?.id, token]);

  useFocusEffect(useCallback(() => { void fetchProofs(); }, [fetchProofs]));

  const handleDeleteProof = (proof: Proof) => {
    const context = latestAction.current;
    Alert.alert('Delete Pending Proof', 'Remove this proof? Your contribution will remain unpaid.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        if (latestAction.current !== context) return;
        if (deletingProof) return;
        setDeletingProof(proof.contribution_id);
        try {
          await axios.delete(`${API_URL}/api/contributions/${proof.contribution_id}/proof`, {
            data: { proof_version: proof.proofVersion },
            headers: { Authorization: `Bearer ${token}` }
          });
          if (latestAction.current !== context) return;
          await fetchProofs(true);
        } catch (error: any) {
          if (latestAction.current !== context) return;
          Alert.alert('Error', error.response?.data?.detail || 'Failed to delete pending proof');
        } finally {
          setDeletingProof(null);
        }
      } }
    ]);
  };

  const removeDeclinedProof = (proof: Proof) => {
    const context = latestAction.current;
    Alert.alert('Remove declined proof', 'Remove this declined proof from your view? Its review history is retained and you can still upload a replacement.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        if (latestAction.current !== context) return;
        if (deletingProof) return;
        setDeletingProof(proof.contribution_id);
        try {
          await axios.post(`${API_URL}/api/contributions/${proof.contribution_id}/proof/dismiss`,
            { proof_version: proof.proofVersion }, {
              headers: { Authorization: `Bearer ${token}` }, timeout: 15000,
            });
          if (latestAction.current !== context) return;
          await fetchProofs(true);
        } catch {
          if (latestAction.current !== context) return;
          Alert.alert('Unable to remove proof', 'Please refresh and try again. Your contribution has not been changed.');
        } finally { setDeletingProof(null); }
      } },
    ]);
  };

  const fetchClubs = async () => {
    const context = latestContext.current;
    setClubsOwner(context);
    setClubs([]);
    setLoadingClubs(true);
    try {
      const response = await axios.get(`${API_URL}/api/member/dashboard/${user?.id}`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 15000,
      });
      if (latestContext.current !== context) return;
      const availableClubs = response.data.clubs.map((club: any) => ({
        id: club.id,
        name: club.name,
        amount_due: club.monthly_contribution,
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
    const selected = selectedRecords.find(record => record.contribution_id === params.contribution_id && record.proof_eligible && !record.historical_only);
    if (selected) { await uploadProofForClub({ id: selected.group_id, name: selected.group_name, amount_due: selected.amount_due }, selected.contribution_id); return; }
    setShowClubModal(true);
    await fetchClubs();
  };

  const uploadProofForClub = async (
    club: Pick<Club, 'id' | 'name' | 'amount_due'>,
    contributionId?: string
  ) => {
    const uploadContext = latestAction.current;
    const actor = user?.id;
    const sessionToken = token;
    const target = currentRecords.find(record => record.contribution_id === contributionId && record.group_id === club.id);
    if (!target || !target.proof_eligible || target.historical_only || !actor || !sessionToken) return;
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
        if (latestAction.current !== uploadContext) return;
        const resolvedContributionId = target.contribution_id;

        await axios.post(`${API_URL}/api/contributions/upload-proof`, {
          contribution_id: resolvedContributionId,
          proof_image: proofData,
          proof_mime_type: mimeType,
          proof_file_name: asset.name || null,
          reference_number: target.payment_reference || '',
          user_id: actor,
        }, { headers: { Authorization: `Bearer ${sessionToken}` } });

        if (latestAction.current !== uploadContext) return;
        Alert.alert(
          'Success!',
          `Proof of payment for ${club.name} has been uploaded. Awaiting admin confirmation.`,
          [{ text: 'OK' }]
        );

        await fetchProofs(true);
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

    setSelectedGroup(club.id);
    setShowClubModal(false);
    Alert.alert("Select contribution", "Choose the recorded contribution below before uploading proof.");
  };

  const handleFlexibleContribution = async () => {
    if (!selectedFlexibleClub || !token) {
      Alert.alert('Error', 'Please sign in again and retry.');
      return;
    }

    const uploadContext = latestAction.current;
    const actor = user?.id;
    const sessionToken = token;
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
      if (latestAction.current !== uploadContext) return;
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

      if (latestAction.current !== uploadContext) return;
      const contributionId = response.data.contribution_id;

      await axios.post(`${API_URL}/api/contributions/upload-proof`, {
        contribution_id: contributionId,
        proof_image: proofData,
        proof_mime_type: mimeType,
        proof_file_name: asset.name || null,
        reference_number: '',
        user_id: actor,
      }, { headers: { Authorization: `Bearer ${sessionToken}` } });

      if (latestAction.current !== uploadContext) return;
      setSelectedFlexibleClub(null);
      setFlexibleAmount('');

      Alert.alert(
        'Success!',
        `Proof of payment for ${club.name} has been uploaded. Awaiting admin confirmation.`,
        [{ text: 'OK' }]
      );

      await fetchProofs(true);
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

    const viewContext = latestAction.current;
    setViewerOwner(viewContext);
    setLoadingProof(true);
    setViewingProof(proof.id);
    
    try {
      const response = await axios.get(
        `${API_URL}/api/contributions/${proof.contribution_id}/proof?user_id=${user?.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (latestAction.current !== viewContext) return;
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

        if (latestAction.current !== viewContext) return;
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
      <ProfilePhotoViewer visible={photoExpanded} photoUri={user?.profile_photo} displayName={user?.full_name} onClose={() => setPhotoExpanded(false)} />
      {/* Header with Profile Photo */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => user?.profile_photo ? setPhotoExpanded(true) : router.push('/(member)/profile')} style={styles.profileButton}>
          {user?.profile_photo ? (
            <Image source={{ uri: user.profile_photo }} style={styles.profileImage} resizeMode="cover" />
          ) : (
            <View style={styles.profilePlaceholder}>
              <Ionicons name="person" size={32} color={Colors.white} />
            </View>
          )}
        </TouchableOpacity>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Proof of Payments</Text>
        </View>
      
      </View>

      <ScrollView style={styles.content} refreshControl={<RefreshControl refreshing={proofsLoading} onRefresh={() => void fetchProofs()} />}>
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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contributions</Text>
          <ScrollView horizontal><TouchableOpacity accessibilityLabel="All contribution clubs" onPress={() => setSelectedGroup("")}><Text>All clubs</Text></TouchableOpacity>{Array.from(new Map(currentRecords.map(record => [record.group_id, record])).values()).map(record => <TouchableOpacity key={record.group_id} accessibilityLabel={`Select contribution club ${record.group_name}`} onPress={() => setSelectedGroup(record.group_id)}><Text> · {record.group_name}</Text></TouchableOpacity>)}</ScrollView>
          <View style={styles.summaryRow}>
            <TouchableOpacity accessibilityLabel="Previous payment month" onPress={() => { const d = new Date(period.year, period.month - 2, 1); setPeriod({ month: d.getMonth() + 1, year: d.getFullYear() }); }}><Text>‹</Text></TouchableOpacity>
            <Text>{new Date(period.year, period.month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
            <TouchableOpacity accessibilityLabel="Next payment month" onPress={() => { const d = new Date(period.year, period.month, 1); setPeriod({ month: d.getMonth() + 1, year: d.getFullYear() }); }}><Text>›</Text></TouchableOpacity>
          </View>
          {!proofsLoading && !proofsError && selectedRecords.length === 0 && <Text>No contribution recorded for this period.</Text>}
          {selectedRecords.map(record => <View key={record.contribution_id} style={styles.proofCard}>
            <Text style={styles.proofGroupName}>{record.group_name}</Text>
            <Text>{record.month}/{record.year} · {paymentStateLabel(record.payment_state)}</Text>
            <Text>Expected: {paymentMoney(record.expected_amount)}</Text>
            <Text>Confirmed Collected: {paymentMoney(record.confirmed_amount)}</Text>
            <Text>Recorded, unconfirmed: {paymentMoney(record.recorded_unconfirmed_amount)}</Text>
            <Text>Outstanding: {paymentMoney(record.outstanding_amount)}</Text>
            {record.historical_only ? <Text>Historical contribution — read only</Text> : <TouchableOpacity accessibilityLabel={`Open contribution ${record.contribution_id}`} onPress={() => router.push({ pathname: '/(member)/club/[id]', params: { id: record.group_id, month: String(record.month), year: String(record.year), contribution_id: record.contribution_id } })}><Text>Banking details and history</Text></TouchableOpacity>}
            {!record.historical_only && record.proof_eligible && <TouchableOpacity accessibilityLabel={`Upload proof for contribution ${record.contribution_id}`} disabled={uploading} onPress={() => uploadProofForClub({ id: record.group_id, name: record.group_name, amount_due: record.amount_due }, record.contribution_id)}><Text>{record.proof_review_status === 'declined' ? 'Replace Proof' : 'Upload Proof'}</Text></TouchableOpacity>}
          </View>)}
        </View>

        {/* Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <TouchableOpacity style={styles.summaryItem} accessibilityRole="button" accessibilityLabel="Show total proofs" accessibilityState={{ selected: proofFilter === 'all' }} activeOpacity={0.75} onPress={() => setProofFilter('all')}>
              <Text style={styles.summaryLabel}>Total Proofs</Text>
              <Text style={styles.summaryValue}>{currentProofs.length}</Text>
            <Ionicons name="chevron-down" size={14} color={Colors.white} />
            </TouchableOpacity>
            <View style={styles.summaryDivider} />
            <TouchableOpacity style={styles.summaryItem} accessibilityRole="button" accessibilityLabel="Show confirmed" accessibilityState={{ selected: proofFilter === 'confirmed' }} activeOpacity={0.75} onPress={() => setProofFilter('confirmed')}>
              <Text style={styles.summaryLabel}>Confirmed</Text>
              <Text style={[styles.summaryValue, styles.confirmedValue]}>
                {confirmedProofs.length}
              </Text>
            <Ionicons name="chevron-down" size={14} color={Colors.white} />
            </TouchableOpacity>
            <View style={styles.summaryDivider} />
            <TouchableOpacity style={styles.summaryItem} accessibilityRole="button" accessibilityLabel="Show pending" accessibilityState={{ selected: proofFilter === 'proof_uploaded' }} activeOpacity={0.75} onPress={() => setProofFilter('proof_uploaded')}>
              <Text style={styles.summaryLabel}>Pending</Text>
              <Text style={[styles.summaryValue, styles.pendingValue]}>
                {pendingProofs.length}
              </Text>
            <Ionicons name="chevron-down" size={14} color={Colors.white} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Proofs List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Proofs of Payment</Text>
          {proofFilter !== 'all' && <View>
            <Text accessibilityLiveRegion="polite">Showing {proofFilter === 'confirmed' ? 'confirmed' : 'pending review'} proofs ({visibleProofs.length})</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Show all proofs" onPress={() => setProofFilter('all')}><Text style={styles.viewProofText}>Show all</Text></TouchableOpacity>
          </View>}

          {proofsError ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>{proofsError}</Text>
              <TouchableOpacity style={styles.viewProofButton} onPress={() => void fetchProofs()}>
                <Text style={styles.viewProofText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : proofsLoading && currentProofs.length === 0 ? (
            <ActivityIndicator color={Colors.mediumGreen} />
          ) : visibleProofs.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyStateText}>{proofFilter === 'all' ? 'No proofs uploaded yet' : 'No proofs match this filter'}</Text>
              {proofFilter === 'all' && <Text style={styles.emptyStateSubtext}>Tap the button above to upload your first proof</Text>}
            </View>
          ) : (
            visibleProofs.map((proof) => (
              <View key={proof.id} style={styles.proofCard}>
                <View style={styles.proofHeader}>
                  <Ionicons name="document-text" size={24} color={Colors.mediumGreen} />
                  <View style={styles.proofInfo}>
                    <Text style={styles.proofGroupName}>{proof.groupName}</Text>
                    <Text style={styles.proofMonth}>{proof.month}</Text>
                  </View>
                  <StatusPill status={proof.status} label={paymentStateLabel(proof.paymentState)} />
                </View>

                <View style={styles.proofDetails}>
                  <View style={styles.proofDetailRow}>
                    <Text style={styles.proofDetailLabel}>Amount:</Text>
                    <Text style={styles.proofDetailValue}>{paymentMoney(proof.amount)}</Text>
                  </View>
                  <View style={styles.proofDetailRow}>
                    <Text style={styles.proofDetailLabel}>Uploaded:</Text>
                    <Text style={styles.proofDetailValue}>{proof.uploadDate ? new Date(proof.uploadDate).toLocaleDateString() : 'Not recorded'}</Text>
                  </View>
                </View>

                {proof.confirmedAmount !== undefined && <Text>Confirmed Collected: {paymentMoney(proof.confirmedAmount)} · Outstanding: {paymentMoney(proof.remainingAmount)}</Text>}
                {proof.recordedAmount != null && proof.confirmedAmount === 0 && proof.recordedAmount > 0 && <Text>Recorded, unconfirmed: {paymentMoney(proof.recordedAmount)}</Text>}
                {proof.status === 'proof_declined' && proof.declineReason && (
                  <Text style={styles.proofDetailLabel}>Decline reason: {proof.declineReason}</Text>
                )}
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
                {proof.canDelete && proof.status === 'proof_uploaded' && (
                  <TouchableOpacity style={styles.viewProofButton} disabled={!!deletingProof || uploading}
                    onPress={() => handleDeleteProof(proof)}>
                    <Text style={styles.viewProofText}>Delete Pending Proof</Text>
                  </TouchableOpacity>
                )}
                {!proof.historicalOnly && proof.status === 'proof_declined' && (
                  <TouchableOpacity style={styles.viewProofButton} disabled={uploading || !!deletingProof}
                    onPress={() => uploadProofForClub({ id: proof.groupId, name: proof.groupName, amount_due: proof.amount }, proof.contribution_id)}>
                    <Text style={styles.viewProofText}>Replace Proof</Text>
                  </TouchableOpacity>
                )}
                {!proof.historicalOnly && proof.status === 'proof_declined' && (
                  <TouchableOpacity style={styles.viewProofButton} disabled={uploading || !!deletingProof}
                    onPress={() => removeDeclinedProof(proof)}>
                    <Text style={styles.viewProofText}>Remove</Text>
                  </TouchableOpacity>
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
        visible={showClubModal && clubsOwner === requestContext}
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
                          : 'Select a recorded contribution'}
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
        visible={viewingProof !== null && viewerOwner === actionContext}
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
    backgroundColor: Colors.primary,
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
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
  },
  profileButton: {
    padding: 4,
    flexShrink: 0,
  },
  profileImage: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 2,
    borderColor: Colors.gold,
  },
  profilePlaceholder: {
    width: 112,
    height: 112,
    borderRadius: 56,
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
