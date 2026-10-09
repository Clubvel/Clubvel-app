import ProfilePhotoViewer from '../../components/ProfilePhotoViewer';
import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Image, Alert as NativeAlert } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
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
  claim_id?: string | null;
}

export default function AlertsScreen() {
  const [photoExpanded, setPhotoExpanded] = React.useState(false);
  const { user, token } = useAuth();
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

  const [error, setError] = useState<string | null>(null);
  const [loadedContext, setLoadedContext] = useState<string | null>(null);
  const context = JSON.stringify([API_URL, user?.id, token]);
  const latestContext = useRef(context);
  latestContext.current = context;
  const request = useRef<{ key: string; sequence: number } | null>(null);
  const sequence = useRef(0);

  const fetchAlerts = useCallback(async (force = false) => {
    if (!user?.id || !token) {
      setError('Please sign in again to view your alerts.');
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const key = JSON.stringify([API_URL, user.id, token]);
    if (!force && request.current?.key === key) return;
    const ticket = ++sequence.current;
    request.current = { key, sequence: ticket };
    setError(null);
    setRefreshing(true);
    try {
      const response = await axios.get(`${API_URL}/api/alerts/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 15000,
      });
      if (ticket !== sequence.current || latestContext.current !== key) return;
      if (!Array.isArray(response.data?.alerts)) throw new Error('Invalid alerts response');
      setAlerts(response.data.alerts);
      setLoadedContext(key);
    } catch {
      if (ticket === sequence.current && latestContext.current === key) {
        setError('Unable to load alerts. Please try again.');
      }
    } finally {
      if (request.current?.sequence === ticket) {
        request.current = null;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [API_URL, user?.id, token]);

  useFocusEffect(useCallback(() => { void fetchAlerts(); }, [fetchAlerts]));

  const dismissing = useRef(new Set<string>());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const dismissAlert = async (alert: Alert) => {
    if (dismissing.current.has(alert.id)) return;
    const key = context;
    dismissing.current.add(alert.id);
    try {
      await axios.post(`${API_URL}/api/alerts/${alert.id}/dismiss`, {}, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 15000,
      });
      if (latestContext.current !== key) return;
      setDismissedIds(previous => new Set([...previous, `${key}:${alert.id}`]));
      setAlerts(previous => previous.filter(item => item.id !== alert.id));
    } catch {
      NativeAlert.alert('Unable to dismiss alert', 'Please try again.');
    } finally { dismissing.current.delete(alert.id); }
  };

  const onRefresh = () => { void fetchAlerts(true); };

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

    (loadedContext === context ? alerts : []).filter(alert => !dismissedIds.has(`${context}:${alert.id}`)).forEach((alert) => {
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

  if ((loading || loadedContext !== context) && !error) {
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
          <TouchableOpacity disabled={!alert.action_url} onPress={() => {
            if (alert.action_url === '/(member)/claims') router.push({ pathname: '/(member)/claims', params: alert.claim_id ? { claim_id: alert.claim_id } : {} });
            else if (alert.action_url === '/(member)/proofs') router.push(alert.action_url);
          }}>
            <Text style={styles.alertMessage}>{alert.alert_message}</Text>
          </TouchableOpacity>
          <Text style={styles.alertTime}>{format(new Date(alert.created_at), 'h:mm a')}</Text>
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Dismiss alert" hitSlop={8}
          onPress={() => void dismissAlert(alert)}>
          <Ionicons name="close" size={18} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ProfilePhotoViewer visible={photoExpanded} photoUri={user?.profile_photo} displayName={user?.full_name} onClose={() => setPhotoExpanded(false)} />
      {/* Header with Profile Photo */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => user?.profile_photo ? setPhotoExpanded(true) : router.push('/(member)/profile')} style={styles.profileButton}>
          {user?.profile_photo ? (
            <Image source={{ uri: user.profile_photo }} style={styles.profileImage} resizeMode="cover" />
          ) : (
            <View style={styles.profilePlaceholder}>
              <Ionicons name="person" size={32} color={Colors.white} />
            </View>
          )}
        </TouchableOpacity>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Alerts</Text>
        </View>
      
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {error && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>{error}</Text>
            <TouchableOpacity onPress={() => void fetchAlerts(true)}>
              <Text style={styles.emptyStateSubtext}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}
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

        {!error && today.length === 0 && yesterday.length === 0 && earlier.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="notifications-outline" size={64} color={Colors.accent} />
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
    gap: 16,
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
    flexShrink: 0,
  },
  profileImage: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 2,
    borderColor: Colors.gold,
  },
  profilePlaceholder: {
    width: 104,
    height: 104,
    borderRadius: 52,
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
