import React, { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

import { Stack, usePathname } from 'expo-router';
import { AuthProvider, useAuth } from '../contexts/AuthContext';

// Android's installed Expo implementation animates duration even when fade is false.
SplashScreen.setOptions({ fade: false, duration: 0 });
void SplashScreen.preventAutoHideAsync().catch(() => {});

// Hand off once the complete brand image is loaded and laid out. Keep the in-app
// screen until authentication and destination routing finish; never cross-fade logos.
export function StartupSplash() {
  const { loading } = useAuth();
  const pathname = usePathname();
  const released = useRef(false);
  const nativeHidden = useRef(false);
  const [layoutReady, setLayoutReady] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [brandReady, setBrandReady] = useState(false);
  const [finished, setFinished] = useState(false);
  useEffect(() => {
    if (!layoutReady || !imageReady || nativeHidden.current) return;
    nativeHidden.current = true;
    let current = true;
    void SplashScreen.hideAsync().then(() => { if (current) setBrandReady(true); }).catch(() => { if (current) setBrandReady(true); });
    return () => { current = false; };
  }, [layoutReady, imageReady]);
  useEffect(() => {
    if (!brandReady || loading || pathname === '/' || !pathname || released.current) return;
    const frame = requestAnimationFrame(() => {
      released.current = true;
      setFinished(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [brandReady, loading, pathname]);
  if (finished) return null;
  return <View accessibilityLabel="Clubvel launch screen" style={launchStyles.screen} onLayout={() => setLayoutReady(true)}>
    <Image source={require('../assets/images/clubvel-midnight-symbol.png')} accessibilityLabel="clubvel" onLoad={() => setImageReady(true)} resizeMode="contain" style={launchStyles.logo} />
  </View>;
}

const launchStyles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFillObject, backgroundColor: '#06285B', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  logo: { width: 200, maxWidth: '80%', aspectRatio: 1 },
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
