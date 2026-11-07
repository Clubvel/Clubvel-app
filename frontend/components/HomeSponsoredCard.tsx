import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';

export default function HomeSponsoredCard() {
  const openInfo = () => {
    Alert.alert(
      'Sponsored content',
      'This is a design preview. Live advertiser content and tracking are not connected yet.'
    );
  };

  return (
    <View style={styles.card} accessibilityLabel="Sponsored content preview">
      <View style={styles.topRow}>
        <View style={styles.labelRow}>
          <Ionicons name="megaphone-outline" size={15} color={Colors.clementineDark} />
          <Text style={styles.label}>SPONSORED</Text>
        </View>
        <Text style={styles.adLabel}>ADVERTISEMENT</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="wallet-outline" size={27} color={Colors.white} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>Offers for your everyday needs</Text>
          <Text style={styles.description}>
            Discover relevant products and services from participating advertisers.
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.action}
        onPress={openInfo}
        accessibilityRole="button"
        accessibilityLabel="Learn more about sponsored content"
      >
        <Text style={styles.actionText}>LEARN MORE</Text>
        <Ionicons name="arrow-forward" size={16} color={Colors.white} />
      </TouchableOpacity>
      <Text style={styles.disclaimer}>Design preview · No live advertiser connected</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    padding: 14,
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: {
    color: Colors.clementineDark,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  adLabel: { color: Colors.textMuted, fontSize: 9, letterSpacing: 0.5 },
  content: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 14,
    backgroundColor: Colors.midnightNavy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1 },
  title: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  description: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  action: {
    marginTop: 14,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: Colors.clementine,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionText: { color: Colors.white, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  disclaimer: { color: Colors.textMuted, fontSize: 10, marginTop: 9, textAlign: 'center' },
});
