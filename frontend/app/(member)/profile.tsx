import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/auth');
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user?.full_name.charAt(0)}</Text>
        </View>
        <Text style={styles.name}>{user?.full_name}</Text>
        <Text style={styles.memberSince}>Member since 2024</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>2</Text>
            <Text style={styles.statLabel}>Clubs</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>R6,500</Text>
            <Text style={styles.statLabel}>Total Saved</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>95%</Text>
            <Text style={styles.statLabel}>On Time</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, styles.trustScoreValue]}>87</Text>
            <Text style={styles.statLabel}>Trust Score</Text>
          </View>
        </View>

        {/* Menu */}
        <View style={styles.menuSection}>
          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="people" size={24} color={Colors.mediumGreen} />
              <Text style={styles.menuItemText}>My Clubs</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="calendar" size={24} color={Colors.mediumGreen} />
              <Text style={styles.menuItemText}>Payout Schedule</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.menuItem}
            onPress={() => router.push('/(member)/trust-score')}
          >
            <View style={styles.menuItemLeft}>
              <Ionicons name="trophy" size={24} color={Colors.gold} />
              <Text style={styles.menuItemText}>Trust Score</Text>
            </View>
            <View style={styles.menuItemRight}>
              <View style={styles.trustScoreBadge}>
                <Text style={styles.trustScoreBadgeText}>87</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
            </View>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="card" size={24} color={Colors.mediumGreen} />
              <Text style={styles.menuItemText}>Financial Products</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="notifications" size={24} color={Colors.mediumGreen} />
              <Text style={styles.menuItemText}>Notification Settings</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity 
            style={styles.menuItem}
            onPress={() => router.push('/(member)/support')}
          >
            <View style={styles.menuItemLeft}>
              <Ionicons name="help-circle" size={24} color={Colors.mediumGreen} />
              <Text style={styles.menuItemText}>Help & Support</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.menuItem}
            onPress={() => router.push('/(member)/privacy')}
          >
            <View style={styles.menuItemLeft}>
              <Ionicons name="shield-checkmark" size={24} color={Colors.mediumGreen} />
              <Text style={styles.menuItemText}>Privacy Policy</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="log-out" size={24} color={Colors.statusLate} />
              <Text style={[styles.menuItemText, styles.logoutText]}>Sign Out</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Mock ad at bottom */}
        <View style={styles.adContainer}>
          <Text style={styles.adLabel}>Sponsored</Text>
          <View style={styles.adCard}>
            <Text style={styles.adTitle}>Your trust score opens doors</Text>
            <Text style={styles.adBody}>Pre-approved for a R50,000 personal loan at 15% interest. Apply now with no paperwork.</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.lightBackground,
  },
  header: {
    backgroundColor: Colors.darkGreen,
    paddingTop: 50,
    paddingBottom: 20,
    alignItems: 'center',
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.gold,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.white,
  },
  name: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.white,
    marginBottom: 4,
  },
  memberSince: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  content: {
    flex: 1,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.white,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  trustScoreValue: {
    color: Colors.mediumGreen,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  menuSection: {
    backgroundColor: Colors.white,
    marginHorizontal: 24,
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  menuItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuItemText: {
    fontSize: 16,
    color: Colors.textPrimary,
  },
  logoutText: {
    color: Colors.statusLate,
  },
  trustScoreBadge: {
    backgroundColor: Colors.mediumGreen,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  trustScoreBadgeText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.cardBorder,
    marginHorizontal: 16,
  },
  adContainer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
  adLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  adCard: {
    backgroundColor: Colors.lightGold,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gold,
  },
  adTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  adBody: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
});
