import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../constants/Colors';

// Mock ad content for development
const MOCK_ADS = [
  {
    title: 'Grow Your Savings',
    body: 'Join thousands of South Africans building wealth together with community savings.',
  },
  {
    title: 'FNB Business Account',
    body: 'Open a business account for your stokvel. Zero monthly fees for 6 months.',
  },
  {
    title: 'Capitec Save & Invest',
    body: 'Earn up to 11% interest on your stokvel funds. Start today!',
  },
  {
    title: 'Old Mutual Funeral Cover',
    body: 'Protect your family. Funeral cover from R50/month for your burial society.',
  },
  {
    title: 'Standard Bank Money Market',
    body: 'Grow your group savings with competitive interest rates.',
  },
];

interface AdBannerProps {
  size?: 'banner' | 'largeBanner' | 'mediumRectangle';
  style?: any;
}

export const AdBanner: React.FC<AdBannerProps> = ({ size = 'banner', style }) => {
  const [mockAd, setMockAd] = useState(MOCK_ADS[0]);

  useEffect(() => {
    // Random initial ad
    const randomAd = MOCK_ADS[Math.floor(Math.random() * MOCK_ADS.length)];
    setMockAd(randomAd);

    // Rotate ads every 30 seconds
    const interval = setInterval(() => {
      const newAd = MOCK_ADS[Math.floor(Math.random() * MOCK_ADS.length)];
      setMockAd(newAd);
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const handleAdPress = () => {
    // In production with AdMob, this would track clicks
    console.log('[Ad] Banner clicked:', mockAd.title);
  };

  return (
    <View style={[styles.container, style]}>
      <TouchableOpacity 
        style={styles.mockAdContainer}
        onPress={handleAdPress}
        activeOpacity={0.9}
      >
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

// Hooks for future AdMob integration (interstitial and rewarded ads)
export const useInterstitialAd = () => {
  const [isLoaded, setIsLoaded] = useState(true); // Mock: always loaded

  const showInterstitial = async (): Promise<boolean> => {
    console.log('[Mock] Interstitial ad would show here');
    return true;
  };

  const loadInterstitial = async () => {
    setIsLoaded(true);
  };

  return { isLoaded, showInterstitial, loadInterstitial };
};

export const useRewardedAd = (onReward?: (amount: number, type: string) => void) => {
  const [isLoaded, setIsLoaded] = useState(true); // Mock: always loaded

  const showRewardedAd = async (): Promise<boolean> => {
    console.log('[Mock] Rewarded ad would show here - granting mock reward');
    onReward?.(10, 'coins');
    return true;
  };

  const loadRewardedAd = async () => {
    setIsLoaded(true);
  };

  return { isLoaded, showRewardedAd, loadRewardedAd };
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

