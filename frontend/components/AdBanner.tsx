import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../constants/Colors';

interface AdBannerProps {
  title: string;
  body: string;
  variant?: 'gold' | 'white';
}

export const AdBanner: React.FC<AdBannerProps> = ({ title, body, variant = 'gold' }) => {
  return (
    <View style={styles.adContainer}>
      <Text style={styles.adLabel}>Sponsored</Text>
      <View style={[styles.adCard, variant === 'white' && styles.adCardWhite]}>
        <Text style={styles.adTitle}>{title}</Text>
        <Text style={styles.adBody}>{body}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  adContainer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
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
  adCardWhite: {
    backgroundColor: Colors.white,
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
    lineHeight: 20,
  },
});
