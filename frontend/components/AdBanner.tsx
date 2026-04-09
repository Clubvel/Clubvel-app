import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Linking } from 'react-native';
import { Colors } from '../constants/Colors';
import { isAdMobAvailable, getAdUnitId, logAdEvent, isDevelopment } from '../services/adMobService';

// Mock ad content for development/Expo Go
const MOCK_ADS = [
  {
    title: 'Grow Your Savings',
    body: 'Join thousands of South Africans building wealth together with community savings.',
    url: 'https://example.com/savings',
  },
  {
    title: 'FNB Business Account',
    body: 'Open a business account for your stokvel. Zero monthly fees for 6 months.',
    url: 'https://example.com/fnb',
  },
  {
    title: 'Capitec Save & Invest',
    body: 'Earn up to 11% interest on your stokvel funds. Start today!',
    url: 'https://example.com/capitec',
  },
  {
    title: 'Old Mutual Funeral Cover',
    body: 'Protect your family. Funeral cover from R50/month for your burial society.',
    url: 'https://example.com/oldmutual',
  },
  {
    title: 'Standard Bank Money Market',
    body: 'Grow your group savings with competitive interest rates.',
    url: 'https://example.com/standardbank',
  },
];

interface AdBannerProps {
  size?: 'banner' | 'largeBanner' | 'mediumRectangle';
  style?: any;
}

// Get banner size dimensions
const getBannerSize = (size: string) => {
  switch (size) {
    case 'largeBanner':
      return { width: 320, height: 100 };
    case 'mediumRectangle':
      return { width: 300, height: 250 };
    default:
      return { width: 320, height: 50 };
  }
};

