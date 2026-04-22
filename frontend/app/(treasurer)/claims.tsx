import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';

export default function TreasurerClaimsScreen() {
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Claims Management</Text>
        <Text style={styles.headerSubtitle}>Manage your club claims</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Empty State */}
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={64} color={Colors.mediumGreen} />
          <Text style={styles.emptyTitle}>No Claims Yet</Text>
          <Text style={styles.emptySubtitle}>Claims will appear here once you create a club and add members</Text>
        </View>
      </ScrollView>
    </View>
  );
}
              <View style={styles.claimAmount}>
                <Text style={styles.amountLabel}>Amount</Text>
                <Text style={styles.amountValue}>R5,000</Text>
              </View>
            </View>
            <View style={styles.claimActions}>
              <TouchableOpacity style={styles.actionButtonSecondary}>
                <Ionicons name="eye" size={18} color={Colors.mediumGreen} />
                <Text style={styles.actionButtonSecondaryText}>View Details</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButtonPrimary}>
                <Ionicons name="checkmark-circle" size={18} color={Colors.white} />
                <Text style={styles.actionButtonPrimaryText}>Mark as Paid</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.claimCard}>
            <View style={styles.claimHeader}>
              <View style={styles.claimMember}>
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberAvatarText}>LN</Text>
                </View>
                <View>
                  <Text style={styles.memberName}>Lerato Nkosi</Text>
                  <Text style={styles.claimDate}>Due: 23 September 2025</Text>
                </View>
              </View>
              <View style={styles.claimAmount}>
                <Text style={styles.amountLabel}>Amount</Text>
                <Text style={styles.amountValue}>R5,000</Text>
              </View>
            </View>
            <View style={styles.claimActions}>
              <TouchableOpacity style={styles.actionButtonSecondary}>
                <Ionicons name="eye" size={18} color={Colors.mediumGreen} />
                <Text style={styles.actionButtonSecondaryText}>View Details</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButtonPrimary}>
                <Ionicons name="calendar" size={18} color={Colors.white} />
                <Text style={styles.actionButtonPrimaryText}>Schedule Payment</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Completed Claims */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Completed Claims (This Year)</Text>

          <View style={[styles.claimCard, styles.claimCardCompleted]}>
            <View style={styles.claimHeader}>
              <View style={styles.claimMember}>
                <View style={[styles.memberAvatar, styles.memberAvatarCompleted]}>
                  <Ionicons name="checkmark" size={20} color={Colors.white} />
                </View>
                <View>
                  <Text style={styles.memberName}>Sipho Dlamini</Text>
                  <Text style={styles.claimDate}>Paid: 15 January 2025</Text>
                </View>
              </View>
              <View style={styles.claimAmount}>
                <Text style={styles.amountLabel}>Amount</Text>
                <Text style={styles.amountValue}>R5,000</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Rotation Schedule */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Full Rotation Schedule</Text>
          
          <View style={styles.scheduleCard}>
            <View style={styles.scheduleRow}>
              <View style={styles.schedulePosition}>
                <Ionicons name="checkmark-circle" size={20} color={Colors.statusPaid} />
                <Text style={styles.scheduleText}>Position 1: Sipho Dlamini</Text>
              </View>
              <Text style={styles.scheduleStatus}>✅ Paid</Text>
            </View>

            <View style={styles.scheduleRow}>
              <View style={styles.schedulePosition}>
                <View style={styles.positionBadge}>
                  <Text style={styles.positionNumber}>2</Text>
                </View>
                <Text style={styles.scheduleText}>Position 2: Thabo Mokoena</Text>
              </View>
              <Text style={styles.scheduleStatus}>Aug 2025</Text>
            </View>

            <View style={styles.scheduleRow}>
              <View style={styles.schedulePosition}>
                <View style={styles.positionBadge}>
                  <Text style={styles.positionNumber}>3</Text>
                </View>
                <Text style={styles.scheduleText}>Position 3: Lerato Nkosi</Text>
              </View>
              <Text style={styles.scheduleStatus}>Sep 2025</Text>
            </View>
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
  claimCard: {
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 12,
  },
  claimCardCompleted: {
    opacity: 0.7,
  },
  claimHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  claimMember: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  memberAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.gold,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberAvatarCompleted: {
    backgroundColor: Colors.statusPaid,
  },
  memberAvatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.white,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  claimDate: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  claimAmount: {
    alignItems: 'flex-end',
  },
  amountLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  amountValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.gold,
  },
  claimActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButtonSecondary: {
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
  actionButtonSecondaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.mediumGreen,
  },
  actionButtonPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: Colors.mediumGreen,
  },
  actionButtonPrimaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.white,
  },
  scheduleCard: {
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  scheduleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  schedulePosition: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  positionBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.gold,
    justifyContent: 'center',
    alignItems: 'center',
  },
  positionNumber: {
    fontSize: 12,
    fontWeight: 'bold',
    color: Colors.white,
  },
  scheduleText: {
    fontSize: 14,
    color: Colors.textPrimary,
  },
  scheduleStatus: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
});
