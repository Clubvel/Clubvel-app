import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { SafeAreaView } from 'react-native-safe-area-context';

interface NotificationPrefs {
  contribution_reminders: boolean;
  claim_updates: boolean;
  group_announcements: boolean;
}

export default function NotificationPreferencesScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPrefs>({
    contribution_reminders: false,
    claim_updates: false,
    group_announcements: false,
  });

  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

  useEffect(() => {
    fetchPreferences();
  }, []);

  const fetchPreferences = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/user/notification-preferences/${user?.id}`);
      setPreferences({
        contribution_reminders: response.data.contribution_reminders || false,
        claim_updates: response.data.claim_updates || false,
        group_announcements: response.data.group_announcements || false,
      });
    } catch (error) {
      console.error('Error fetching notification preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const updatePreference = async (key: keyof NotificationPrefs, value: boolean) => {
    // Optimistic update
    setPreferences(prev => ({ ...prev, [key]: value }));
    setSaving(true);

    try {
      await axios.put(`${API_URL}/api/user/notification-preferences`, {
        user_id: user?.id,
        [key]: value,
      });
    } catch (error) {
      console.error('Error updating notification preferences:', error);
      // Revert on error
      setPreferences(prev => ({ ...prev, [key]: !value }));
      Alert.alert('Error', 'Failed to update notification preferences. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primaryGreen} />
          <Text style={styles.loadingText}>Loading preferences...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('/(member)/profile')} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notification Preferences</Text>
        {saving && <ActivityIndicator size="small" color={Colors.primaryGreen} style={styles.savingIndicator} />}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoIconContainer}>
            <Ionicons name="information-circle" size={24} color={Colors.primaryGreen} />
          </View>
          <Text style={styles.infoText}>
            Choose which notifications you'd like to receive. All notifications are off by default to protect your privacy.
          </Text>
        </View>

        {/* Notification Options */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Push Notifications</Text>

          {/* Contribution Reminders */}
          <View style={styles.preferenceItem}>
            <View style={styles.preferenceInfo}>
              <View style={styles.preferenceIconContainer}>
                <Ionicons name="cash-outline" size={24} color={Colors.primaryGreen} />
              </View>
              <View style={styles.preferenceTextContainer}>
                <Text style={styles.preferenceTitle}>Contribution Reminders</Text>
                <Text style={styles.preferenceDescription}>
                  Get notified about upcoming payment due dates and payment confirmations
                </Text>
              </View>
            </View>
            <Switch
              value={preferences.contribution_reminders}
              onValueChange={(value) => updatePreference('contribution_reminders', value)}
              trackColor={{ false: Colors.cardBorder, true: Colors.lightGreen }}
              thumbColor={preferences.contribution_reminders ? Colors.primaryGreen : Colors.textMuted}
            />
          </View>

          {/* Claim Updates */}
          <View style={styles.preferenceItem}>
            <View style={styles.preferenceInfo}>
              <View style={styles.preferenceIconContainer}>
                <Ionicons name="gift-outline" size={24} color={Colors.gold} />
              </View>
              <View style={styles.preferenceTextContainer}>
                <Text style={styles.preferenceTitle}>Claim Updates</Text>
                <Text style={styles.preferenceDescription}>
                  Get notified when it's your turn to claim or when claims are processed
                </Text>
              </View>
            </View>
            <Switch
              value={preferences.claim_updates}
              onValueChange={(value) => updatePreference('claim_updates', value)}
              trackColor={{ false: Colors.cardBorder, true: Colors.lightGold }}
              thumbColor={preferences.claim_updates ? Colors.gold : Colors.textMuted}
            />
          </View>

          {/* Group Announcements */}
          <View style={styles.preferenceItem}>
            <View style={styles.preferenceInfo}>
              <View style={styles.preferenceIconContainer}>
                <Ionicons name="megaphone-outline" size={24} color={Colors.mediumGreen} />
              </View>
              <View style={styles.preferenceTextContainer}>
                <Text style={styles.preferenceTitle}>Group Announcements</Text>
                <Text style={styles.preferenceDescription}>
                  Get notified about important group updates and announcements from your treasurer
                </Text>
              </View>
            </View>
            <Switch
              value={preferences.group_announcements}
              onValueChange={(value) => updatePreference('group_announcements', value)}
              trackColor={{ false: Colors.cardBorder, true: Colors.lightGreen }}
              thumbColor={preferences.group_announcements ? Colors.mediumGreen : Colors.textMuted}
            />
          </View>
        </View>

        {/* Privacy Note */}
        <View style={styles.privacyNote}>
          <Ionicons name="shield-checkmark-outline" size={20} color={Colors.textSecondary} />
          <Text style={styles.privacyText}>
            Your notification preferences are stored securely. You can change these settings at any time. We respect your privacy in accordance with POPIA.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.lightBackground,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: Colors.textSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  savingIndicator: {
    marginLeft: 8,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: Colors.lightGreen,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.primaryGreen,
  },
  infoIconContainer: {
    marginRight: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  preferenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  preferenceInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginRight: 12,
  },
  preferenceIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.lightBackground,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  preferenceTextContainer: {
    flex: 1,
  },
  preferenceTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  preferenceDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  privacyText: {
    flex: 1,
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginLeft: 12,
  },
});