export const AdBanner: React.FC<AdBannerProps> = ({ size = 'banner', style }) => {
  const [mockAd, setMockAd] = useState(MOCK_ADS[0]);
  const [adLoaded, setAdLoaded] = useState(false);
  const [useNativeAd, setUseNativeAd] = useState(false);

  useEffect(() => {
    // Check if native AdMob is available
    const nativeAvailable = isAdMobAvailable();
    setUseNativeAd(nativeAvailable);

    if (!nativeAvailable) {
      // Rotate mock ads every 30 seconds
      const randomAd = MOCK_ADS[Math.floor(Math.random() * MOCK_ADS.length)];
      setMockAd(randomAd);
      setAdLoaded(true);

      const interval = setInterval(() => {
        const newAd = MOCK_ADS[Math.floor(Math.random() * MOCK_ADS.length)];
        setMockAd(newAd);
      }, 30000);

      return () => clearInterval(interval);
    }
  }, []);

  const handleMockAdPress = () => {
    logAdEvent({
      type: 'ad_clicked',
      adType: 'banner',
      timestamp: new Date(),
    });
    // In production, this would open the advertiser's URL
    // Linking.openURL(mockAd.url);
  };

  // Native AdMob Banner (only works in EAS builds)
  if (useNativeAd) {
    try {
      const { BannerAd, BannerAdSize } = require('react-native-google-mobile-ads');
      const adUnitId = getAdUnitId('banner');

      const adSize = size === 'largeBanner' 
        ? BannerAdSize.LARGE_BANNER 
        : size === 'mediumRectangle'
          ? BannerAdSize.MEDIUM_RECTANGLE
          : BannerAdSize.BANNER;

      return (
        <View style={[styles.container, style]}>
          <BannerAd
            unitId={adUnitId}
            size={adSize}
            requestOptions={{
              requestNonPersonalizedAdsOnly: false,
            }}
            onAdLoaded={() => {
              setAdLoaded(true);
              logAdEvent({ type: 'ad_loaded', adType: 'banner', timestamp: new Date() });
            }}
            onAdFailedToLoad={(error: any) => {
              logAdEvent({ type: 'ad_failed_to_load', adType: 'banner', timestamp: new Date(), error: error.message });
            }}
          />
        </View>
      );
    } catch (error) {
      // Fall back to mock ad if native fails
      setUseNativeAd(false);
    }
  }

  // Mock Banner Ad (for Expo Go / Web preview)
  const dimensions = getBannerSize(size);
  
  return (
    <View style={[styles.container, style]}>
      <TouchableOpacity 
        style={[styles.mockAdContainer, { minHeight: dimensions.height }]}
        onPress={handleMockAdPress}
        activeOpacity={0.9}
      >
        <View style={styles.adLabelContainer}>
          <Text style={styles.adLabel}>Ad</Text>
          {isDevelopment && <Text style={styles.mockLabel}> (Demo)</Text>}
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

// Interstitial Ad Hook
export const useInterstitialAd = () => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const interstitialRef = React.useRef<any>(null);

  const loadInterstitial = async () => {
    if (isLoading) return;
    
    if (!isAdMobAvailable()) {
      // Mock mode - always "loaded"
      setIsLoaded(true);
      return;
    }

    try {
      const { InterstitialAd, AdEventType } = require('react-native-google-mobile-ads');
      setIsLoading(true);

      const adUnitId = getAdUnitId('interstitial');
      const interstitial = InterstitialAd.createForAdRequest(adUnitId);
      interstitialRef.current = interstitial;

      interstitial.addAdEventListener(AdEventType.LOADED, () => {
        setIsLoaded(true);
        setIsLoading(false);
        logAdEvent({ type: 'ad_loaded', adType: 'interstitial', timestamp: new Date() });
      });

      interstitial.addAdEventListener(AdEventType.ERROR, (error: any) => {
        setIsLoading(false);
        logAdEvent({ type: 'ad_failed_to_load', adType: 'interstitial', timestamp: new Date(), error: error.message });
      });

      interstitial.addAdEventListener(AdEventType.CLOSED, () => {
        setIsLoaded(false);
        logAdEvent({ type: 'ad_closed', adType: 'interstitial', timestamp: new Date() });
        // Preload next ad
        loadInterstitial();
      });

      interstitial.load();
    } catch (error) {
      setIsLoading(false);
      setIsLoaded(true); // Allow mock mode
    }
  };

  const showInterstitial = async (): Promise<boolean> => {
    if (!isAdMobAvailable()) {
      // Mock mode - just log
      logAdEvent({ type: 'ad_opened', adType: 'interstitial', timestamp: new Date() });
      console.log('[Mock] Interstitial ad would show here');
      return true;
    }

    if (isLoaded && interstitialRef.current) {
      try {
        await interstitialRef.current.show();
        return true;
      } catch (error) {
        console.error('Failed to show interstitial:', error);
        return false;
      }
    }
    return false;
  };

  useEffect(() => {
    loadInterstitial();
  }, []);

  return { isLoaded, showInterstitial, loadInterstitial };
};

// Rewarded Ad Hook
export const useRewardedAd = (onReward?: (amount: number, type: string) => void) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const rewardedRef = React.useRef<any>(null);

  const loadRewardedAd = async () => {
    if (isLoading) return;

    if (!isAdMobAvailable()) {
      // Mock mode - always "loaded"
      setIsLoaded(true);
      return;
    }

    try {
      const { RewardedAd, RewardedAdEventType } = require('react-native-google-mobile-ads');
      setIsLoading(true);

      const adUnitId = getAdUnitId('rewarded');
      const rewarded = RewardedAd.createForAdRequest(adUnitId);
      rewardedRef.current = rewarded;

      rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
        setIsLoaded(true);
        setIsLoading(false);
        logAdEvent({ type: 'ad_loaded', adType: 'rewarded', timestamp: new Date() });
      });

      rewarded.addAdEventListener(RewardedAdEventType.ERROR, (error: any) => {
        setIsLoading(false);
        logAdEvent({ type: 'ad_failed_to_load', adType: 'rewarded', timestamp: new Date(), error: error.message });
      });

      rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, (reward: any) => {
        logAdEvent({ 
          type: 'reward_earned', 
          adType: 'rewarded', 
          timestamp: new Date(),
          rewardAmount: reward.amount,
          rewardType: reward.type,
        });
        onReward?.(reward.amount, reward.type);
      });

      rewarded.addAdEventListener(RewardedAdEventType.CLOSED, () => {
        setIsLoaded(false);
        logAdEvent({ type: 'ad_closed', adType: 'rewarded', timestamp: new Date() });
        loadRewardedAd();
      });

      rewarded.load();
    } catch (error) {
      setIsLoading(false);
      setIsLoaded(true); // Allow mock mode
    }
  };

  const showRewardedAd = async (): Promise<boolean> => {
    if (!isAdMobAvailable()) {
      // Mock mode - simulate reward
      logAdEvent({ 
        type: 'reward_earned', 
        adType: 'rewarded', 
        timestamp: new Date(),
        rewardAmount: 10,
        rewardType: 'coins',
      });
      console.log('[Mock] Rewarded ad would show here - granting mock reward');
      onReward?.(10, 'coins');
      return true;
    }

    if (isLoaded && rewardedRef.current) {
      try {
        await rewardedRef.current.show();
        return true;
      } catch (error) {
        console.error('Failed to show rewarded ad:', error);
        return false;
      }
    }
    return false;
  };

  useEffect(() => {
    loadRewardedAd();
  }, []);

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
    backgroundColor: Colors.cardBackground,
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

