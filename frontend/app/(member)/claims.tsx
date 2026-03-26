import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';

export default function ClaimsScreen() {
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Claims Schedule</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Mock upcoming claim */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Next Claim</Text>
          <View style={[styles.card, styles.nextClaimCard]}>
            <View style={styles.nextClaimHeader}>
              <Ionicons name="trophy" size={32} color={Colors.gold} />
              <Text style={styles.nextClaimAmount}>R5,000.00</Text>
            </View>
            <Text style={styles.nextClaimRecipient}>Thabo Mokoena</Text>
            <Text style={styles.nextClaimDate}>23 August 2025 • 35 days away</Text>
          </View>
        </View>

        {/* Rotation list */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payout Rotation</Text>
          
          <View style={styles.rotationList}>
            {/* Completed */}
            <View style={[styles.rotationItem, styles.rotationItemCompleted]}>
              <View style={styles.rotationNumber}>
                <Ionicons name="checkmark" size={20} color={Colors.white} />
              </View>
              <Text style={styles.rotationName}>Sipho Dlamini</Text>
            </View>

            {/* Current - highlighted */}
            <View style={[styles.rotationItem, styles.rotationItemCurrent]}>
              <View style={[styles.rotationNumber, styles.rotationNumberCurrent]}>
                <Text style={styles.rotationNumberText}>1</Text>
              </View>
              <View>
                <Text style={styles.rotationName}>Thabo Mokoena (You)</Text>
                <Text style={styles.rotationSubtext}>Coming up next</Text>
              </View>
            </View>

            {/* Future members */}
            <View style={styles.rotationItem}>
              <View style={[styles.rotationNumber, styles.rotationNumberFuture]}>
                <Text style={styles.rotationNumberText}>2</Text>
              </View>
              <Text style={styles.rotationName}>Lerato Nkosi</Text>
            </View>

            <View style={styles.rotationItem}>
              <View style={[styles.rotationNumber, styles.rotationNumberFuture]}>
                <Text style={styles.rotationNumberText}>3</Text>
              </View>
              <Text style={styles.rotationName}>Nomsa Mthembu</Text>
            </View>

            <View style={styles.rotationItem}>
              <View style={[styles.rotationNumber, styles.rotationNumberFuture]}>
                <Text style={styles.rotationNumberText}>4</Text>
              </View>
              <Text style={styles.rotationName}>Bongani Khumalo</Text>
            </View>
          </View>
        </View>

        {/* Mock ad */}
        <View style={styles.adContainer}>
          <Text style={styles.adLabel}>Sponsored</Text>
          <View style={styles.adCard}>
            <Text style={styles.adTitle}>Invest your claim wisely</Text>
            <Text style={styles.adBody}>Get up to 12% returns with Satrix Unit Trusts. Start with R1,000.</Text>
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
  content: {
    flex: 1,
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
  nextClaimCard: {
    backgroundColor: Colors.lightGold,
    borderColor: Colors.gold,
  },
  nextClaimHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  nextClaimAmount: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  nextClaimRecipient: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  nextClaimDate: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  rotationList: {
    gap: 8,
  },
  rotationItem: {
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  rotationItemCompleted: {
    opacity: 0.6,
  },
  rotationItemCurrent: {
    backgroundColor: Colors.lightGold,
    borderColor: Colors.gold,
    borderWidth: 2,
  },
  rotationNumber: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.statusPaid,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rotationNumberCurrent: {
    backgroundColor: Colors.gold,
  },
  rotationNumberFuture: {
    backgroundColor: Colors.statusUpcoming,
  },
  rotationNumberText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.white,
  },
  rotationName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  rotationSubtext: {
    fontSize: 12,
    color: Colors.gold,
    marginTop: 2,
  },
  adContainer: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
  },
  adLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  adCard: {
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
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
