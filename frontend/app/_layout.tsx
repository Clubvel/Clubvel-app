import React, { useEffect, useRef } from 'react';
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
  useEffect(() => {
    if (loading || pathname === '/' || !pathname || released.current) return;
    const frame = requestAnimationFrame(() => {
      released.current = true;
      void SplashScreen.hideAsync().catch(() => {});
    });
    return () => cancelAnimationFrame(frame);
  }, [loading, pathname]);
  return null;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StartupSplash />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="(member)" />
        <Stack.Screen name="(treasurer)" />
      </Stack>
    </AuthProvider>
  );
}
