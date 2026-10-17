import React from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import ProfilePhotoFrame from './ProfilePhotoFrame';
import { clubGreeting } from '../services/clubGreeting';
import { paymentMoney } from '../services/paymentSummaryRecords';

export type ClubTile = { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void; accessibilityLabel?: string };
export type ActivityRow = { id: string; title: string; detail: string; date?: string; state: 'paid' | 'pending' | 'declined' | 'recorded'; onPress?: () => void };
export function ClubWelcomeHeader({ clubName, displayName, photoUri, topInset = 24, onBack, onMenu, onPhotoPress, onPhotoError, onNotifications, greeting }: {
  clubName: string; displayName?: string; photoUri?: string | null; topInset?: number; onBack?: () => void; onMenu?: () => void;
  onPhotoPress?: () => void; onPhotoError?: () => void; onNotifications?: () => void; greeting?: string;
}) {
  return <View style={[dashboardStyles.header, { paddingTop: Math.max(topInset, 16) }]}>
    <View style={dashboardStyles.titleRow}>
      <View style={dashboardStyles.headerSide}>{onBack && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to account Home" style={dashboardStyles.headerControl} onPress={onBack}><Ionicons name="chevron-back" size={22} color={Colors.white} /></TouchableOpacity>}</View>
      <Text accessibilityRole="header" style={dashboardStyles.clubName}>{clubName}</Text>
      <View style={dashboardStyles.headerSide}>{onMenu ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open profile menu" style={dashboardStyles.headerControl} onPress={onMenu}><Ionicons name="menu" size={22} color={Colors.white} /></TouchableOpacity> : onNotifications ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Club alerts" style={dashboardStyles.headerControl} onPress={onNotifications}><Ionicons name="notifications" size={22} color={Colors.white} /></TouchableOpacity> : null}</View>
    </View>
    <View style={dashboardStyles.welcomeRow}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="View your profile photo" disabled={!photoUri || !onPhotoPress} onPress={onPhotoPress} style={dashboardStyles.photoButton}>
        <ProfilePhotoFrame>{photoUri ? <Image source={{ uri: photoUri }} style={dashboardStyles.photo} resizeMode="cover" onError={onPhotoError} /> : <View style={dashboardStyles.initialsCircle}><Text style={dashboardStyles.initials}>{displayName?.trim().charAt(0).toUpperCase() || '?'}</Text></View>}</ProfilePhotoFrame>
      </TouchableOpacity>
      <Text style={dashboardStyles.greeting}>{greeting || clubGreeting(displayName)}</Text>
    </View>
  </View>;
}
export function ClubNavigationTiles({ items }: { items: ClubTile[] }) {
  return <View style={dashboardStyles.tiles}>{items.map(item => <TouchableOpacity key={item.label} accessibilityRole="button" accessibilityLabel={item.accessibilityLabel || item.label} style={dashboardStyles.tile} onPress={item.onPress}>
    <Ionicons name={item.icon} size={27} color={Colors.primary} /><Text style={dashboardStyles.tileLabel}>{item.label}</Text>
  </TouchableOpacity>)}</View>;
}
export function DashboardActivityCard({ title, subtitle, rows, loading = false, error = false, onRetry, onViewAll, emptyText }: {
  title: string; subtitle?: string; rows: ActivityRow[]; loading?: boolean; error?: boolean; onRetry?: () => void; onViewAll: () => void; emptyText: string;
}) {
  const icons = { paid: 'checkmark', pending: 'time-outline', declined: 'close', recorded: 'arrow-up' } as const;
  const foreground = { paid: Colors.statusPaid, pending: '#9A6100', declined: Colors.statusLate, recorded: Colors.corporateBlue };
  const background = { paid: '#DEF4E8', pending: '#FFF1C2', declined: Colors.errorSurface, recorded: Colors.iceBlue };
  return <View style={dashboardStyles.card}><View style={dashboardStyles.cardHeading}><Text style={dashboardStyles.cardTitle}>{title}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel={`View all ${title.toLowerCase()}`} onPress={onViewAll} style={dashboardStyles.viewAll}><Text style={dashboardStyles.link}>View all</Text></TouchableOpacity></View>
    {!!subtitle && <Text style={dashboardStyles.caption}>{subtitle}</Text>}
    {loading ? <ActivityIndicator accessibilityLabel={`Loading ${title.toLowerCase()}`} color={Colors.corporateBlue} /> : error ? <View><Text style={dashboardStyles.caption}>Unable to load these records.</Text><TouchableOpacity accessibilityLabel={`Retry ${title.toLowerCase()}`} onPress={onRetry}><Text style={dashboardStyles.link}>Retry</Text></TouchableOpacity></View> : rows.length ? rows.map(row => <TouchableOpacity key={row.id} accessibilityRole="button" accessibilityLabel={row.title + ', ' + row.detail} disabled={!row.onPress} onPress={row.onPress} style={dashboardStyles.activityRow}>
      <View style={[dashboardStyles.activityIcon, { backgroundColor: background[row.state] }]}><Ionicons name={icons[row.state]} size={23} color={foreground[row.state]} /></View>
      <View style={dashboardStyles.activityCopy}><Text style={dashboardStyles.activityTitle}>{row.title}</Text><Text style={dashboardStyles.caption}>{row.detail}</Text></View>
      {!!row.date && <Text style={dashboardStyles.activityDate}>{row.date}</Text>}{row.onPress && <Ionicons name="chevron-forward" size={17} color={Colors.textSecondary} />}
    </TouchableOpacity>) : <Text style={dashboardStyles.empty}>{emptyText}</Text>}
  </View>;
}
export function ClubOverviewCard({ memberCount, collected, expected, period }: { memberCount?: number; collected?: number | null; expected?: number | null; period: string }) {
  const count = typeof memberCount === 'number' && Number.isInteger(memberCount) && memberCount >= 0 ? String(memberCount) : 'Unavailable';
  return <View style={dashboardStyles.card}><Text style={dashboardStyles.cardTitle}>Club Overview</Text><Text style={dashboardStyles.caption}>{period}</Text>
    <View style={dashboardStyles.overview}>{[{ icon: 'people' as const, value: count, label: 'Members' }, { icon: 'layers-outline' as const, value: paymentMoney(collected), label: 'Confirmed collected' }, { icon: 'calendar-outline' as const, value: paymentMoney(expected), label: 'Recorded obligations' }].map(item => <View key={item.label} style={dashboardStyles.overviewItem}><Ionicons name={item.icon} color={Colors.primary} size={24} /><Text style={dashboardStyles.overviewValue}>{item.value}</Text><Text style={dashboardStyles.overviewLabel}>{item.label}</Text></View>)}</View>
  </View>;
}
export const dashboardStyles = StyleSheet.create({
  header: { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingBottom: 22, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  titleRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44 }, headerSide: { width: 44, alignItems: 'center' }, headerControl: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  clubName: { color: Colors.white, fontSize: 26, fontWeight: '400', textAlign: 'center', flex: 1, minWidth: 0 },
  welcomeRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 16 }, photoButton: { flexShrink: 0 },
  photo: { width: 112, height: 112, borderRadius: 56, borderWidth: 1, borderColor: Colors.white }, initialsCircle: { width: 112, height: 112, borderRadius: 56, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.white }, initials: { color: Colors.white, fontSize: 34, fontWeight: '400' },
  greeting: { color: Colors.white, fontSize: 21, fontWeight: '400', flex: 1, minWidth: 0, flexShrink: 1, lineHeight: 29 },
  tiles: { flexDirection: 'row', gap: 8, marginVertical: 18 }, tile: { flex: 1, minWidth: 0, minHeight: 92, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 3, paddingVertical: 12, borderRadius: 17, borderWidth: 1, borderColor: Colors.cardBorder, backgroundColor: Colors.white }, tileLabel: { alignSelf: 'stretch', color: Colors.primary, fontSize: 12, fontWeight: '400', textAlign: 'center', flexShrink: 1 },
  card: { backgroundColor: Colors.white, borderRadius: 18, borderWidth: 1, borderColor: Colors.cardBorder, padding: 16, marginBottom: 16 }, cardHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, cardTitle: { color: Colors.primary, fontSize: 18, fontWeight: '500', flexShrink: 1 }, viewAll: { minHeight: 44, justifyContent: 'center', flexShrink: 0 }, link: { color: Colors.corporateBlue, fontSize: 14 }, caption: { color: Colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 4 }, empty: { color: Colors.textSecondary, fontSize: 14, lineHeight: 21, paddingVertical: 20 },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 78, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder }, activityIcon: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center', flexShrink: 0 }, activityCopy: { flex: 1, minWidth: 0 }, activityTitle: { fontSize: 14, fontWeight: '500', color: Colors.primary }, activityDate: { fontSize: 12, color: Colors.textSecondary, maxWidth: 64 },
  overview: { flexDirection: 'row', borderRadius: 14, backgroundColor: Colors.lightBackground, paddingVertical: 16, marginTop: 12 }, overviewItem: { flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: 4, gap: 8 }, overviewValue: { color: Colors.primary, fontSize: 16, fontWeight: '500', textAlign: 'center' }, overviewLabel: { fontSize: 11, lineHeight: 16, color: Colors.textSecondary, textAlign: 'center' },
});


