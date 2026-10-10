import React from 'react';
import * as SplashScreen from 'expo-splash-screen';

import { Stack } from 'expo-router';
import { AuthProvider } from '../contexts/AuthContext';

void SplashScreen.preventAutoHideAsync().catch(() => {});

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
    </AuthProvider>
  );
}
