import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import axios, { isAxiosError } from 'axios';
import { Colors } from '../constants/Colors';
import { currentReportPeriod, MonthlyReportData, moveReportMonth, REPORT_MONTHS, reportRand } from '../services/monthlyReport';

type Club = { id: string; name?: string; group_name?: string };
export default function MonthlyReport({ clubs, token, contextualClubId, refreshKey }: { clubs: Club[]; token: string | null; contextualClubId?: string; refreshKey?: number }) {
  const defaultClub = clubs.find(c => c.id === contextualClubId) || clubs[0];
  const [chosenClub, setChosenClub] = useState(defaultClub?.id || '');
  const club = clubs.find(c => c.id === chosenClub) || defaultClub;
  const [period, setPeriod] = useState(currentReportPeriod());
  const [selection, setSelection] = useState<'club' | 'period' | null>(null);
  const [yearInput, setYearInput] = useState(String(period.year));
  const [data, setData] = useState<{ key: string; report: MonthlyReportData } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const sequence = useRef(0);
  const key = `${club?.id}/${period.year}/${period.month}/${token}/${refreshKey}`;
  const fetchReport = useCallback(async () => {
    const ticket = ++sequence.current;
    setLoading(true); setError(null); setData(null);
    try {
      if (!club?.id || !token) throw new Error('Please sign in again to view this report.');
      const response = await axios.get(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/treasurer/reports/${club.id}/monthly`, {
        params: period, headers: { Authorization: `Bearer ${token}` }, timeout: 20000,
      });
      const report: MonthlyReportData = response.data;
      if (report.schema_version !== 1 || report.club?.id !== club.id || report.period?.year !== period.year || report.period?.month !== period.month || !report.summary || !Array.isArray(report.contributions) || !report.claim_activity || !Array.isArray(report.payout_payments) || !Array.isArray(report.current_commitments) || !Array.isArray(report.warnings) || !Array.isArray(report.unallocated_activity)) {
        throw new Error('Unexpected monthly report response. Please retry.');
      }
      if (ticket === sequence.current) setData({ key, report });
    } catch (failure) {
      if (ticket === sequence.current) setError({ key, message: failure instanceof Error && !isAxiosError(failure)
        ? failure.message : 'Unable to load this monthly report. Check your connection and retry.' });
    } finally { if (ticket === sequence.current) setLoading(false); }
  }, [club?.id, period, token, key]);
  useFocusEffect(useCallback(() => {
    void fetchReport();
    return () => { sequence.current += 1; };
  }, [fetchReport]));
  const report = data?.key === key ? data.report : null;
  const failure = error?.key === key ? error.message : null;
  const section = (id: string, label: string, children: React.ReactNode) => (
    <View style={styles.card}>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: !!expanded[id] }} onPress={() => setExpanded(previous => ({ ...previous, [id]: !previous[id] }))}>
        <Text style={styles.heading}>{label} {expanded[id] ? '−' : '+'}</Text>
      </TouchableOpacity>
      {expanded[id] ? children : null}
    </View>
  );
  const value = (label: string, amount: number) => <View style={styles.value}><Text style={styles.body}>{label}</Text><Text style={styles.amount}>{reportRand(amount)}</Text></View>;
  const shift = (delta: number) => {
    const next = moveReportMonth(period, delta);
    if (next.year >= 1 && next.year <= 9999) setPeriod(next);
  };
  return <View style={styles.container}>
    <Text style={styles.title}>Monthly Report</Text>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Select report club" style={styles.card} onPress={() => setSelection('club')}>
      <Text style={styles.heading}>{report?.club.name || club?.name || club?.group_name || 'Select club'} ▾</Text>
    </TouchableOpacity>
    <View style={styles.period}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous report month" style={styles.control} onPress={() => shift(-1)}><Text style={styles.heading}>‹</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Select report month and year" style={styles.periodTitle} onPress={() => { setYearInput(String(period.year)); setSelection('period'); }}><Text style={styles.heading}>{REPORT_MONTHS[period.month - 1]} {period.year} ▾</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next report month" style={styles.control} onPress={() => shift(1)}><Text style={styles.heading}>›</Text></TouchableOpacity>
    </View>
    <Text style={styles.caption}>Africa/Johannesburg • Recorded obligations and activity</Text>
    {loading || (!report && !failure) ? <ActivityIndicator accessibilityLabel="Loading monthly report" color={Colors.accent} /> : null}
    {failure ? <View style={styles.card}><Text style={styles.body}>{failure}</Text><TouchableOpacity accessibilityRole="button" onPress={() => void fetchReport()}><Text style={styles.link}>Retry monthly report</Text></TouchableOpacity></View> : null}
    {report ? <>
      <Text style={styles.caption}>Generated: {new Date(report.generated_at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</Text>
      {report.empty_period ? <View style={styles.card}><Text style={styles.body}>No recorded activity or obligations for {report.club.name} in {REPORT_MONTHS[period.month - 1]} {period.year}.</Text></View> : null}
      <View style={styles.card}>
        <Text style={styles.heading}>Contributions</Text>
        {value('Expected', report.summary.expected)}{value('Confirmed', report.summary.confirmed)}
        {value('Outstanding', report.summary.outstanding)}{value('Awaiting Proof Review', report.summary.awaiting_review)}
        <Text style={styles.caption}>Awaiting review is included in outstanding, never in confirmed. These are recorded obligations, not bank cash receipts.</Text>
      </View>
      {section('contributions', `Contribution detail (${report.contributions.length})`, report.contributions.length ? report.contributions.map(row => <View key={row.id} style={styles.detail}>
        <Text style={styles.heading}>{row.member_name}</Text><Text style={styles.caption}>Record: {row.id}</Text>
        {value('Expected', row.expected)}{value('Confirmed', row.confirmed)}{value('Outstanding', row.outstanding)}
        <Text style={styles.body}>Status: {row.status.replace(/_/g, ' ')}{row.proof_review_status === 'declined' ? ' • Proof declined' : ''}</Text>
        {row.confirmation_date ? <Text style={styles.caption}>Confirmed: {new Date(row.confirmation_date).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</Text> : null}
      </View>) : <Text style={styles.body}>No recorded contribution obligations.</Text>)}
      <View style={styles.card}><Text style={styles.heading}>Claim activity</Text>
        {value(`Submitted (${report.summary.claims_submitted_count})`, report.summary.claims_submitted_amount)}
        {value(`Approved (${report.summary.claims_approved_count})`, report.summary.claims_approved_amount)}
        <Text style={styles.caption}>Submission and approval dates determine the month. Paid claims retain their approval activity.</Text>
      </View>
      {section('claims', 'Claim activity detail', <>
        {report.claim_activity.submitted.map(row => <View key={`submitted-${row.claim_id}`} style={styles.detail}><Text style={styles.body}>{row.member_name} • Submitted • {reportRand(row.claim_amount)}</Text><Text style={styles.caption}>{new Date(row.submitted_at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</Text></View>)}
        {report.claim_activity.approved.map(row => <View key={`approved-${row.claim_id}`} style={styles.detail}><Text style={styles.body}>{row.member_name} • Approved • {reportRand(row.claim_amount)}</Text><Text style={styles.caption}>{new Date(row.reviewed_at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</Text></View>)}
        {!report.claim_activity.submitted.length && !report.claim_activity.approved.length ? <Text style={styles.body}>No dated claim activity in this month.</Text> : null}
      </>)}
      <View style={styles.card}>{value('Actual Payouts', report.summary.actual_payouts)}<Text style={styles.caption}>Individual recorded payments by actual payment date.</Text></View>
      {section('payouts', `Actual payout detail (${report.payout_payments.length})`, report.payout_payments.length ? report.payout_payments.map(row => <View key={`${row.claim_id}-${row.id}`} style={styles.detail}><Text style={styles.body}>{row.member_name} • {reportRand(row.amount)}</Text><Text style={styles.caption}>Paid: {row.actual_payment_date}</Text></View>) : <Text style={styles.body}>No recorded payouts in this month.</Text>)}
      <View style={styles.card}>{value('CURRENT Approved / Unpaid Payouts', report.summary.current_commitments)}<Text style={styles.caption}>Current remaining commitments, independent of the selected month. This is not a historical month-end liability or cash balance.</Text></View>
      {section('commitments', `Current commitment detail (${report.current_commitments.length})`, report.current_commitments.length ? report.current_commitments.map(row => <View key={row.claim_id} style={styles.detail}><Text style={styles.heading}>{row.member_name}</Text>
        {value('Claim amount', row.claim_amount)}{value('Actual paid to date', row.actual_amount_paid)}{value('Remaining', row.remaining)}
        <Text style={styles.body}>Scheduled: {row.scheduled_claim_date || 'Not scheduled'} • {row.status}</Text>
      </View>) : <Text style={styles.body}>No current approved unpaid commitments.</Text>)}
      {report.warnings.length ? <View style={styles.warning}><Text style={styles.heading}>Data completeness</Text>{report.warnings.map((warning, index) => <Text key={index} style={styles.body}>{warning.record_id}: {warning.message}</Text>)}</View> : null}
      {report.unallocated_activity.length ? section('undated', 'Activity without usable historical dates', report.unallocated_activity.map((row, index) => <View key={index} style={styles.detail}><Text style={styles.body}>{row.member_name} • {row.activity} • {reportRand(row.amount ?? row.claim_amount)}</Text></View>)) : null}
      <Text style={styles.caption}>{report.basis}</Text>
    </> : null}
    <Modal visible={selection !== null} transparent animationType="fade" onRequestClose={() => setSelection(null)}>
      <View style={styles.overlay}><View style={styles.dialog}><ScrollView>
        <Text style={styles.title}>{selection === 'club' ? 'Select club' : 'Select month / year'}</Text>
        {selection === 'club' ? clubs.map(item => <TouchableOpacity key={item.id} style={styles.control} onPress={() => { setChosenClub(item.id); setSelection(null); }}><Text style={styles.heading}>{item.name || item.group_name || item.id}</Text></TouchableOpacity>) : <>
          <Text style={styles.body}>Year (1–9999)</Text><TextInput accessibilityLabel="Report year" keyboardType="number-pad" maxLength={4} value={yearInput} onChangeText={setYearInput} style={styles.input} />
          {REPORT_MONTHS.map((name, index) => <TouchableOpacity key={name} disabled={!/^\d{1,4}$/.test(yearInput) || Number(yearInput) < 1} style={styles.control} onPress={() => { setPeriod({ year: Number(yearInput), month: index + 1 }); setSelection(null); }}><Text style={styles.heading}>{name}</Text></TouchableOpacity>)}
        </>}
        <TouchableOpacity onPress={() => setSelection(null)} style={styles.control}><Text style={styles.link}>Close</Text></TouchableOpacity>
      </ScrollView></View></View>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  container: { paddingHorizontal: 24, paddingTop: 20 },
  title: { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 12 },
  heading: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary, flexShrink: 1 },
  body: { fontSize: 14, color: Colors.textSecondary, marginVertical: 4, flexShrink: 1 },
  caption: { fontSize: 12, color: Colors.textSecondary, marginVertical: 6 },
  card: { padding: 16, backgroundColor: Colors.white, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: Colors.cardBorder },
  period: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  periodTitle: { flex: 1, padding: 12, alignItems: 'center' }, control: { padding: 12, minHeight: 44 },
  value: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, marginVertical: 6 },
  amount: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  detail: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: Colors.cardBorder },
  warning: { padding: 16, backgroundColor: Colors.accentLight, borderRadius: 12, marginBottom: 12 },
  link: { color: Colors.accent, fontWeight: '600', paddingVertical: 12 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  dialog: { maxHeight: '85%', backgroundColor: Colors.white, borderRadius: 16, padding: 16 },
  input: { padding: 12, borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: 8, fontSize: 18 },
});
