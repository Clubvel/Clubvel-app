import React, {useState, useEffect, useCallback, useRef} from 'react';
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
  fullWidth?: boolean;
}

export const AdBanner: React.FC<AdBannerProps> = ({ size = 'banner', style, fullWidth = false }) => {
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
        style={[styles.mockAdContainer, fullWidth && styles.fullWidthAdContainer]}
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

// Real native AdMob rewarded-ad hook.
// Client callbacks are for UI feedback only; never fulfil airtime/data here.
export const useRewardedAd = (
  token: string | null,
  userId: string | null,
  rewardKind: 'airtime' | 'data',
  onReward?: (amount: number, type: string) => void,
) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [adInstance, setAdInstance] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const callbackRef = useRef(onReward);
  callbackRef.current = onReward;
  const generation = useRef(0);

  const loadRewardedAd = useCallback(async () => {
    const ticket = ++generation.current;
    setIsLoaded(false);
    setAdInstance(null);
    setError(null);

    if (!token || !userId) {
      setError('Sign in to access airtime and data rewards.');
      return;
    }

    try {
      if (__DEV__) {
        throw new Error('Rewarded airtime/data is disabled in development builds.');
      }
      const { createRewardIntent } = require('../services/rewardService');
      const intent = await createRewardIntent(token, rewardKind);
      if (ticket !== generation.current) return;

      const ads = require('react-native-google-mobile-ads');
      const unitId = intent.adUnitId;

      const rewarded = ads.RewardedAd.createForAdRequest(unitId, {
        serverSideVerificationOptions: {
          userId,
          customData: intent.customData,
        },
      });

      const subscriptions = [
        rewarded.addAdEventListener(ads.RewardedAdEventType.LOADED, () => {
          if (ticket === generation.current) {
            setAdInstance({ ad: rewarded, subscriptions, ticket });
            setIsLoaded(true);
          } else {
            subscriptions.forEach((s: { remove: () => void }) => s.remove());
          }
        }),
        rewarded.addAdEventListener(ads.RewardedAdEventType.EARNED_REWARD,
          (reward: { amount: number; type: string }) => {
            // UI feedback only. Never fulfil a reward from this client callback.
            if (ticket === generation.current) callbackRef.current?.(reward.amount, reward.type);
          }),
        rewarded.addAdEventListener(ads.AdEventType.CLOSED, () => {
          subscriptions.forEach((s: { remove: () => void }) => s.remove());
          if (ticket === generation.current) {
            setIsLoaded(false);
            setAdInstance(null);
          }
        }),
        rewarded.addAdEventListener(ads.AdEventType.ERROR, () => {
          subscriptions.forEach((s: { remove: () => void }) => s.remove());
          if (ticket === generation.current) {
            setIsLoaded(false);
            setAdInstance(null);
            setError('The ad could not be loaded. Please try again.');
          }
        }),
      ];
      rewarded.load();
    } catch (e: any) {
      if (ticket === generation.current) {
        setError(e?.response?.data?.detail || e?.message || 'Unable to prepare a rewarded ad.');
      }
    }
  }, [token, userId, rewardKind]);

  useEffect(() => {
    void loadRewardedAd();
    return () => { ++generation.current; };
  }, [loadRewardedAd]);

  const showRewardedAd = useCallback(async (): Promise<boolean> => {
    if (!adInstance || !isLoaded) return false;
    try {
      setIsLoaded(false);
      await adInstance.ad.show();
      return true;
    } catch (e: any) {
      setError(e?.message || 'Unable to show the ad.');
      return false;
    }
  }, [adInstance, isLoaded]);

  return { isLoaded, error, showRewardedAd, loadRewardedAd };
};
const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  mockAdContainer: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: Colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  fullWidthAdContainer: { maxWidth: '100%' },
  adLabelContainer: {
    position: 'absolute',
    top: 4,
    left: 8,
    flexDirection: 'row',
  },
  adLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: Colors.corporateBlue,
    textTransform: 'uppercase',
    backgroundColor: Colors.iceBlue,
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
    minWidth: 0,
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
    backgroundColor: Colors.corporateBlue,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    marginLeft: 8,
    flexShrink: 0,
  },
  ctaText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.white,
  },
});

export default AdBanner;

