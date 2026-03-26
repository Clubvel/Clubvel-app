import React from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { StatusPill } from '../../components/StatusPill';

const mockMembers = [
  {
    id: '1',
    name: 'Lerato Nkosi',
    initials: 'LN',
    reference: 'SSH002',
    status: 'late',
    amount: 500,
    phone: '0827654321',
  },
  {
    id: '2',
    name: 'Thabo Mokoena',
    initials: 'TM',
    reference: 'SSH001',
    status: 'confirmed',
    amount: 500,
    phone: '0821234567',
  },
  {
    id: '3',
    name: 'Nomsa Mthembu',
    initials: 'NM',
    reference: 'SSH003',
    status: 'pending',
    amount: 500,
    phone: '0823456789',
  },
];

export default function MembersScreen() {
  const [searchQuery, setSearchQuery] = React.useState('');

  const lateCount = mockMembers.filter(m => m.status === 'late').length;
  const paidCount = mockMembers.filter(m => m.status === 'confirmed').length;
  const dueCount = mockMembers.filter(m => m.status === 'due').length;

  const getAvatarColor = (status: string) => {
    switch (status) {
      case 'late':
        return Colors.statusLate;
      case 'confirmed':
        return Colors.statusPaid;
      default:
        return Colors.statusUpcoming;
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Members</Text>
        <Text style={styles.headerSubtitle}>Soshanguve Savings Club</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Summary Row */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryItem, styles.summaryItemPaid]}>
            <Text style={styles.summaryCount}>{paidCount}</Text>
            <Text style={styles.summaryLabel}>Paid</Text>
          </View>
          <View style={[styles.summaryItem, styles.summaryItemLate]}>
            <Text style={styles.summaryCount}>{lateCount}</Text>
            <Text style={styles.summaryLabel}>Late</Text>
          </View>
          <View style={[styles.summaryItem, styles.summaryItemDue]}>
            <Text style={styles.summaryCount}>{dueCount}</Text>
            <Text style={styles.summaryLabel}>Due</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryCount}>{mockMembers.length}</Text>
            <Text style={styles.summaryLabel}>Total</Text>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={Colors.textSecondary} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search members..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Member List */}
        <View style={styles.memberList}>
          {mockMembers
            .filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()))
            .map((member) => (
              <TouchableOpacity key={member.id} style={styles.memberCard}>
                <View style={[styles.memberAvatar, { backgroundColor: getAvatarColor(member.status) }]}>
                  <Text style={styles.memberAvatarText}>{member.initials}</Text>
                </View>

                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{member.name}</Text>
                  <View style={styles.memberMeta}>
                    <Text style={styles.memberMetaText}>{member.reference}</Text>
                    <Text style={styles.memberMetaText}> • </Text>
                    <Text style={styles.memberMetaText}>R{member.amount}</Text>
                  </View>
                </View>

                <StatusPill status={member.status} />
              </TouchableOpacity>
            ))}
        </View>

        {/* Add Member Button */}
        <TouchableOpacity style={styles.addButton}>
          <Ionicons name="add-circle" size={24} color={Colors.mediumGreen} />
          <Text style={styles.addButtonText}>Add New Member</Text>
        </TouchableOpacity>
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
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 12,
  },
  summaryItem: {
    flex: 1,
    backgroundColor: Colors.white,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
  },
  summaryItemPaid: {
    borderColor: Colors.statusPaid,
    backgroundColor: '#F0FDF4',
  },
  summaryItemLate: {
    borderColor: Colors.statusLate,
    backgroundColor: '#FEF2F2',
  },
  summaryItemDue: {
    borderColor: Colors.gold,
    backgroundColor: Colors.lightGold,
  },
  summaryCount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  summaryLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    marginHorizontal: 24,
    marginBottom: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  memberList: {
    paddingHorizontal: 24,
    gap: 8,
  },
  memberCard: {
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  memberAvatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.white,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  memberMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberMetaText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.white,
    marginHorizontal: 24,
    marginTop: 16,
    marginBottom: 24,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.mediumGreen,
    borderStyle: 'dashed',
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.mediumGreen,
  },
});
