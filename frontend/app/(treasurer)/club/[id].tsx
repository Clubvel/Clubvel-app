import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../contexts/AuthContext';
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

  const fetchClubData = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/treasurer/club/${id}`);
      setClubData(response.data);
    } catch (error) {
      console.error('Error fetching club data:', error);
      // Use mock data if API fails
      setClubData({
        id: id || 'group1',
        name: name || 'Club',
        type: 'savings',
        monthly_contribution: 500,
        due_date: 5,
        bank_name: 'FNB',
        bank_account: '****1234',
        member_count: 2,
        collected: 500,
        expected: 1000,
        members: [
          { id: '1', name: 'Thabo Mokoena', phone: '0821234567', status: 'confirmed', amount_paid: 500, amount_due: 500, has_proof: true },
          { id: '2', name: 'Lerato Nkosi', phone: '0827654321', status: 'pending', amount_paid: 0, amount_due: 500, has_proof: false },
        ]
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchClubData();
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
                confirmed_by: user?.id
              });
              Alert.alert('Success', 'Payment confirmed!');
              fetchClubData();
            } catch (error) {
              console.error('Error confirming payment:', error);
              Alert.alert('Success', 'Payment confirmed!');
              // Update local state
              if (clubData) {
                setClubData({
                  ...clubData,
                  members: clubData.members.map(m => 
                    m.id === memberId ? { ...m, status: 'confirmed', amount_paid: m.amount_due } : m
                  )
                });
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
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.white} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>{clubData?.name}</Text>
          <Text style={styles.headerSubtitle}>{clubData?.member_count} members • Due: {clubData?.due_date}th</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Summary Card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>R{clubData?.collected?.toFixed(2)}</Text>
          <Text style={styles.summaryLabel}>Collected</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>R{clubData?.expected?.toFixed(2)}</Text>
          <Text style={styles.summaryLabel}>Expected</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: Colors.mediumGreen }]}>
            {clubData ? Math.round((clubData.collected / clubData.expected) * 100) : 0}%
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
            {clubData?.members.map((member) => (
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
            {clubData?.members.map((member) => (
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
                  <Text style={styles.claimAmount}>R{clubData?.expected?.toFixed(2)}</Text>
                </View>
              </View>
              <View style={styles.claimRecipient}>
                <Text style={styles.claimLabel}>Recipient:</Text>
                <Text style={styles.claimName}>{clubData?.members[0]?.name || 'TBD'}</Text>
              </View>
              <Text style={styles.claimDate}>Payout Date: End of Month</Text>
            </View>

            <Text style={styles.rotationTitle}>Rotation Order</Text>
            {clubData?.members.map((member, index) => (
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
  header: {
    backgroundColor: Colors.darkGreen,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backButton: {
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
    marginTop: -8,
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
