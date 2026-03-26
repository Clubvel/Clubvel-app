import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Linking, Alert } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useRouter } from 'expo-router';

interface LateMember {
  member_name: string;
  group_name: string;
  days_late: number;
  amount: number;
  phone: string;
}

interface Club {
  id: string;
  name: string;
  member_count: number;
  due_date: number;
  collected: number;
  expected: number;
  status: string;
  late_count: number;
}

interface DashboardData {
  summary: {
    total_clubs: number;
    total_members: number;
    total_collected_this_month: number;
    late_members_count: number;
  };
  urgent_alerts: LateMember[];
  clubs: Club[];
  next_claim: {
    member_name: string;
    group_name: string;
    amount: number;
    date: string;
  } | null;
}

export default function TreasurerDashboardScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

  const fetchDashboard = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/treasurer/dashboard/${user?.id}`);
      setDashboardData(response.data);
    } catch (error) {
      console.error('Error fetching treasurer dashboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchDashboard();
    }
  }, [user]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboard();
  };

  const handleRemindMember = (phone: string, name: string) => {
    // Mock WhatsApp reminder
    Alert.alert(
      'Send Reminder',
      `Send WhatsApp reminder to ${name} at ${phone}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: () => {
            // In production, this would call WhatsApp Business API
            Alert.alert('Reminder Sent', `WhatsApp reminder sent to ${name}`);
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/auth');
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.mediumGreen} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <View style={styles.treasurerBadge}>
            <Text style={styles.treasurerBadgeText}>TREASURER</Text>
          </View>
          <Text style={styles.greeting}>{user?.full_name}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={24} color={Colors.white} />
        </TouchableOpacity>
      </View>

      {/* Summary Cards */}
      <View style={styles.summaryContainer}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total Clubs</Text>
          <Text style={styles.summaryValue}>{dashboardData?.summary.total_clubs || 0}</Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total Members</Text>
          <Text style={styles.summaryValue}>{dashboardData?.summary.total_members || 0}</Text>
        </View>
      </View>

      <View style={styles.summaryContainer}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Collected This Month</Text>
          <Text style={[styles.summaryValue, styles.moneyValue]}>
            R{dashboardData?.summary.total_collected_this_month.toFixed(2) || '0.00'}
          </Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Late Members</Text>
          <Text style={[styles.summaryValue, dashboardData?.summary.late_members_count ? styles.lateValue : null]}>
            {dashboardData?.summary.late_members_count || 0}
          </Text>
        </View>
      </View>

      {/* Urgent Alerts */}
      {dashboardData?.urgent_alerts && dashboardData.urgent_alerts.length > 0 && (
        <View style={styles.section}>
          <View style={styles.urgentHeader}>
            <Ionicons name="alert-circle" size={20} color={Colors.statusLate} />
            <Text style={styles.urgentTitle}>Urgent: Late Payments</Text>
          </View>

          {dashboardData.urgent_alerts.map((alert, index) => (
            <View key={index} style={styles.urgentCard}>
              <View style={styles.urgentInfo}>
                <Text style={styles.urgentMemberName}>{alert.member_name}</Text>
                <Text style={styles.urgentDetails}>
                  {alert.group_name} • {alert.days_late} days late • R{alert.amount}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.remindButton}
                onPress={() => handleRemindMember(alert.phone, alert.member_name)}
              >
                <Ionicons name="logo-whatsapp" size={20} color={Colors.white} />
                <Text style={styles.remindButtonText}>Remind</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* All Clubs */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>All Clubs</Text>

        {dashboardData?.clubs && dashboardData.clubs.length > 0 ? (
          dashboardData.clubs.map((club) => (
            <View key={club.id} style={styles.clubCard}>
              <View style={styles.clubCardHeader}>
                <Text style={styles.clubName}>{club.name}</Text>
                {club.late_count > 0 ? (
                  <View style={styles.lateBadge}>
                    <Text style={styles.lateBadgeText}>{club.late_count} late</Text>
                  </View>
                ) : (
                  <View style={styles.paidBadge}>
                    <Ionicons name="checkmark-circle" size={16} color={Colors.statusPaid} />
                    <Text style={styles.paidBadgeText}>All paid</Text>
                  </View>
                )}
              </View>

              <View style={styles.clubMeta}>
                <Ionicons name="people" size={14} color={Colors.textSecondary} />
                <Text style={styles.clubMetaText}>{club.member_count} members</Text>
                <Text style={styles.clubMetaText}> • </Text>
                <Text style={styles.clubMetaText}>Due: {club.due_date} of month</Text>
              </View>

              <View style={styles.clubProgress}>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${(club.collected / club.expected) * 100}%`,
                        backgroundColor: club.late_count > 0 ? Colors.gold : Colors.statusPaid,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.progressText}>
                  R{club.collected.toFixed(2)} / R{club.expected.toFixed(2)}
                </Text>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No clubs managed</Text>
          </View>
        )}
      </View>

      {/* Next Claim */}
      {dashboardData?.next_claim && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Next Claim</Text>
          <View style={[styles.card, styles.claimCard]}>
            <View style={styles.claimHeader}>
              <Ionicons name="trophy" size={24} color={Colors.gold} />
              <Text style={styles.claimAmount}>R{dashboardData.next_claim.amount.toFixed(2)}</Text>
            </View>
            <Text style={styles.claimMember}>{dashboardData.next_claim.member_name}</Text>
            <Text style={styles.claimDetails}>
              {dashboardData.next_claim.group_name} • {dashboardData.next_claim.date}
            </Text>
          </View>
        </View>
      )}
    </ScrollView>
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
    backgroundColor: Colors.darkGreen,
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  treasurerBadge: {
    backgroundColor: Colors.gold,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  treasurerBadgeText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  greeting: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.white,
  },
  summaryContainer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 16,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  summaryLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  moneyValue: {
    color: Colors.mediumGreen,
  },
  lateValue: {
    color: Colors.statusLate,
  },
  section: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  urgentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  urgentTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.statusLate,
  },
  urgentCard: {
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.statusLate,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  urgentInfo: {
    flex: 1,
    marginRight: 12,
  },
  urgentMemberName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  urgentDetails: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  remindButton: {
    backgroundColor: '#25D366',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  remindButtonText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: 'bold',
  },
  clubCard: {
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 12,
  },
  clubCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  clubName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    flex: 1,
  },
  lateBadge: {
    backgroundColor: Colors.statusLate,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  lateBadgeText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: 'bold',
  },
  paidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  paidBadgeText: {
    color: Colors.statusPaid,
    fontSize: 12,
    fontWeight: '600',
  },
  clubMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  clubMetaText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  clubProgress: {
    gap: 8,
  },
  progressBar: {
    height: 8,
    backgroundColor: Colors.lightBackground,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'right',
  },
  card: {
    backgroundColor: Colors.white,
    padding: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  claimCard: {
    backgroundColor: Colors.lightGold,
    borderColor: Colors.gold,
  },
  claimHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  claimAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  claimMember: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  claimDetails: {
    fontSize: 14,
    color: Colors.textSecondary,
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
    fontSize: 14,
    color: Colors.textSecondary,
  },
});
