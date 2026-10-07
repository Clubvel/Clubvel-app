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
  const [detail, setDetail] = useState<{ key: string; kind: 'contributions' | 'claims' | 'about' } | null>(null);
  const [claimView, setClaimView] = useState<'submitted' | 'approved' | 'paid' | 'remaining'>('submitted');
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
  const openDetail = (kind: 'contributions' | 'claims' | 'about') => {
    setClaimView('submitted');
    setDetail({ key, kind });
  };
  const readableStatus = (status: string) => ({
    pending: 'Pending', due: 'Due', late: 'Late', proof_uploaded: 'Awaiting review',
    confirmed: 'Confirmed', paid: 'Paid', excused: 'Excused',
    approved: 'Approved', rejected: 'Rejected',
  }[status] || 'Status unavailable');
  const claimStatus = (status: string) => status === 'pending' ? 'Awaiting approval' : readableStatus(status);
  const dated = (stamp: string) => new Date(stamp).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' });
  const warningText: Record<string, string> = {
    historical_identity_unavailable: 'A former member’s name is unavailable. Their financial record is still included.',
    confirmation_date_unavailable: 'A confirmed contribution has no confirmation date.',
    unconfirmed_recorded_payment: 'A payment amount reduces outstanding but has not been confirmed as received.',
    settled_amount_mismatch: 'A settled contribution has a recorded payment below its expected amount.',
    submission_date_unavailable: 'A claim has no submission date and cannot be placed in a month.',
    approval_date_unavailable: 'An approved claim has no approval date and cannot be placed in a month.',
    scheduled_date_invalid: 'A scheduled payout date needs checking.',
    claim_payment_state_mismatch: 'A claim’s payment amount and status need checking.',
    payout_date_unavailable: 'A payment has no valid payment date and cannot be placed in a month.',
    payout_history_incomplete: 'A claim’s payment history does not match its recorded total paid.',
  };
  const value = (label: string, amount: number) => <View style={styles.value}><Text style={styles.body}>{label}</Text><Text style={styles.amount}>{reportRand(amount)}</Text></View>;
  const shift = (delta: number) => {
    const next = moveReportMonth(period, delta);
    if (next.year >= 1 && next.year <= 9999) setPeriod(next);
  };
  return <View style={styles.container}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Select report club" style={styles.card} onPress={() => setSelection('club')}>
      <Text style={styles.heading}>{report?.club.name || club?.name || club?.group_name || 'Select club'} ▾</Text>
    </TouchableOpacity>
    <View style={styles.period}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous report month" style={styles.control} onPress={() => shift(-1)}><Text style={styles.heading}>‹</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Select report month and year" style={styles.periodTitle} onPress={() => { setYearInput(String(period.year)); setSelection('period'); }}><Text style={styles.heading}>{REPORT_MONTHS[period.month - 1]} {period.year} ▾</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next report month" style={styles.control} onPress={() => shift(1)}><Text style={styles.heading}>›</Text></TouchableOpacity>
    </View>
    {loading || (!report && !failure) ? <ActivityIndicator accessibilityLabel="Loading monthly report" color={Colors.accent} /> : null}
    {failure ? <View style={styles.card}><Text style={styles.body}>{failure}</Text><TouchableOpacity accessibilityRole="button" onPress={() => void fetchReport()}><Text style={styles.link}>Retry monthly report</Text></TouchableOpacity></View> : null}
    {report ? <>
      <View style={styles.card}>
        <Text style={styles.heading}>Contributions</Text>
        {value('Expected', report.summary.expected)}{value('Received', report.summary.confirmed)}
        {value('Outstanding', report.summary.outstanding)}{value('Awaiting review', report.summary.awaiting_review)}
        {report.contributions.length ? (
          <TouchableOpacity accessibilityRole="button" onPress={() => openDetail('contributions')}><Text style={styles.link}>View contribution details ›</Text></TouchableOpacity>
        ) : <Text style={styles.body}>No contributions recorded for {REPORT_MONTHS[period.month - 1]} {period.year}.</Text>}
      </View>
      <View style={styles.card}>
        <Text style={styles.heading}>Claims &amp; Payouts</Text>
        {value(`Claims submitted (${report.summary.claims_submitted_count})`, report.summary.claims_submitted_amount)}
        {value(`Claims approved (${report.summary.claims_approved_count})`, report.summary.claims_approved_amount)}
        {value('Paid this month', report.summary.actual_payouts)}
        {value('Still to be paid', report.summary.current_commitments)}
        <Text style={styles.caption}>Current approved balance</Text>
        {!report.claim_activity.submitted.length ? <Text style={styles.body}>No claims submitted in {REPORT_MONTHS[period.month - 1]} {period.year}.</Text> : null}
        {!report.payout_payments.length ? <Text style={styles.body}>No payouts recorded in {REPORT_MONTHS[period.month - 1]} {period.year}.</Text> : null}
        {report.claim_activity.submitted.length || report.claim_activity.approved.length || report.payout_payments.length || report.current_commitments.length ? (
          <TouchableOpacity accessibilityRole="button" onPress={() => openDetail('claims')}><Text style={styles.link}>View claim details ›</Text></TouchableOpacity>
        ) : null}
      </View>
      {report.warnings.some(w => w.code !== 'receipt_date_unavailable') || report.unallocated_activity.length ? (
        <TouchableOpacity accessibilityRole="button" style={styles.warning} onPress={() => openDetail('about')}><Text style={styles.heading}>Some records need attention ›</Text></TouchableOpacity>
      ) : null}
      <TouchableOpacity accessibilityRole="button" onPress={() => openDetail('about')}><Text style={styles.link}>About these figures ⓘ</Text></TouchableOpacity>
      <Modal visible={detail?.key === key} transparent animationType="slide" onRequestClose={() => setDetail(null)}>
        {detail?.key === key ? <View style={styles.sheetOverlay}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close report details backdrop" style={styles.backdrop} onPress={() => setDetail(null)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.heading}>{detail.kind === 'contributions' ? 'Contribution details' : detail.kind === 'claims' ? 'Claim details' : 'About these figures'}</Text>
              <TouchableOpacity accessibilityRole="button" onPress={() => setDetail(null)}><Text style={styles.link}>Close</Text></TouchableOpacity>
            </View>
            <Text style={styles.caption}>{report.club.name} • {REPORT_MONTHS[period.month - 1]} {period.year}</Text>
            <ScrollView>
              {detail.kind === 'contributions' ? report.contributions.map(row => <View key={row.id} style={styles.detail}>
                <Text style={styles.heading}>{row.member_name}</Text>
                <Text style={styles.body}>{readableStatus(row.status)}{row.proof_review_status === 'declined' ? ' • Proof declined' : ''}</Text>
                {value('Expected', row.expected)}{value('Received', row.confirmed)}{value('Outstanding', row.outstanding)}
                {row.confirmation_date ? <Text style={styles.caption}>Confirmed: {dated(row.confirmation_date)}</Text> : null}
              </View>) : null}
              {detail.kind === 'claims' ? <>
                <View style={styles.tabs}>
                  {(['submitted', 'approved', 'paid', 'remaining'] as const).map(view => <TouchableOpacity key={view} accessibilityRole="button" accessibilityState={{ selected: claimView === view }} style={[styles.tab, claimView === view && styles.selectedTab]} onPress={() => setClaimView(view)}>
                    <Text style={styles.body}>{({ submitted: 'Submitted this month', approved: 'Approved this month', paid: 'Paid this month', remaining: 'Still to be paid' })[view]}</Text>
                  </TouchableOpacity>)}
                </View>
                {claimView === 'submitted' || claimView === 'approved' ? <>
                  {(claimView === 'submitted' ? report.claim_activity.submitted : report.claim_activity.approved).map(row => <View key={row.claim_id} style={styles.detail}>
                    <Text style={styles.heading}>{row.member_name}</Text>
                    {value('Claim amount', row.claim_amount)}
                    <Text style={styles.body}>{claimStatus(row.status)}</Text>
                    <Text style={styles.caption}>{'submitted_at' in row ? 'Submitted' : 'Approved'}: {dated('submitted_at' in row ? row.submitted_at : row.reviewed_at)}</Text>
                  </View>)}
                  {!(claimView === 'submitted' ? report.claim_activity.submitted : report.claim_activity.approved).length ? <Text style={styles.body}>No claims {claimView} in {REPORT_MONTHS[period.month - 1]} {period.year}.</Text> : null}
                </> : null}
                {claimView === 'paid' ? <>
                  {report.payout_payments.map(row => <View key={`${row.claim_id}-${row.id}`} style={styles.detail}>
                    <Text style={styles.heading}>{row.member_name}</Text>
                    {value('Claim amount', row.claim_amount)}{value('Payment amount', row.amount)}
                    <Text style={styles.body}>{claimStatus(row.status)}</Text>
                    <Text style={styles.caption}>Payment date: {row.actual_payment_date}</Text>
                  </View>)}
                  {!report.payout_payments.length ? <Text style={styles.body}>No payouts recorded in {REPORT_MONTHS[period.month - 1]} {period.year}.</Text> : null}
                </> : null}
                {claimView === 'remaining' ? <>
                  <Text style={styles.caption}>Current approved balance</Text>
                  {report.current_commitments.map(row => <View key={row.claim_id} style={styles.detail}>
                    <Text style={styles.heading}>{row.member_name}</Text>
                    {value('Claim amount', row.claim_amount)}{value('Already paid', row.actual_amount_paid)}{value('Remaining', row.remaining)}
                    <Text style={styles.body}>{claimStatus(row.status)}</Text>
                    <Text style={styles.caption}>Payout date: {row.scheduled_claim_date || 'Not scheduled'}</Text>
                  </View>)}
                  {!report.current_commitments.length ? <Text style={styles.body}>No approved payouts remaining.</Text> : null}
                </> : null}
              </> : null}
              {detail.kind === 'about' ? <>
                <Text style={styles.body}>Received shows contributions confirmed in Clubvel, not verified bank deposits. Awaiting review is included in Outstanding.</Text>
                <Text style={styles.body}>Contributions belong to the selected contribution month. Claims submitted and approved use their event dates. Paid this month uses each actual payment date.</Text>
                <Text style={styles.body}>Still to be paid is the current approved unpaid or partially paid balance, across all months. It is not the balance at the end of the selected month.</Text>
                <Text style={styles.caption}>Reporting timezone: Africa/Johannesburg</Text>
                <Text style={styles.caption}>Generated: {dated(report.generated_at)}</Text>
                {report.warnings.filter(w => w.code !== 'receipt_date_unavailable').map((warning, index) => <Text key={index} style={styles.body}>{warningText[warning.code] || 'A record needs checking before relying on these figures.'}</Text>)}
                {report.unallocated_activity.length ? <Text style={styles.heading}>Records without a usable date</Text> : null}
                {report.unallocated_activity.map((row, index) => <View key={index} style={styles.detail}>
                  <Text style={styles.body}>{row.member_name} • {({ submission: 'Claim submitted', approval: 'Claim approved', payout: 'Payment' })[row.activity] || 'Claim activity'} • {reportRand(row.amount ?? row.claim_amount)}</Text>
                </View>)}
              </> : null}
            </ScrollView>
          </View>
        </View> : null}
      </Modal>
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
  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  backdrop: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  sheet: { height: '90%', backgroundColor: Colors.white, padding: 24, paddingBottom: 32, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  tab: { padding: 10, minHeight: 44, borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: 8 },
  selectedTab: { borderColor: Colors.accent, backgroundColor: Colors.accentLight },
  warning: { padding: 16, backgroundColor: Colors.accentLight, borderRadius: 12, marginBottom: 12 },
  link: { color: Colors.accent, fontWeight: '600', paddingVertical: 12 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  dialog: { maxHeight: '85%', backgroundColor: Colors.white, borderRadius: 16, padding: 16 },
  input: { padding: 12, borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: 8, fontSize: 18 },
});
