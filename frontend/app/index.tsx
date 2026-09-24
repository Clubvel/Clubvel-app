import React, { useEffect } from 'react';
import { View, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';

export default function Index() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { restoreWorkspace } = useWorkspace();

  useEffect(() => {
    if (!loading) {
      if (user) {
        void restoreWorkspace();
      } else {
        router.replace('/auth');
      }
    }
  }, [user?.id, loading, router, restoreWorkspace]);

  return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
    <Image source={require('../assets/images/clubvel-community-splash.png')}
      resizeMode="contain" accessibilityLabel="clubvel — save, plan, grow together"
      style={{ width: '100%', height: '100%' }} />
  </View>;
}
