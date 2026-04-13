import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import axios from 'axios';

interface Member {
  id: string;
  name: string;
  phone: string;
  status: string;
  amount_paid: number;
  amount_due: number;
  has_proof: boolean;
}

interface ClubData {
  id: string;
  name: string;
  type: string;
  monthly_contribution: number;
  due_date: number;
  bank_name: string;
  bank_account: string;
  member_count: number;
  collected: number;
  expected: number;
  members: Member[];
}

export default function ClubDetailScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

  const [clubData, setClubData] = useState<ClubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'members' | 'payments' | 'claims'>('members');
  const [error, setError] = useState<string | null>(null);

  const fetchClubData = async () => {
    setError(null);
    try {
      // Pass treasurer_id for authorization
      const response = await axios.get(`${API_URL}/api/treasurer/club/${id}?treasurer_id=${user?.id}`);
      setClubData(response.data);
    } catch (err: any) {
      console.error('Error fetching club data:', err);
      if (err.response?.status === 403) {
        setError('Access denied: You are not the treasurer of this group');
      } else {
        setError('Failed to load club details');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchClubData();
    }
  }, [id]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchClubData();
  };

  const handleConfirmPayment = (memberId: string, memberName: string) => {
    Alert.alert(
      'Confirm Payment',
      `Confirm payment from ${memberName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              await axios.post(`${API_URL}/api/treasurer/confirm-payment`, {
                member_id: memberId,
                group_id: id,
                confirmed_by: user?.id,
                treasurer_id: user?.id  // Authorization: Pass treasurer ID for access control
              });
              Alert.alert('Success', 'Payment confirmed!');
              fetchClubData();
            } catch (err: any) {
              if (err.response?.status === 403) {
                Alert.alert('Access Denied', 'You are not authorized to confirm payments for this group');
              } else {
                Alert.alert('Error', 'Failed to confirm payment');
              }
            }
          }
        }
      ]
    );
  };

  const handleRemindMember = (memberName: string, phone: string) => {
    Alert.alert(
      'Send Reminder',
      `Send payment reminder to ${memberName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: () => {
            Alert.alert('Reminder Sent', `Payment reminder sent to ${memberName}`);
          }
        }
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return Colors.statusPaid;
      case 'proof_uploaded': return Colors.gold;
      case 'late': return Colors.statusLate;
      default: return Colors.textMuted;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'confirmed': return 'Paid';
      case 'proof_uploaded': return 'Pending Review';
      case 'late': return 'Late';
      default: return 'Pending';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.mediumGreen} />
        <Text style={styles.loadingText}>Loading club details...</Text>
      </View>
    );
  }

  if (error || !clubData) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={64} color={Colors.statusLate} />
        <Text style={styles.errorText}>{error || 'Club not found'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchClubData}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBackButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.white} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>{clubData.name}</Text>
          <Text style={styles.headerSubtitle}>{clubData.member_count} members • Due: {clubData.due_date}th</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Summary Card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>R{clubData.collected.toFixed(2)}</Text>
          <Text style={styles.summaryLabel}>Collected</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>R{clubData.expected.toFixed(2)}</Text>
          <Text style={styles.summaryLabel}>Expected</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: Colors.mediumGreen }]}>
            {Math.round((clubData.collected / clubData.expected) * 100)}%
          </Text>
          <Text style={styles.summaryLabel}>Progress</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'members' && styles.activeTab]}
          onPress={() => setActiveTab('members')}
        >
          <Ionicons name="people" size={20} color={activeTab === 'members' ? Colors.mediumGreen : Colors.textMuted} />
          <Text style={[styles.tabText, activeTab === 'members' && styles.activeTabText]}>Members</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'payments' && styles.activeTab]}
          onPress={() => setActiveTab('payments')}
        >
          <Ionicons name="cash" size={20} color={activeTab === 'payments' ? Colors.mediumGreen : Colors.textMuted} />
          <Text style={[styles.tabText, activeTab === 'payments' && styles.activeTabText]}>Payments</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'claims' && styles.activeTab]}
          onPress={() => setActiveTab('claims')}
        >
          <Ionicons name="trophy" size={20} color={activeTab === 'claims' ? Colors.mediumGreen : Colors.textMuted} />
          <Text style={[styles.tabText, activeTab === 'claims' && styles.activeTabText]}>Claims</Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {activeTab === 'members' && (
          <View style={styles.section}>
            {clubData.members.map((member) => (
              <View key={member.id} style={styles.memberCard}>
                <View style={styles.memberInfo}>
                  <View style={styles.memberAvatar}>
                    <Text style={styles.memberAvatarText}>{member.name.charAt(0)}</Text>
                  </View>
                  <View style={styles.memberDetails}>
                    <Text style={styles.memberName}>{member.name}</Text>
                    <Text style={styles.memberPhone}>{member.phone}</Text>
                  </View>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(member.status) + '20' }]}>
                  <Text style={[styles.statusText, { color: getStatusColor(member.status) }]}>
                    {getStatusLabel(member.status)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {activeTab === 'payments' && (
          <View style={styles.section}>
            {clubData.members.map((member) => (
              <View key={member.id} style={styles.paymentCard}>
                <View style={styles.paymentHeader}>
                  <View style={styles.memberInfo}>
                    <View style={[styles.memberAvatar, { width: 36, height: 36 }]}>
                      <Text style={[styles.memberAvatarText, { fontSize: 14 }]}>{member.name.charAt(0)}</Text>
                    </View>
                    <View style={styles.memberDetails}>
                      <Text style={styles.memberName}>{member.name}</Text>
                      <Text style={styles.paymentAmount}>
                        R{member.amount_paid.toFixed(2)} / R{member.amount_due.toFixed(2)}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(member.status) + '20' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(member.status) }]}>
                      {getStatusLabel(member.status)}
                    </Text>
                  </View>
                </View>
                
                {member.status !== 'confirmed' && (
                  <View style={styles.paymentActions}>
                    {member.has_proof || member.status === 'proof_uploaded' ? (
                      <TouchableOpacity 
                        style={styles.confirmButton}
                        onPress={() => handleConfirmPayment(member.id, member.name)}
                      >
                        <Ionicons name="checkmark-circle" size={18} color={Colors.white} />
                        <Text style={styles.confirmButtonText}>Confirm Payment</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity 
                        style={styles.remindButton}
                        onPress={() => handleRemindMember(member.name, member.phone)}
                      >
                        <Ionicons name="notifications" size={18} color={Colors.gold} />
                        <Text style={styles.remindButtonText}>Send Reminder</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {activeTab === 'claims' && (
          <View style={styles.section}>
            <View style={styles.claimCard}>
              <View style={styles.claimHeader}>
                <Ionicons name="trophy" size={32} color={Colors.gold} />
                <View style={styles.claimInfo}>
                  <Text style={styles.claimTitle}>Next Claim</Text>
                  <Text style={styles.claimAmount}>R{clubData.expected.toFixed(2)}</Text>
                </View>
              </View>
              <View style={styles.claimRecipient}>
                <Text style={styles.claimLabel}>Recipient:</Text>
                <Text style={styles.claimName}>{clubData.members[0]?.name || 'TBD'}</Text>
              </View>
              <Text style={styles.claimDate}>Payout Date: End of Month</Text>
            </View>

            <Text style={styles.rotationTitle}>Rotation Order</Text>
            {clubData.members.map((member, index) => (
              <View key={member.id} style={styles.rotationItem}>
                <View style={styles.rotationNumber}>
                  <Text style={styles.rotationNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.rotationName}>{member.name}</Text>
                {index === 0 && (
                  <View style={styles.nextBadge}>
                    <Text style={styles.nextBadgeText}>NEXT</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 32 }} />
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
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: Colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.lightBackground,
    padding: 24,
  },
  errorText: {
    fontSize: 18,
    color: Colors.textSecondary,
    marginTop: 16,
    marginBottom: 24,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: Colors.mediumGreen,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  retryButtonText: {
    color: Colors.white,
    fontWeight: '600',
    fontSize: 16,
  },
  backButton: {
    paddingHorizontal: 32,
    paddingVertical: 12,
  },
  backButtonText: {
    color: Colors.mediumGreen,
    fontWeight: '600',
    fontSize: 16,
  },
  header: {
    backgroundColor: Colors.darkGreen,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  headerBackButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContent: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.white,
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: Colors.cardBorder,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  summaryLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: Colors.lightBackground,
  },
  tabText: {
    fontSize: 14,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  activeTabText: {
    color: Colors.mediumGreen,
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 16,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.mediumGreen,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberAvatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.white,
  },
  memberDetails: {
    marginLeft: 12,
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  memberPhone: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  paymentCard: {
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  paymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paymentAmount: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  paymentActions: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.mediumGreen,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  confirmButtonText: {
    color: Colors.white,
    fontWeight: '600',
    fontSize: 14,
  },
  remindButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.lightGold,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  remindButtonText: {
    color: Colors.gold,
    fontWeight: '600',
    fontSize: 14,
  },
  claimCard: {
    backgroundColor: Colors.white,
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: Colors.gold,
  },
  claimHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  claimInfo: {
    marginLeft: 16,
  },
  claimTitle: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  claimAmount: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  claimRecipient: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  claimLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  claimName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginLeft: 8,
  },
  claimDate: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  rotationTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  rotationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  rotationNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.lightBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rotationNumberText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  rotationName: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
    marginLeft: 12,
  },
  nextBadge: {
    backgroundColor: Colors.gold,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  nextBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: Colors.white,
  },
});
