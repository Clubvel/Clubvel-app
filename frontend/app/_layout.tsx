import React from 'react';
import { Stack } from 'expo-router';
import { AuthProvider } from '../contexts/AuthContext';
import { WorkspaceProvider } from '../contexts/WorkspaceContext';
import { WorkspaceProgress } from '../components/WorkspaceControls';
import { StartupGate } from '../components/StartupGate';

export default function RootLayout() {
  return (
    <AuthProvider>
      <WorkspaceProvider>
      <StartupGate>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="(member)" />
        <Stack.Screen name="(treasurer)" />
      </Stack>
      <WorkspaceProgress />
      </StartupGate>
      </WorkspaceProvider>
    </AuthProvider>
  );
}
