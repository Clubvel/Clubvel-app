import React from 'react';
import { View } from 'react-native';
import { Colors } from '../constants/Colors';

// Stateless framing only: image sources, loading, ownership and tap handlers stay with callers.
export default function ProfilePhotoFrame({ children, size = 112, tone = 'dark' }: {
  children: React.ReactNode; size?: number; tone?: 'light' | 'dark';
}) {
  const ring = 2;
  const diameter = size + ring * 2;
  return <View pointerEvents="box-none" style={{ width: diameter, height: diameter, borderRadius: diameter / 2,
    borderWidth: ring, borderColor: Colors.avatarRing,
    backgroundColor: tone === 'dark' ? Colors.primary : Colors.white }}>
    {children}
  </View>;
}
