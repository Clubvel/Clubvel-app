import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';

const mockAlerts = [
  {
    id: '1',
    type: 'payment_due',
    message: 'Your Mamelodi Burial Society payment of R300 is due in 3 days.',
    time: new Date(),
    read: false,
  },
  {
    id: '2',
    type: 'payment_confirmed',
    message: 'Your R500 payment for Soshanguve Savings Club has been confirmed by your treasurer.',
    time: new Date(Date.now() - 86400000),
    read: true,
  },
  {
    id: '3',
    type: 'claim_upcoming',
    message: 'Great news! Your Soshanguve Savings Club claim of R5,000 is coming up on 23 August.',
    time: new Date(Date.now() - 172800000),
    read: true,
  },
];

export default function AlertsScreen() {
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
    const today: any[] = [];
    const yesterday: any[] = [];
    const earlier: any[] = [];

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);

    mockAlerts.forEach((alert) => {
      const alertDate = new Date(alert.time);
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

  const { today, yesterday, earlier } = groupByDate();

  const renderAlert = (alert: any) => {
    const icon = getAlertIcon(alert.type);
    return (
      <View key={alert.id} style={[styles.alertCard, !alert.read && styles.alertCardUnread]}>
        <View style={[styles.alertDot, { backgroundColor: icon.color }]} />
        <Ionicons name={icon.name} size={24} color={icon.color} style={styles.alertIcon} />
        <View style={styles.alertContent}>
          <Text style={styles.alertMessage}>{alert.message}</Text>
          <Text style={styles.alertTime}>{format(alert.time, 'h:mm a')}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Alerts</Text>
      </View>

      <ScrollView style={styles.content}>
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
  header: {
    backgroundColor: Colors.mediumGreen,
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 24,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.white,
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
