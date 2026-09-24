import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { StatusPill } from '../../components/StatusPill';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { usePersonalContributions } from '../../hooks/usePersonalContributions';
import { eligibleProofContributions } from '../../services/contributions';

export default function MyContributionsScreen() {
  const { user, token } = useAuth();
  const router = useRouter();
  const { phase, records, reload } = usePersonalContributions(user?.id, token);
  const eligible = eligibleProofContributions({ contributions: records.filter(record => record.proof_eligible) });
  const paid = records.filter(record => record.status === 'paid' || record.status === 'confirmed');
  const outstanding = records.filter(record => record.outstanding_amount > 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>My Contributions</Text>
          <Text style={styles.headerSubtitle}>Your own contributions across your active groups</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(treasurer)/profile')} style={styles.profileButton}>
          {user?.profile_photo ? <Image source={{ uri: user.profile_photo }} style={styles.profileImage} /> : (
            <View style={styles.profilePlaceholder}><Ionicons name="person" size={20} color={Colors.white} /></View>
          )}
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.content}>
        {phase === 'loading' ? (
          <View style={styles.infoBox}><ActivityIndicator color={Colors.mediumGreen} /><Text style={styles.infoBody}>Loading your contributions...</Text></View>
        ) : phase === 'error' ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Unable to load your contributions</Text>
            <Text style={styles.infoBody}>Your payment position could not be verified. Please try again.</Text>
            <TouchableOpacity style={styles.uploadButton} onPress={() => void reload()}><Text style={styles.uploadButtonText}>Retry</Text></TouchableOpacity>
          </View>
        ) : phase === 'empty' ? (
          <View style={styles.infoBox}><View style={styles.infoText}>
            <Text style={styles.infoTitle}>No personal contributions recorded</Text>
            <Text style={styles.infoBody}>No contribution records were found for you in your active groups. Being an administrator does not create an amount owing. Flexible groups do not assume monthly payments.</Text>
          </View></View>
        ) : (
          <>
            <View style={styles.summaryCard}><View style={styles.summaryRow}>
              <View style={styles.summaryItem}><Text style={styles.summaryLabel}>Records</Text><Text style={styles.summaryValue}>{records.length}</Text></View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}><Text style={styles.summaryLabel}>Paid</Text><Text style={[styles.summaryValue, styles.paidValue]}>{paid.length}</Text></View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}><Text style={styles.summaryLabel}>Outstanding</Text><Text style={[styles.summaryValue, styles.pendingValue]}>{outstanding.length}</Text></View>
            </View></View>
            <View style={styles.section}>
              {eligible.length > 0 && <TouchableOpacity style={styles.uploadButton} onPress={() => router.push('/(treasurer)/personal-proofs')}>
                <Ionicons name="cloud-upload" size={20} color={Colors.white} /><Text style={styles.uploadButtonText}>Upload Proof of Payment</Text>
              </TouchableOpacity>}
              {records.map(record => (
                <View key={record.contribution_id} style={styles.contributionCard}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}><Text style={styles.groupName}>{record.group_name}</Text><Text style={styles.month}>{record.month}/{record.year}</Text></View>
                    <StatusPill status={record.status} label={record.status === 'excused' ? 'Excused' : record.status === 'paid' ? 'Paid' : undefined} />
                  </View>
                  <View style={styles.cardBody}>
                    <View style={styles.detailRow}><Text style={styles.detailLabel}>Recorded contribution:</Text><Text style={styles.detailValue}>R{record.amount_due.toFixed(2)}</Text></View>
                    <View style={styles.detailRow}><Text style={styles.detailLabel}>Amount paid:</Text><Text style={styles.detailValue}>R{record.amount_paid.toFixed(2)}</Text></View>
                    <View style={styles.detailRow}><Text style={styles.detailLabel}>Outstanding:</Text><Text style={styles.detailValue}>R{record.outstanding_amount.toFixed(2)}</Text></View>
                    {record.due_date && <View style={styles.detailRow}><Text style={styles.detailLabel}>Due date:</Text><Text style={styles.detailValue}>{record.due_date}</Text></View>}
                    {record.payment_reference && <View style={styles.detailRow}><Text style={styles.detailLabel}>Reference:</Text><Text style={styles.detailValue}>{record.payment_reference}</Text></View>}
                  </View>
                  {record.status === 'proof_uploaded' && <View style={styles.uploadedBanner}><Ionicons name="time" size={20} color={Colors.gold} /><Text style={styles.uploadedText}>Proof uploaded - Awaiting confirmation</Text></View>}
                </View>
              ))}
            </View>
          </>
        )}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={24} color={Colors.mediumGreen} />
          <View style={styles.infoText}>
            <Text style={styles.infoTitle}>About Your Contributions</Text>
            <Text style={styles.infoBody}>These are your personal contribution records, including groups where you are an Admin or Treasurer. They are separate from the group's overall finances. Uploading proof does not confirm payment.</Text>
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
