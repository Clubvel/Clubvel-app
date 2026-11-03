import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';

// Module scope is intentional: Expo Router must not auto-hide before the first
// session read. No timeout or minimum branding duration controls this lifecycle.
void SplashScreen.preventAutoHideAsync().catch(() => console.warn('Could not retain native splash.'));
SplashScreen.setOptions({ fade: false, duration: 0 });

export function StartupGate({ children }: { children: React.ReactNode }) {
  const { loading, user, refreshSession } = useAuth();
  const { workspaceError } = useWorkspace();
  const segments = useSegments();
  const router = useRouter();
  const [fontsReady, fontError] = useFonts(Ionicons.font);
  const [laidOut, setLaidOut] = useState(false);
  const dismissed = useRef(false);
  const protectedRoute = segments[0] === '(member)' || segments[0] === '(treasurer)';
  const routeReady = segments.length > 0 && (!protectedRoute || !!user);

  useEffect(() => {
    if (!loading && !user && protectedRoute) router.replace('/auth');
  }, [loading, user, protectedRoute, router]);

  useEffect(() => {
    // A failed membership request must expose the existing Retry/Personal Home
    // controls rather than leave a permanent splash over an error dialog.
    if (!dismissed.current && !loading && laidOut && (fontsReady || fontError) && (routeReady || workspaceError)) {
      dismissed.current = true;
      void SplashScreen.hideAsync().catch(() => console.warn('Could not dismiss native splash.'));
    }
  }, [loading, laidOut, fontsReady, fontError, routeReady, workspaceError]);

  return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} onLayout={() => setLaidOut(true)} onTouchStart={refreshSession}>{children}</View>;
}
