import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function HomeSponsoredCard() {
  const openInfo = () => Alert.alert('Sponsored content', 'This is a design preview. Live advertiser content and tracking are not connected yet.');
  return (
    <View style={styles.card} accessibilityLabel="Sponsored content preview">
      <View style={styles.topRow}>
        <View style={styles.labelRow}><Ionicons name="megaphone-outline" size={13} color="#FFFFFF" /><Text style={styles.label}>SPONSORED</Text></View>
        <Text style={styles.adLabel}>ADVERTISEMENT</Text>
      </View>
      <Text style={styles.title}>Offers for your{ '\n' }everyday needs</Text>
      <View style={styles.rule} />
      <View style={styles.bottomRow}>
        <Text style={styles.description}>Products and services from{ '\n' }participating advertisers</Text>
        <TouchableOpacity style={styles.action} onPress={openInfo} accessibilityRole="button" accessibilityLabel="Learn more about sponsored content">
          <Ionicons name="arrow-up-right" size={21} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  card: { margin: 0, paddingHorizontal: 20, paddingTop: 17, paddingBottom: 19, backgroundColor: '#D96540' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  adLabel: { color: '#FFFFFF', fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  title: { color: '#FFFFFF', fontSize: 21, lineHeight: 27, fontWeight: '500' },
  rule: { height: 1, backgroundColor: 'rgba(255,255,255,0.22)', marginTop: 12, marginBottom: 12 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  description: { color: '#FFFFFF', fontSize: 12, lineHeight: 16, flex: 1 },
  action: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
});
