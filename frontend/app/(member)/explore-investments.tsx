import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';

export default function ExploreInvestmentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(member)/proofs');
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" onPress={goBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.white} />
        </TouchableOpacity>
        <Text accessibilityRole="header" style={styles.headerTitle}>Explore Investments</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        <Text style={styles.introduction}>Discover savings and investment options for your group.</Text>

        <View style={styles.emptyState}>
          <Ionicons name="trending-up-outline" size={40} color={Colors.accent} />
          <Text accessibilityRole="header" style={styles.emptyTitle}>Product listings coming soon</Text>
          <Text style={styles.emptyDescription}>Savings and investment products will appear here as Clubvel adds verified provider options.</Text>
        </View>

        <Text style={styles.informationNote}>Clubvel provides product discovery and information, not personal investment advice.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.lightBackground },
  header: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backButton: { width: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: 'bold', color: Colors.white, textAlign: 'center' },
  headerSpacer: { width: 44 },
  content: { padding: 24, gap: 24 },
  introduction: { fontSize: 16, lineHeight: 24, color: Colors.textSecondary },
  emptyState: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary, textAlign: 'center', marginTop: 16 },
  emptyDescription: { fontSize: 14, lineHeight: 22, color: Colors.textSecondary, textAlign: 'center', marginTop: 8 },
  informationNote: { fontSize: 13, lineHeight: 20, color: Colors.textSecondary },
});
