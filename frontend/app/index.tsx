import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';

export default function Index() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { restoreWorkspace } = useWorkspace();

  useEffect(() => {
    if (!loading) {
      if (user?.id) {
        void restoreWorkspace();
      } else {
        router.replace('/auth');
      }
    }
  }, [user?.id, loading, router, restoreWorkspace]);

  // The native splash owns cold-start branding. This route only resolves the
  // destination; the indicator remains useful on web and later in-app routing.
  return <View style={{ flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'center' }}>
    <ActivityIndicator accessibilityLabel="Opening Clubvel" color="#3F4145" />
  </View>;
}
