import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Image } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import axios from 'axios';
import { format } from 'date-fns';

interface Alert {
  id: string;
  user_id: string;
  group_id: string | null;
  alert_type: string;
  alert_message: string;
  created_at: string;
  read_status: boolean;
  action_url: string | null;
}

export default function AlertsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

  const fetchAlerts = async () => {
    try {
      // Fetch alerts from API - empty if no alerts
      const response = await fetch(`${API_URL}/api/alerts/${user?.id}`, {
        headers: { 'Authorization': `Bearer ${user?.id}` }
      });
      if (response.ok) {
        const data = await response.json();
        setAlerts(data.alerts || []);
      } else {
        setAlerts([]);
      }
    } catch (error) {
      console.error('Error fetching alerts:', error);
      setAlerts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAlerts();
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'payment_due':
        return { name: 'calendar' as const, color: Colors.gold };
      case 'payment_late':
        return { name: 'alert-circle' as const, color: Colors.statusLate };
      case 'payment_confirmed':
        return { name: 'checkmark-circle' as const, color: Colors.statusPaid };
      case 'claim_upcoming':
      case 'claim_paid':
        return { name: 'trophy' as const, color: Colors.gold };
      default:
        return { name: 'information-circle' as const, color: Colors.mediumGreen };
    }
  };

  const groupByDate = () => {
    const today: Alert[] = [];
    const yesterday: Alert[] = [];
    const earlier: Alert[] = [];

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);

    alerts.forEach((alert) => {
      const alertDate = new Date(alert.created_at);
      if (alertDate >= todayStart) {
        today.push(alert);
      } else if (alertDate >= yesterdayStart) {
        yesterday.push(alert);
      } else {
        earlier.push(alert);
      }
    });

    return { today, yesterday, earlier };
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.mediumGreen} />
      </View>
    );
  }

  const { today, yesterday, earlier } = groupByDate();

  const renderAlert = (alert: Alert) => {
    const icon = getAlertIcon(alert.alert_type);
    return (
      <View key={alert.id} style={[styles.alertCard, !alert.read_status && styles.alertCardUnread]}>
        <View style={[styles.alertDot, { backgroundColor: icon.color }]} />
        <Ionicons name={icon.name} size={24} color={icon.color} style={styles.alertIcon} />
        <View style={styles.alertContent}>
          <Text style={styles.alertMessage}>{alert.alert_message}</Text>
          <Text style={styles.alertTime}>{format(new Date(alert.created_at), 'h:mm a')}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header with Profile Photo */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Alerts</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(member)/profile')} style={styles.profileButton}>
          {user?.profile_photo ? (
            <Image source={{ uri: user.profile_photo }} style={styles.profileImage} />
          ) : (
            <View style={styles.profilePlaceholder}>
              <Ionicons name="person" size={20} color={Colors.white} />
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {today.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Today</Text>
            {today.map(renderAlert)}
          </View>
        )}

        {yesterday.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Yesterday</Text>
            {yesterday.map(renderAlert)}
          </View>
        )}

        {/* Mock Ad between groups */}
        {(today.length > 0 || yesterday.length > 0) && earlier.length > 0 && (
          <View style={styles.adContainer}>
            <Text style={styles.adLabel}>Sponsored</Text>
            <View style={styles.adCard}>
              <Text style={styles.adTitle}>Protect what matters</Text>
              <Text style={styles.adBody}>Get R50,000 funeral cover for your family from only R89/month. No waiting period.</Text>
            </View>
          </View>
        )}

        {earlier.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Earlier</Text>
            {earlier.map(renderAlert)}
          </View>
        )}

        {today.length === 0 && yesterday.length === 0 && earlier.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="notifications-outline" size={64} color={Colors.textMuted} />
            <Text style={styles.emptyStateText}>No alerts</Text>
            <Text style={styles.emptyStateSubtext}>You're all caught up!</Text>
          </View>
        )}
      </ScrollView>
    </View>
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
    backgroundColor: Colors.lightBackground,
  },
  header: {
    backgroundColor: Colors.mediumGreen,
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.white,
  },
  profileButton: {
    padding: 4,
  },
  profileImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: Colors.gold,
  },
  profilePlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.gold,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  alertCard: {
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  alertCardUnread: {
    backgroundColor: '#F0F9FF',
    borderColor: Colors.mediumGreen,
  },
  alertDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    position: 'absolute',
    top: 16,
    left: 16,
  },
  alertIcon: {
    marginLeft: 16,
    marginRight: 12,
  },
  alertContent: {
    flex: 1,
  },
  alertMessage: {
    fontSize: 14,
    color: Colors.textPrimary,
    lineHeight: 20,
    marginBottom: 4,
  },
  alertTime: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  adContainer: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  adLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  adCard: {
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
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
