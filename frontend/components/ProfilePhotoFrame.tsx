import React from 'react';
import { View } from 'react-native';
import { Colors } from '../constants/Colors';

// Stateless framing only: image sources, loading, ownership and tap handlers stay with callers.
export default function ProfilePhotoFrame({ children, size = 112, tone = 'dark' }: {
  children: React.ReactNode; size?: number; tone?: 'light' | 'dark';
}) {
  const ring = size <= 48 ? 1 : 2;
  const diameter = size + ring * 4;
  return <View pointerEvents="box-none" style={{ width: diameter, height: diameter, borderRadius: diameter / 2,
    padding: ring, borderWidth: ring, borderColor: tone === 'dark' ? Colors.white : Colors.corporateBlue,
    backgroundColor: tone === 'dark' ? Colors.iceBlue : Colors.white,
    shadowColor: Colors.midnightNavy, shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}>
    {children}
  </View>;
}
