import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../constants/Colors';

interface StatusPillProps {
  status: string;
  label?: string;
}

export const StatusPill: React.FC<StatusPillProps> = ({ status, label }) => {
  const getStatusColor = () => {
    switch (status) {
      case 'confirmed':
      case 'paid':
        return Colors.statusPaid;
      case 'late':
        return Colors.statusLate;
      case 'due':
        return Colors.statusDue;
      case 'pending':
      case 'upcoming':
      default:
        return Colors.statusUpcoming;
    }
  };

  const getStatusLabel = () => {
    if (label) return label;
    
    switch (status) {
      case 'confirmed':
        return 'Paid';
      case 'late':
        return 'Late';
      case 'due':
        return 'Due Today';
      case 'pending':
        return 'Upcoming';
      case 'proof_uploaded':
        return 'Pending Confirmation';
      default:
        return 'Pending';
    }
  };

  return (
    <View style={[styles.pill, { backgroundColor: getStatusColor() }]}>
      <Text style={styles.text}>{getStatusLabel()}</Text>
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
