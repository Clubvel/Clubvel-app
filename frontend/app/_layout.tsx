import React from 'react';
import { Stack } from 'expo-router';
import { AuthProvider } from '../contexts/AuthContext';
import { WorkspaceProvider } from '../contexts/WorkspaceContext';
import { WorkspaceProgress } from '../components/WorkspaceControls';

export default function RootLayout() {
  return (
    <AuthProvider>
      <WorkspaceProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="(member)" />
        <Stack.Screen name="(treasurer)" />
      </Stack>
      <WorkspaceProgress />
      </WorkspaceProvider>
    </AuthProvider>
  );
}
