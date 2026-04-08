import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { StatusPill } from '../../components/StatusPill';

export default function ProofOfPaymentsScreen() {
  // Mock data - in production this would come from API
  const proofs = [
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
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Proof of Payments</Text>
        <Text style={styles.headerSubtitle}>All your uploaded payment proofs</Text>
      </View>

      <ScrollView style={styles.content}>
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
});
