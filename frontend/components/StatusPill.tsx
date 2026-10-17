import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../constants/Colors';

interface StatusPillProps {
  status: string;
  label?: string;
  subtleAccent?: boolean;
}

export const StatusPill: React.FC<StatusPillProps> = ({ status, label, subtleAccent = false }) => {
  const getStatusColor = () => {
    switch (status) {
      case 'confirmed':
      case 'paid':
      case 'active':
        return Colors.statusPaid;
      case 'late':
      case 'proof_declined':
      case 'rejected':
      case 'failed':
      case 'overdue':
        return Colors.statusLate;
      case 'due':
      case 'pending':
      case 'proof_uploaded':
      case 'awaiting_confirmation':
        return Colors.statusDue;
      case 'upcoming':
      default:
        return Colors.statusUpcoming;
    }
  };

  const getStatusLabel = () => {
    if (label) return label;
    
    switch (status) {
      case 'confirmed':
      case 'paid':
        return 'Paid';
      case 'active':
        return 'Active';
      case 'late':
        return 'Late';
      case 'due':
        return 'Due Today';
      case 'pending':
        return 'Upcoming';
      case 'proof_uploaded':
      case 'awaiting_confirmation':
        return 'Pending Confirmation';
      case 'proof_declined':
        return 'Proof Declined';
      case 'rejected':
        return 'Rejected';
      case 'failed':
        return 'Failed';
      case 'overdue':
        return 'Overdue';
      default:
        return 'Pending';
    }
  };

  const statusColor = getStatusColor();
  const foreground = [Colors.statusPaid, Colors.statusDue, Colors.statusUpcoming].includes(statusColor) ? Colors.black : Colors.white;
  return (
    <View style={[styles.pill, { backgroundColor: subtleAccent ? Colors.accentLight : statusColor,
      ...(subtleAccent ? { borderWidth: 1, borderColor: Colors.accentLight } : {}) }]}>
      <Text style={[styles.text, { color: subtleAccent ? Colors.primary : foreground }]}>{getStatusLabel()}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  text: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '600',
  },
});
