/**
 * AdMob Service for Clubvel App
 * 
 * This service provides AdMob integration with automatic fallback to mock ads
 * when running in Expo Go or web preview (where native modules aren't available).
 * 
 * When built with EAS Build, real AdMob ads will be displayed.
 */

import { Platform } from 'react-native';

// Ad Unit IDs - Replace with your actual AdMob IDs when ready for production
// These are Google's test ad unit IDs for development
export const AD_UNIT_IDS = {
  // Test IDs (safe for development)
  test: {
    banner: {
      ios: 'ca-app-pub-3940256099942544/2934735716',
      android: 'ca-app-pub-3940256099942544/6300978111',
    },
    interstitial: {
      ios: 'ca-app-pub-3940256099942544/4411468910',
      android: 'ca-app-pub-3940256099942544/1033173712',
    },
    rewarded: {
      ios: 'ca-app-pub-3940256099942544/1712485313',
      android: 'ca-app-pub-3940256099942544/5224354917',
    },
  },
  // Production IDs - Replace these with your actual AdMob ad unit IDs
  production: {
    banner: {
      ios: 'ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY',
      android: 'ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY',
    },
    interstitial: {
      ios: 'ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY',
      android: 'ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY',
    },
    rewarded: {
      ios: 'ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY',
      android: 'ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY',
    },
  },
};

// App IDs - Replace with your actual AdMob App IDs
export const APP_IDS = {
  ios: 'ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY',
  android: 'ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY',
};

// Check if we're in development mode
export const isDevelopment = __DEV__;

// Get the appropriate ad unit ID based on environment and platform
export const getAdUnitId = (adType: 'banner' | 'interstitial' | 'rewarded'): string => {
  const env = isDevelopment ? 'test' : 'production';
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  return AD_UNIT_IDS[env][adType][platform];
};

// Check if AdMob native module is available
export const isAdMobAvailable = (): boolean => {
  try {
    // This will only succeed in EAS builds with native modules
    require('react-native-google-mobile-ads');
    return true;
  } catch {
    return false;
  }
};

// AdMob configuration for app.json plugins
export const ADMOB_CONFIG = {
  androidAppId: APP_IDS.android,
  iosAppId: APP_IDS.ios,
  userTrackingUsageDescription: 'This allows Clubvel to show you relevant ads and improve your experience.',
};

// Ad event types for analytics
export type AdEventType = 
  | 'ad_loaded'
  | 'ad_failed_to_load'
  | 'ad_opened'
  | 'ad_closed'
  | 'ad_clicked'
  | 'reward_earned';

export interface AdEvent {
  type: AdEventType;
  adType: 'banner' | 'interstitial' | 'rewarded';
  timestamp: Date;
  error?: string;
  rewardAmount?: number;
  rewardType?: string;
}

// Simple analytics logging (can be extended to send to backend)
export const logAdEvent = (event: AdEvent): void => {
  if (isDevelopment) {
    console.log('[AdMob Event]', event);
  }
  // TODO: Send to backend analytics
  // fetch('/api/analytics/ad-event', { method: 'POST', body: JSON.stringify(event) });
};