export function ClubBottomNavigation({ active, onHome, onContributions, onClaims, onMore, bottomInset = 0 }: { active: 'home' | 'more'; onHome: () => void; onContributions: () => void; onClaims: () => void; onMore: () => void; bottomInset?: number }) {
  return <View accessibilityLabel="Club navigation" style={{ flexDirection: 'row', backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.cardBorder, paddingBottom: Math.max(bottomInset, 8) }}>
    {[{ label: 'Home', icon: 'home' as const, action: onHome, selected: active === 'home' }, { label: 'Contributions', icon: 'layers-outline' as const, action: onContributions }, { label: 'Claims', icon: 'card-outline' as const, action: onClaims }, { label: 'More', icon: 'ellipsis-horizontal' as const, action: onMore, selected: active === 'more' }].map(item => <TouchableOpacity key={item.label} accessibilityRole="button" accessibilityLabel={`Club ${item.label}`} accessibilityState={{ selected: !!item.selected }} onPress={item.action} style={{ flex: 1, minWidth: 0, minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: 4 }}><Ionicons name={item.icon} size={23} color={item.selected ? Colors.primary : Colors.textSecondary} /><Text style={{ fontSize: 10, color: item.selected ? Colors.primary : Colors.textSecondary, textAlign: 'center' }}>{item.label}</Text></TouchableOpacity>)}
  </View>;
}
