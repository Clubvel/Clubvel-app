import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import axios, { isAxiosError } from 'axios';
import { Colors } from '../constants/Colors';
import { currentReportPeriod, moveReportMonth, REPORT_MONTHS } from '../services/monthlyReport';
import { displayMetric, explainWarning, Metric, Summary, summaryError, summaryLabels, validateSummary } from '../services/clubSummary';

export default function ClubSummary({ clubId, token, onClose }: { clubId: string; token: string | null; onClose: () => void }) {
  const router = useRouter(), insets = useSafeAreaInsets();
  const [period, setPeriod] = useState(currentReportPeriod());
  const [selection, setSelection] = useState(false), [year, setYear] = useState(String(period.year));
  const [warningsOpen, setWarningsOpen] = useState(false), [aboutOpen, setAboutOpen] = useState(false);
  const [result, setResult] = useState<{ key: string; data: Summary } | null>(null);
  const [failure, setFailure] = useState<{ key: string; status?: number; message: string } | null>(null);
  const [busy, setBusy] = useState(true), [refreshing, setRefreshing] = useState(false);
  const sequence = useRef(0), live = useRef(''), closed = useRef(false);
  const key = `${clubId}/${period.year}/${period.month}/${token}`;
  live.current = key;
  const fetchSummary = useCallback(async (refresh = false) => {
    const ticket = ++sequence.current;
    setResult(null); setFailure(null); setBusy(true); setRefreshing(refresh);
    try {
      if (!token) { setFailure({ key, status: 401, message: summaryError(401) }); return; }
      const response = await axios.get(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/intelligence/${clubId}/summary`, {
        params: period, headers: { Authorization: `Bearer ${token}` }, timeout: 20000,
      });
      const data = validateSummary(response.data, clubId, period.year, period.month);
      if (!closed.current && ticket === sequence.current && live.current === key) setResult({ key, data });
    } catch (error) {
      if (!closed.current && ticket === sequence.current && live.current === key) {
        const status = isAxiosError(error) ? error.response?.status : undefined;
        setFailure({ key, status, message: summaryError(status) });
      }
    } finally {
      if (!closed.current && ticket === sequence.current && live.current === key) { setBusy(false); setRefreshing(false); }
    }
  }, [clubId, token, period, key]);
  useFocusEffect(useCallback(() => {
    void fetchSummary();
    return () => { sequence.current++; };
  }, [fetchSummary]));
  const close = () => { closed.current = true; sequence.current++; live.current = ''; onClose(); };
  const shift = (delta: number) => {
    const next = moveReportMonth(period, delta);
    if (next.year >= 1 && next.year <= 9999) { sequence.current++; setPeriod(next); }
  };
  const data = result?.key === key ? result.data : null;
  const error = failure?.key === key ? failure : null;
  const metric = (field: Metric, color: string, label = summaryLabels[field], secondary = false) => <View style={styles.metric}>
    <Text style={[secondary ? styles.supportValue : styles.value, { color: data?.availability[field].status === 'UNAVAILABLE' ? Colors.textSecondary : color }]}>{data && displayMetric(data, field)}</Text>
    <Text style={styles.caption}>{label}</Text>
    {data?.availability[field].status === 'UNAVAILABLE' ? <Text style={styles.caption}>{data.availability[field].reasons.map(r => explainWarning(r.code)).join(' ')}</Text> : null}
  </View>;
  const paired = (count: Metric, amount: Metric, label: string, color: string, unit: string) => <View style={styles.metric}>
    <Text accessibilityLabel={`${summaryLabels[count]}, ${summaryLabels[amount]}`} style={[styles.supportValue, { color }]}>
      {data && `${displayMetric(data, count)}${data.availability[count].status === 'AVAILABLE' ? ` ${unit}${Number(displayMetric(data, count)) === 1 ? '' : 's'}` : ''} · ${displayMetric(data, amount)}`}
    </Text>
    <Text style={styles.caption}>{label}</Text>
    {data ? [count, amount].filter(field => data.availability[field].status === 'UNAVAILABLE').map(field => <Text key={field} style={styles.caption}>{summaryLabels[field]}: {data.availability[field].reasons.map(r => explainWarning(r.code)).join(' ')}</Text>) : null}
  </View>;
  return <Modal visible transparent animationType="slide" onRequestClose={() => selection ? setSelection(false) : close()}>
    <View style={styles.overlay}>
      <TouchableOpacity accessibilityLabel="Close Club Summary backdrop" style={styles.backdrop} onPress={close} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.row}><Text style={styles.title}>Club Summary</Text><TouchableOpacity accessibilityRole="button" onPress={close}><Text style={styles.link}>Close</Text></TouchableOpacity></View>
        {data ? <Text style={styles.title}>{data.club.name}</Text> : null}
        <View style={styles.row}>
          <TouchableOpacity accessibilityLabel="Previous summary month" onPress={() => shift(-1)}><Text style={styles.control}>‹</Text></TouchableOpacity>
          <TouchableOpacity style={styles.period} accessibilityLabel="Select summary month and year" onPress={() => { setYear(String(period.year)); setSelection(!selection); }}><Text style={styles.title}>{REPORT_MONTHS[period.month - 1]} {period.year} ▾</Text></TouchableOpacity>
          <TouchableOpacity accessibilityLabel="Next summary month" onPress={() => shift(1)}><Text style={styles.control}>›</Text></TouchableOpacity>
        </View>
        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void fetchSummary(true)} />}>
          {selection ? <View style={styles.card}>
            <Text style={styles.caption}>Year (1–9999)</Text><TextInput accessibilityLabel="Summary year" keyboardType="number-pad" value={year} onChangeText={setYear} style={styles.input} />
            {REPORT_MONTHS.map((month, index) => <TouchableOpacity key={month} accessibilityRole="button" onPress={() => {
              if (/^\d{1,4}$/.test(year) && Number(year) >= 1 && Number(year) <= 9999) { sequence.current++; setPeriod({ year: Number(year), month: index + 1 }); setSelection(false); }
            }}><Text style={styles.link}>{month}</Text></TouchableOpacity>)}
          </View> : null}
          {(busy || (!data && !error)) && !refreshing ? <ActivityIndicator accessibilityLabel="Loading Club Summary" color={Colors.accent} /> : null}
          {error ? <View style={styles.card}><Text style={styles.caption}>{error.message}</Text>
            {error.status === 401 ? <TouchableOpacity onPress={() => { close(); router.replace('/auth'); }}><Text style={styles.link}>Sign in</Text></TouchableOpacity>
              : <TouchableOpacity onPress={() => void fetchSummary()}><Text style={styles.link}>Retry</Text></TouchableOpacity>}
          </View> : null}
          {data ? <>
            <Text style={styles.title}>{REPORT_MONTHS[period.month - 1]} at a glance</Text>
            <View style={styles.card}>
              {metric('contributions.confirmed_cents', Colors.statusPaid)}
              {metric('contributions.outstanding_cents', Colors.statusLate)}
              {paired('contributions.awaiting_review_count', 'contributions.awaiting_review_cents', 'Awaiting review', Colors.accent, 'contribution')}
            </View>
            <View style={styles.card}><Text style={styles.title}>Claims</Text>
              {paired('claims.submitted_count', 'claims.submitted_amount_cents', 'Submitted', Colors.primary, 'claim')}
              {paired('claims.approved_count', 'claims.approved_amount_cents', 'Approved', Colors.primary, 'claim')}
            </View>
            <View style={styles.card}>{metric('payouts.recorded_in_period_cents', Colors.statusPaid)}
              {metric('payouts.current_approved_remaining_cents', Colors.accent)}<Text style={styles.caption}>Current approved balance</Text></View>
            {metric('membership.active_memberships', Colors.primary, 'Active memberships', true)}
            {metric('contributions.recorded_expected_cents', Colors.primary, 'Recorded expected contributions', true)}
            {data.warnings.length ? <View style={styles.card}>
              <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: warningsOpen }} onPress={() => setWarningsOpen(!warningsOpen)}><Text style={styles.link}>Some records need checking ▾</Text></TouchableOpacity>
              {warningsOpen ? data.warnings.map((warning, index) => <View key={index} style={styles.metric}><Text style={styles.caption}>{explainWarning(warning.code)}</Text><Text style={styles.caption}>Affects: {warning.fields.map(field => summaryLabels[field]).join(', ')}</Text></View>) : null}
            </View> : null}
            <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: aboutOpen }} onPress={() => setAboutOpen(!aboutOpen)}><Text style={styles.link}>About these figures ▾</Text></TouchableOpacity>
            {aboutOpen ? <Text style={styles.caption}>Contributions belong to their recorded obligation month. Awaiting-review amounts are already included in outstanding. Claim submission and approval months use Johannesburg dates. Paid this month uses individual recorded actual-payment entries. Still to be paid is the current approved balance, including when viewing an earlier month. These figures are not a verified bank balance. Bank receipt timing is not used to assign contributions to a month.</Text> : null}
          </> : null}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }, backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { maxHeight: '92%', backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, period: { flex: 1, alignItems: 'center' },
  content: { paddingBottom: 24, gap: 12 }, card: { backgroundColor: Colors.white, borderColor: Colors.cardBorder, borderWidth: 1, borderRadius: 12, padding: 16 },
  metric: { marginVertical: 8 }, value: { fontSize: 26, fontWeight: '700' }, supportValue: { fontSize: 16, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '600', color: Colors.primary, flexShrink: 1 }, caption: { fontSize: 14, color: Colors.textSecondary, lineHeight: 21 },
  link: { color: Colors.accent, fontSize: 16, paddingVertical: 10 }, control: { color: Colors.primary, fontSize: 28, padding: 10 },
  input: { borderColor: Colors.cardBorder, borderWidth: 1, padding: 12, color: Colors.primary },
});
