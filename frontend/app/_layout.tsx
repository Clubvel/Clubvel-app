import React, { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

import { Stack, usePathname } from 'expo-router';
import { AuthProvider, useAuth } from '../contexts/AuthContext';

void SplashScreen.preventAutoHideAsync().catch(() => {});

// Keep the native splash until authentication has resolved and the destination
// route has committed, rather than dismissing it while Index is still redirecting.
export function StartupSplash() {
  const { loading } = useAuth();
  const pathname = usePathname();
  const released = useRef(false);
  const nativeHidden = useRef(false);
  const [brandReady, setBrandReady] = useState(false);
  const [finished, setFinished] = useState(false);
  const revealBrand = () => {
    if (nativeHidden.current) return;
    nativeHidden.current = true;
    setBrandReady(true);
    void SplashScreen.hideAsync().catch(() => {});
  };
  useEffect(() => {
    if (!brandReady || loading || pathname === '/' || !pathname || released.current) return;
    const frame = requestAnimationFrame(() => {
      released.current = true;
      setFinished(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [brandReady, loading, pathname]);
  if (finished) return null;
  return <View accessibilityLabel="Clubvel launch screen" style={launchStyles.screen} onLayout={revealBrand}>
    <Image source={require('../assets/images/clubvel-corporate-splash.png')} accessibilityLabel="clubvel" resizeMode="contain" style={launchStyles.logo} />
  </View>;
}

const launchStyles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFillObject, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  logo: { width: '82%', maxWidth: 360, aspectRatio: 1 },
});

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="(member)" />
        <Stack.Screen name="(treasurer)" />
      </Stack>
      <StartupSplash />
    </AuthProvider>
  );
}
