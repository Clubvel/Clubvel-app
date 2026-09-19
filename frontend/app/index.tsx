import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';

export default function Index() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (user) {
        if (
          user.roles?.includes('admin') ||
          user.roles?.includes('treasurer') ||
          user.role === 'treasurer'
        ) {
          router.replace('/(treasurer)/dashboard');
        } else {
          router.replace('/(member)/home');
        }
      } else {
        router.replace('/auth');
      }
    }
  }, [user, loading, router]);

  return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;
}