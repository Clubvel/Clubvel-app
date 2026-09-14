import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../contexts/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppHeader from '../../components/AppHeader';

interface Club {
  group_id: string;
  group_name: string;
  contribution_amount: number;
  member_count: number;
  my_status: string;
  next_claim_date?: string;
  total_collected?: number;
}

export default function MyClubsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

  const fetchClubs = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/member/dashboard/${user?.id}`);
      const data = await response.json();
      setClubs(data.clubs || []);
    } catch (error) {
      console.error('Failed to fetch clubs:', error);
      // Use mock data if API fails
      setClubs([
        {
          group_id: 'mock1',
          group_name: 'Family Savings Club',
          contribution_amount: 500,
          member_count: 12,
          my_status: 'confirmed',
          next_claim_date: 'March 2026',
          total_collected: 6000,
        },
        {
          group_id: 'mock2',
          group_name: 'Work Stokvel',
          contribution_amount: 1000,
          member_count: 8,
          my_status: 'pending',
          next_claim_date: 'April 2026',
          total_collected: 8000,
        },
      ]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [API_URL, user?.id]);

  useEffect(() => {
    fetchClubs();
  }, [fetchClubs]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchClubs();
  }, [fetchClubs]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
      case 'paid':
        return Colors.statusPaid;
      case 'pending':
      case 'due':
        return Colors.statusDue;
      case 'late':
        return Colors.statusLate;
      default:
        return Colors.statusUpcoming;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'Paid';
      case 'pending':
        return 'Due';
      case 'late':
        return 'Late';
      default:
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading your clubs...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <AppHeader title="My Clubs" showBack={false} />
      
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        {/* Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{clubs.length}</Text>
              <Text style={styles.summaryLabel}>Active Clubs</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>
                R{clubs.reduce((sum, c) => sum + (c.contribution_amount || 0), 0).toLocaleString()}
              </Text>
              <Text style={styles.summaryLabel}>Monthly Total</Text>
            </View>
          </View>
        </View>

        {/* Clubs List */}
        <Text style={styles.sectionTitle}>Your Stokvels & Clubs</Text>
        
        {clubs.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={64} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No Clubs Yet</Text>
            <Text style={styles.emptyText}>
              Join a stokvel or create your own to get started
            </Text>
            <TouchableOpacity 
              style={styles.createButton}
              onPress={() => router.push('/auth')}
            >
              <Ionicons name="add-circle" size={20} color={Colors.white} />
              <Text style={styles.createButtonText}>Create a Club</Text>
            </TouchableOpacity>
          </View>
        ) : (
          clubs.map((club) => (
            <TouchableOpacity
              key={club.group_id}
              style={styles.clubCard}
              onPress={() => router.push(`/(member)/club/${club.group_id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.clubHeader}>
                <View style={styles.clubIconContainer}>
                  <Ionicons name="people" size={24} color={Colors.primary} />
                </View>
                <View style={styles.clubInfo}>
                  <Text style={styles.clubName}>{club.group_name}</Text>
                  <Text style={styles.clubMembers}>{club.member_count} members</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(club.my_status) + '20' }]}>
                  <Text style={[styles.statusText, { color: getStatusColor(club.my_status) }]}>
                    {getStatusLabel(club.my_status)}
                  </Text>
                </View>
              </View>
              
              <View style={styles.clubDetails}>
                <View style={styles.detailItem}>
                  <Ionicons name="wallet-outline" size={16} color={Colors.textSecondary} />
                  <Text style={styles.detailText}>R{club.contribution_amount}/month</Text>
                </View>
                {club.next_claim_date && (
                  <View style={styles.detailItem}>
                    <Ionicons name="calendar-outline" size={16} color={Colors.textSecondary} />
                    <Text style={styles.detailText}>Next claim: {club.next_claim_date}</Text>
                  </View>
                )}
              </View>
              
              <View style={styles.clubFooter}>
                <Text style={styles.viewDetails}>View Details</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.lightBackground,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: Colors.textSecondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  summaryCard: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.white,
  },
  summaryLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  clubCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  clubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  clubIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  clubInfo: {
    flex: 1,
  },
  clubName: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  clubMembers: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  clubDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  clubFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingTop: 8,
  },
  viewDetails: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
    marginRight: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
  },
  createButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
});
