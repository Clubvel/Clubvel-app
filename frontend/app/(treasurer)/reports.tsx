import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useRouter } from 'expo-router';
import { AdBanner } from '../../components/AdBanner';
import { useGroupReport } from '../../hooks/useGroupReport';
import { reportPeriod, reportSummary, reportRowValues, reportColumns, reportExplanation } from '../../services/reports';
import { generatePDFReport, sharePDFReport, printPDFReport } from '../../services/pdfReportService';

export default function ReportsScreen() {
  const { user, token } = useAuth();
  const { selectedClub } = useWorkspace();
  const router = useRouter();
  const [period, setPeriod] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 });
  const [annual, setAnnual] = useState(false);
  const [busy, setBusy] = useState(false);
  const authorized = selectedClub?.role === 'admin' || selectedClub?.role === 'treasurer';
  const { phase, report, reload } = useGroupReport(user?.id, token, authorized ? selectedClub?.id : undefined, period.year, annual ? null : period.month);
  const movePeriod = (direction: number) => {
    const date = new Date(period.year, period.month - 1 + (annual ? 0 : direction), 1);
    const year = annual ? period.year + direction : date.getFullYear();
    if (year >= 1 && year <= 9999) setPeriod({ year, month: date.getMonth() + 1 });
  };
  const exportReport = async (action: 'pdf' | 'share' | 'print') => {
    if (!report || busy) return;
    setBusy(true);
    try {
      if (action === 'print') {
        const result = await printPDFReport(report);
        if (!result.success) Alert.alert('Unable to print', result.message);
      } else {
        const result = await generatePDFReport(report);
        if (!result.success || !result.uri) { Alert.alert('Unable to generate PDF', result.message); return; }
        const share = async () => {
          const shared = await sharePDFReport(result.uri!);
          if (!shared.success) Alert.alert('Unable to share', shared.message);
        };
        if (action === 'share') await share();
        else Alert.alert('PDF ready', 'Share or save this report using your device options.', [
          { text: 'Share / Save', onPress: share }, { text: 'Done', style: 'cancel' },
        ]);
      }
    } catch { Alert.alert('Report unavailable', 'The report could not be exported. Please try again.'); }
    finally { setBusy(false); }
  };
  return <View style={styles.container}>
    <View style={styles.header}>
      <TouchableOpacity accessibilityLabel="Back" onPress={() => router.push('/(treasurer)/profile')} style={styles.backButton}>
        <Ionicons name="arrow-back" size={24} color={Colors.white} />
      </TouchableOpacity>
      <View><Text style={styles.headerTitle}>Reports</Text><Text style={styles.headerSubtitle}>{selectedClub?.name || 'Select a group'}</Text></View>
    </View>
    <ScrollView style={styles.content}>
      <View style={styles.section}>
        <View style={styles.shareButtons}>
          <TouchableOpacity style={[styles.shareButton, styles.pdfButton]} disabled={busy} onPress={() => setAnnual(!annual)}>
            <Text style={styles.shareButtonText}>{annual ? 'View Monthly' : 'View Annual'}</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityLabel="Previous period" style={styles.actionButton} disabled={busy} onPress={() => movePeriod(-1)}><Ionicons name="chevron-back" size={20} color={Colors.textPrimary} /></TouchableOpacity>
          <TouchableOpacity accessibilityLabel="Next period" style={styles.actionButton} disabled={busy} onPress={() => movePeriod(1)}><Ionicons name="chevron-forward" size={20} color={Colors.textPrimary} /></TouchableOpacity>
        </View>
        <Text style={styles.sectionTitle}>{annual ? `${period.year} (full year)` : `${period.year}-${String(period.month).padStart(2, '0')}`}</Text>
        {phase === 'loading' && <View><ActivityIndicator color={Colors.primary} /><Text style={styles.reportDescription}>Loading report...</Text></View>}
        {phase === 'error' && <View style={styles.reportCard}>
          <Text style={styles.reportTitle}>Unable to load report</Text><Text style={styles.reportDescription}>We could not verify this group's records. No financial totals are shown.</Text>
          <TouchableOpacity onPress={() => void reload()}><Text style={styles.reportTitle}>Retry</Text></TouchableOpacity>
        </View>}
        {report && <>
          <View style={styles.summaryCard}>{reportSummary(report).map(([label, value]) => <View key={label} style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { flex: 1 }]}>{label}</Text><Text style={styles.summaryValue}>{value}</Text>
          </View>)}</View>
          <Text style={styles.reportDescription}>{reportExplanation}</Text>
          <Text style={styles.reportDescription}>Generated: {report.generated_at}</Text>
          {phase === 'empty' && <Text style={styles.sectionTitle}>No contribution records for this period.</Text>}
          <View style={styles.shareButtons}>{(['pdf', 'share', 'print'] as const).map(action => <TouchableOpacity key={action} style={[styles.shareButton, styles.pdfButton]} disabled={busy} onPress={() => void exportReport(action)}>
            <Text style={styles.shareButtonText}>{action === 'pdf' ? 'PDF' : action === 'share' ? 'Share' : 'Print'}</Text>
          </TouchableOpacity>)}</View>
          {busy && <ActivityIndicator color={Colors.primary} />}
          <Text style={styles.reportDescription}>Share opens your device's share options. Choose WhatsApp if available; you control sending.</Text>
          {report.rows.length > 0 && <Text style={styles.sectionTitle}>Member contributions — {reportPeriod(report)}</Text>}
          {report.rows.map(row => <View key={row.contribution_id} style={styles.reportCard}>
            {reportRowValues(row).map((value, index) => <Text key={reportColumns[index]} style={index === 0 ? styles.reportTitle : styles.reportDescription}>{reportColumns[index]}: {value}</Text>)}
          </View>)}
        </>}
      </View>
      <AdBanner size="banner" />
    </ScrollView>
  </View>;
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.white,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  summaryCard: {
    backgroundColor: Colors.darkGreen,
    padding: 20,
    borderRadius: 14,
    gap: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.white,
  },
  collectedValue: {
    color: '#4ADE80',
  },
  outstandingValue: {
    color: '#FCA5A5',
  },
  lateValue: {
    color: '#FCA5A5',
  },
  reportCard: {
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 12,
  },
  reportIcon: {
    marginBottom: 12,
  },
  reportInfo: {
    marginBottom: 12,
  },
  reportTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  reportDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  reportActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.lightBackground,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  shareButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  shareButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  whatsappButton: {
    backgroundColor: '#25D366',
  },
  pdfButton: {
    backgroundColor: Colors.darkGreen,
  },
  emailButton: {
    backgroundColor: Colors.mediumGreen,
  },
  shareButtonText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '600',
  },
});
