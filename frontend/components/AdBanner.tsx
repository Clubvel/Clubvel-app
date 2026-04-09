import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../constants/Colors';

// Mock ad content for development
const MOCK_ADS = [
  {
    title: 'Grow Your Savings',
    body: 'Join thousands of South Africans building wealth together.',
  },
  {
    title: 'FNB Business Account',
    body: 'Open a business account for your stokvel. Zero monthly fees.',
  },
  {
    title: 'Capitec Save & Invest',
    body: 'Earn up to 11% interest on your stokvel funds.',
  },
];

interface AdBannerProps {
  size?: 'banner' | 'largeBanner' | 'mediumRectangle';
  style?: any;
}

export const AdBanner: React.FC<AdBannerProps> = ({ size = 'banner', style }) => {
  const [mockAd, setMockAd] = useState(MOCK_ADS[0]);

  useEffect(() => {
    const randomAd = MOCK_ADS[Math.floor(Math.random() * MOCK_ADS.length)];
    setMockAd(randomAd);

    const interval = setInterval(() => {
      const newAd = MOCK_ADS[Math.floor(Math.random() * MOCK_ADS.length)];
      setMockAd(newAd);
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return (
    <View style={[styles.container, style]}>
      <TouchableOpacity style={styles.mockAdContainer} activeOpacity={0.9}>
        <View style={styles.adLabelContainer}>
          <Text style={styles.adLabel}>Ad</Text>
          <Text style={styles.mockLabel}> (Demo)</Text>
        </View>
        <View style={styles.adContent}>
          <Text style={styles.adTitle} numberOfLines={1}>{mockAd.title}</Text>
          <Text style={styles.adBody} numberOfLines={2}>{mockAd.body}</Text>
        </View>
        <View style={styles.ctaContainer}>
          <Text style={styles.ctaText}>Learn More</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  mockAdContainer: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: Colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  adLabelContainer: {
    position: 'absolute',
    top: 4,
    left: 8,
    flexDirection: 'row',
  },
  adLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: Colors.gold,
    textTransform: 'uppercase',
    backgroundColor: Colors.lightGold,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
  },
  mockLabel: {
    fontSize: 9,
    color: Colors.textMuted,
  },
  adContent: {
    flex: 1,
    paddingTop: 12,
  },
  adTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  adBody: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  ctaContainer: {
    backgroundColor: Colors.gold,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    marginLeft: 8,
  },
  ctaText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.white,
  },
});

export default AdBanner;

