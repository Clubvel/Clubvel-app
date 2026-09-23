import React, { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { workspaceRoute } from '../../services/workspace';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { View, ActivityIndicator } from 'react-native';
import { WorkspaceControls } from '../../components/WorkspaceControls';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TreasurerLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { ready, checking, workspaceError, selectedClub, restoreWorkspace } = useWorkspace();
  const authorized = selectedClub?.role === 'admin' || selectedClub?.role === 'treasurer';
  useEffect(() => {
    if (!checking && !workspaceError) {
      if (!ready) void restoreWorkspace();
      else if (!authorized) router.replace(workspaceRoute(selectedClub));
    }
  }, [ready, checking, workspaceError, authorized, restoreWorkspace, selectedClub, router]);
  if (!ready || checking || workspaceError || !authorized) {
    return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={Colors.primary} /><WorkspaceControls /></View>;
  }
  
  return (
    <View style={{ flex: 1 }}>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.mediumGreen,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.white,
          borderTopWidth: 1,
          borderTopColor: Colors.cardBorder,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 8),
          height: 60 + Math.max(insets.bottom, 8),
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginBottom: 4,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="members"
        options={{
          title: 'Members',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="contributions"
        options={{
          title: 'Payments',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cash" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="claims"
        options={{
          title: 'Claims',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trophy" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="my-contributions"
        options={{
          title: 'My Payments',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="wallet" size={size} color={color} />
          ),
        }}
      />
      {/* Hidden screens - not in tab bar */}
      <Tabs.Screen
        name="reports"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="support"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="privacy"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="about"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="club-detail"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          href: null,
        }}
      />
    </Tabs>
    <WorkspaceControls />
    </View>
  );
}
