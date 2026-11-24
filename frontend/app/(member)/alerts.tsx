import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProfilePhotoViewer from '../../components/ProfilePhotoViewer';
import ProfilePhotoFrame from '../../components/ProfilePhotoFrame';
import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Image, Modal, Alert as NativeAlert } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import axios from 'axios';
import { format } from 'date-fns';
import { AdBanner } from '../../components/AdBanner';
import ClubvelSpotlight from '../../components/ClubvelSpotlight';

import HomeSponsoredCard from '../../components/HomeSponsoredCard';
interface Club {
  id: string;
  name: string;
  group_photo?: string | null;
  membership_status?: string;
  role?: string;
}

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
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [clubNames, setClubNames] = useState<Record<string, string>>({});
  const [clubs, setClubs] = useState<Club[]>([]);
  const [myAlertsExpanded, setMyAlertsExpanded] = useState(false);
  const [chatsExpanded, setChatsExpanded] = useState(false);
  const [alertsMenuExpanded, setAlertsMenuExpanded] = useState(false);
  const [expandedClubs, setExpandedClubs] = useState<Record<string, boolean>>({});
  const panelScroll = useRef<ScrollView>(null);
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
      try {
        const cr = await axios.get(`${API_URL}/api/member/clubs/${user.id}`, {
          headers: { Authorization: `Bearer ${token}` }, timeout: 15000,
        });
        if (ticket === sequence.current && latestContext.current === key) {
          const names: Record<string, string> = {};
          for (const item of cr.data?.clubs || []) {
            if (item?.id && item?.name) names[item.id] = item.name;
          }
          setClubNames(names);
          setClubs((cr.data?.clubs || []).filter((item: Club) => item?.id && item?.name));
        }
      } catch { /* Keep previously loaded club names if this request fails. */ }
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

  useFocusEffect(useCallback(() => {
    void fetchAlerts();
    return () => {
      setAlertsMenuExpanded(false);
      setMyAlertsExpanded(false);
      setExpandedClubs({});
      panelScroll.current?.scrollTo({ y: 0, animated: false });
    };
  }, [fetchAlerts]));

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
        return { name: 'calendar' as const, color: '#343A40' };
      case 'payment_late':
        return { name: 'alert-circle' as const, color: '#D96540' };
      case 'payment_confirmed':
        return { name: 'checkmark-circle' as const, color: '#343A40' };
      case 'claim_upcoming':
      case 'claim_paid':
        return { name: 'trophy' as const, color: '#E4C447' };
      default:
        return { name: 'information-circle' as const, color: '#343A40' };
    }
  };

  const visibleAlerts = loadedContext === context
    ? alerts.filter(alert => !dismissedIds.has(`${context}:${alert.id}`))
    : [];

  const clubGroups = Array.from(visibleAlerts.reduce((map, alert) => {
    const id = alert.group_id || '__general__';
    if (!map.has(id)) map.set(id, {
      id,
      name: id === '__general__' ? 'General Alerts' : (clubNames[id] || 'Club Alerts'),
      alerts: [] as Alert[],
    });
    map.get(id)!.alerts.push(alert);
    return map;
  }, new Map<string, { id: string; name: string; alerts: Alert[] }>()).values());

  if ((loading || loadedContext !== context) && !error) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#343A40" />
      </View>
    );
  }


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
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <View style={styles.headerTitleRow} />
        <View style={styles.welcomeRow}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Expand profile photo"
            style={styles.profileButton}
            onPress={() => user?.profile_photo ? setPhotoExpanded(true) : router.push('/(member)/profile')}
          >
            <ProfilePhotoFrame size={148}>{user?.profile_photo ? (
              <Image source={{ uri: user.profile_photo }} style={styles.profileImage} resizeMode="cover" />
            ) : (
              <View style={styles.profilePlaceholder}>
                <Ionicons name="person" size={44} color={Colors.white} />
              </View>
            )}</ProfilePhotoFrame>
          </TouchableOpacity>
          <View style={styles.greetingBlock}>
            <Text style={styles.greeting}>Alerts</Text>
          </View>
        </View>
        <View style={styles.headerDivider} />
        <View style={styles.headerDateRow}>
          <Text style={styles.headerDate}>{new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
          <Text style={styles.headerClubsLabel}>YOUR ALERTS</Text>
        </View>
      </View>

      <ScrollView
        ref={panelScroll}
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

        {!error && (
          <View style={styles.section}>
            <View style={{ backgroundColor: '#E4C447', marginHorizontal: -16, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 2 }}>
              <Text
                accessibilityRole="button"
                onPress={() => setAlertsMenuExpanded(value => !value)}
                style={{ color: '#26352D', fontSize: 15, fontWeight: '400', letterSpacing: 1.1 }}
              >MY ALERTS</Text>
              <View style={{ height: 180, alignItems: 'center', justifyContent: 'center' }}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={alertsMenuExpanded ? 'Close alert actions' : 'Open alert actions'}
                  accessibilityState={{ expanded: alertsMenuExpanded }}
                  onPress={() => setAlertsMenuExpanded(value => !value)}
                  style={{ height: 170, width: 170, alignItems: 'center', justifyContent: 'center' }}
                >
                  {alertsMenuExpanded ? (
                    <>
                      <View style={{ position: 'absolute', width: 70, height: 6, backgroundColor: '#26352D', transform: [{ rotate: '45deg' }] }} />
                      <View style={{ position: 'absolute', width: 70, height: 6, backgroundColor: '#26352D', transform: [{ rotate: '-45deg' }] }} />
                    </>
                  ) : (
                    <>
                      <View style={{ position: 'absolute', width: 70, height: 6, backgroundColor: '#26352D' }} />
                      <View style={{ position: 'absolute', width: 6, height: 70, backgroundColor: '#26352D' }} />
                    </>
                  )}
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 3 }}>
                <Text accessibilityRole="button" onPress={() => setAlertsMenuExpanded(value => !value)} style={{ color: '#26352D', fontSize: 14, fontWeight: '400', letterSpacing: 1 }}>
                  {alertsMenuExpanded ? 'SELECT AN OPTION' : 'TAP TO VIEW'}
                </Text>
                <Text accessibilityRole="button" onPress={() => setAlertsMenuExpanded(value => !value)} style={{ color: '#26352D', fontSize: 14, fontWeight: '400', letterSpacing: 1 }}>
                  {alertsMenuExpanded ? 'CLOSE MENU' : '2 OPTIONS'}
                </Text>
              </View>
            </View>
            {alertsMenuExpanded && (
              <View style={{ marginHorizontal: -16 }}>
              <View style={{ backgroundColor: '#343A40' }}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityState={{ expanded: myAlertsExpanded }}
                  onPress={() => {
                    setMyAlertsExpanded(true);
                    setChatsExpanded(false);
                    setAlertsMenuExpanded(false);
                  }}
                  style={{ minHeight: 49, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>My Alerts</Text>
                  <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityState={{ expanded: chatsExpanded }}
                  onPress={() => {
                    setChatsExpanded(true);
                    setMyAlertsExpanded(false);
                    setAlertsMenuExpanded(false);
                  }}
                  style={{ minHeight: 49, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#596168' }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>Chats</Text>
                  <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
              </View>
            )}

            <View style={{ marginHorizontal: -16 }}>
              <HomeSponsoredCard />
              <ClubvelSpotlight homeBackgroundColor="#343A40" />
            </View>

            {chatsExpanded && (
              <Modal visible transparent animationType="fade" onRequestClose={() => setChatsExpanded(false)}>
                <View style={styles.destinationOverlay}>
                  <View style={styles.destinationCard}>
                    <View style={styles.destinationHeader}>
                      <Text style={styles.destinationTitle}>Chats</Text>
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close Chats" onPress={() => setChatsExpanded(false)} style={styles.destinationClose}>
                        <Ionicons name="close" size={22} color={Colors.white} />
                      </TouchableOpacity>
                    </View>
                    <ScrollView style={styles.destinationScroll} contentContainerStyle={styles.destinationScrollContent} nestedScrollEnabled showsVerticalScrollIndicator>
              <View style={{ paddingTop: 12 }}>
                {clubs.map(club => (
                  <TouchableOpacity
                    key={club.id}
                    accessibilityRole="button"
                    onPress={() => {
                      setChatsExpanded(false);
                      router.push({
                        pathname: '/(member)/chats/[id]',
                        params: { id: club.id },
                      });
                    }}
                    style={{
                      minHeight: 82,
                      backgroundColor: Colors.white,
                      borderRadius: 10,
                      marginBottom: 10,
                      padding: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 13,
                    }}
                  >
                    {club.group_photo ? (
                      <Image
                        source={{ uri: club.group_photo }}
                        style={{ width: 54, height: 54, borderRadius: 27 }}
                      />
                    ) : (
                      <View style={{
                        width: 54, height: 54, borderRadius: 27,
                        backgroundColor: Colors.primary,
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Ionicons name="people-outline" size={25} color="#FFFFFF" />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#343A40', fontSize: 16, fontWeight: '500' }}>
                        {club.name}
                      </Text>
                      <Text style={{ color: '#858585', fontSize: 12, marginTop: 5 }}>
                        Open group chat
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#858585" />
                  </TouchableOpacity>
                ))}
                {clubs.length === 0 && (
                  <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                    <Ionicons name="chatbubbles-outline" size={42} color="#858585" />
                    <Text style={{ color: '#343A40', fontSize: 15, marginTop: 12 }}>
                      No active clubs to chat in yet.
                    </Text>
                  </View>
                )}
              </View>
                    </ScrollView>
                  </View>
                </View>
              </Modal>
            )}

            {myAlertsExpanded && (
              <Modal visible transparent animationType="fade" onRequestClose={() => setMyAlertsExpanded(false)}>
                <View style={styles.destinationOverlay}>
                  <View style={styles.destinationCard}>
                    <View style={styles.destinationHeader}>
                      <Text style={styles.destinationTitle}>My Alerts</Text>
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close My Alerts" onPress={() => setMyAlertsExpanded(false)} style={styles.destinationClose}>
                        <Ionicons name="close" size={22} color={Colors.white} />
                      </TouchableOpacity>
                    </View>
                    <ScrollView style={styles.destinationScroll} contentContainerStyle={styles.destinationScrollContent} nestedScrollEnabled showsVerticalScrollIndicator>
              <View style={styles.alertsDropdown}>
                {clubGroups.map(group => {
                  const expanded = !!expandedClubs[group.id];
                  return (
                    <View key={group.id} style={styles.clubGroup}>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityState={{ expanded }}
                        onPress={() => setExpandedClubs(prev => ({
                          ...prev, [group.id]: !prev[group.id],
                        }))}
                        style={styles.clubHeader}
                      >
                        <Text style={styles.clubHeaderTitle}>{group.name}</Text>
                        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'}
                          size={20} color={Colors.white} />
                      </TouchableOpacity>
                      {expanded && <View style={styles.clubAlerts}>
                        {group.alerts.map(renderAlert)}
                      </View>}
                    </View>
                  );
                })}
                {clubGroups.length === 0 && (
                  <View style={styles.emptyState}>
                    <Ionicons name="notifications-outline" size={56} color="#343A40" />
                    <Text style={styles.emptyStateText}>No alerts</Text>
                    <Text style={styles.emptyStateSubtext}>You&apos;re all caught up!</Text>
                  </View>
                )}
              </View>
                    </ScrollView>
                  </View>
                </View>
              </Modal>
            )}
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
    backgroundColor: '#D9D9D9',
    paddingBottom: 8,
    paddingHorizontal: 20,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '400',
    color: '#343A40',
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', minHeight: 44 },
  welcomeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  greetingBlock: { flex: 1, minWidth: 0, justifyContent: 'center' },
  greeting: { fontSize: 25, lineHeight: 31, fontWeight: '400', color: '#4A4A4A' },
  greetingName: { fontSize: 30, lineHeight: 36, fontWeight: '400', color: '#000000', marginTop: 2 },
  headerDivider: { height: 1, backgroundColor: 'rgba(38,53,45,0.16)', marginTop: 10 },
  headerDateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 },
  headerDate: { fontSize: 10, color: '#26352D', fontWeight: '700', letterSpacing: 1 },
  headerClubsLabel: { fontSize: 10, color: '#26352D', fontWeight: '700', letterSpacing: 1 },
  profileButton: { padding: 0, flexShrink: 0 },
  profileImage: {
    width: 148,
    height: 148,
    borderRadius: 74,
  },
  profilePlaceholder: {
    width: 148,
    height: 148,
    borderRadius: 74,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 0,
  },
  myAlertsHeader: {
    minHeight: 58, backgroundColor: '#E4C447', borderRadius: 12,
    paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center',
  },
  sideIcon: { width: 22, textAlign: 'center' },
  myAlertsTitle: {
    flex: 1, textAlign: 'center', color: '#343A40',
    fontSize: 18, fontWeight: '700',
  },
  destinationOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 28,
  },
  destinationCard: {
    width: '92%',
    maxWidth: 560,
    height: '75%',
    minHeight: '55%',
    maxHeight: '88%',
    backgroundColor: '#FFF8E8',
    borderColor: '#343A40',
    borderWidth: 3,
    borderRadius: 18,
    overflow: 'hidden',
  },
  destinationHeader: {
    minHeight: 58,
    backgroundColor: '#343A40',
    paddingLeft: 18,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  destinationTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
  },
  destinationClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#C96B45',
    alignItems: 'center',
    justifyContent: 'center',
  },
  destinationScroll: { flex: 1 },
  destinationScrollContent: { flexGrow: 1, paddingBottom: 18 },
  alertsDropdown: { paddingTop: 12 },
  clubGroup: {
    marginBottom: 12, borderRadius: 10, overflow: 'hidden',
    backgroundColor: Colors.white,
  },
  clubHeader: {
    minHeight: 50, backgroundColor: '#343A40', padding: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  clubHeaderTitle: {
    flex: 1, textAlign: 'center', color: Colors.white,
    fontSize: 16, fontWeight: '700',
  },
  clubAlerts: { padding: 10 },
  adBannerContainer: {
    marginHorizontal: 16, marginTop: 12, marginBottom: 20,
    alignItems: 'center',
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
    backgroundColor: Colors.lightBackground,
    borderColor: '#E4C447',
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
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
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
});
