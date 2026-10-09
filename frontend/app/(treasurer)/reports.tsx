import ProfilePhotoViewer from '../../components/ProfilePhotoViewer';
import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, RefreshControl, Image } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import MonthlyReport from '../../components/MonthlyReport';
import { AdBanner } from '../../components/AdBanner';
import axios, { isAxiosError } from 'axios';
import { 
  generatePDFReport, 
  sharePDFReport, 
  printPDFReport,
  ReportData 
} from '../../services/pdfReportService';

export default function ReportsScreen() {
  const { user, token } = useAuth();
  const router = useRouter();
  const [photoExpanded, setPhotoExpanded] = React.useState(false);
  const { group_id, clubId } = useLocalSearchParams<{ group_id?: string; clubId?: string }>();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingType, setGeneratingType] = useState<string | null>(null);
  const [showExports, setShowExports] = useState(false);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loadingReports, setLoadingReports] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const request = useRef(0);
  const [reportRefreshKey, setReportRefreshKey] = useState(0);

  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

  const fetchReportData = useCallback(async (pullToRefresh = false) => {
    const ticket = ++request.current;
    setRefreshing(pullToRefresh);
    setReportError(null);
    try {
      if (!user?.id || !token) throw new Error('Please sign in again to load reports.');
      const response = await axios.get(`${API_URL}/api/admin/dashboard/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 20000,
      });
      if (!Array.isArray(response.data?.clubs)) throw new Error('Invalid report data received.');
      if (ticket === request.current) { setDashboardData(response.data); setReportRefreshKey(value => value + 1); }
    } catch (error) {
      if (ticket === request.current) {
        setDashboardData(null);
        setReportError(error instanceof Error && !isAxiosError(error)
          ? error.message : 'Unable to load reports. Check your connection and try again.');
      }
    } finally {
      if (ticket === request.current) { setLoadingReports(false); setRefreshing(false); }
    }
  }, [API_URL, user?.id, token]);

  useFocusEffect(useCallback(() => {
    setDashboardData(null);
    setLoadingReports(true);
    void fetchReportData();
    return () => { request.current += 1; };
  }, [fetchReportData]));

  // Bound native PDF generation too: an Android print failure must release the controls.
  const generatePDF = async (data: ReportData) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        generatePDFReport(data),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('PDF generation timed out. Please try again.')), 45000);
        }),
      ]);
    } finally { if (timer) clearTimeout(timer); }
  };

  const buildReportData = async (
    reportType: 'monthly' | 'annual'
  ): Promise<ReportData> => {
    if (!token) {
      throw new Error('Authentication session is not available.');
    }

    const managedClubs = (dashboardData?.clubs || []).filter(
      (club: any) => club?.id
    );

    if (managedClubs.length === 0) {
      throw new Error('No managed groups are available for this report.');
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const responses = await Promise.all(
      managedClubs.map((club: any) =>
        axios.get(`${API_URL}/api/treasurer/reports/${club.id}`, {
          timeout: 20000,
          params: reportType === 'monthly'
            ? { year, month }
            : { year },
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
      )
    );

    const reports = responses.map((response) => response.data);
    const rows = reports.flatMap((report: any) => report.rows || []);

    const totalCollected = reports.reduce(
      (sum: number, report: any) =>
        sum + Number(report.summary?.total_collected || 0),
      0
    );

    const totalExpected = reports.reduce(
      (sum: number, report: any) =>
        sum + Number(report.summary?.recorded_obligations || 0),
      0
    );

    const appliedToObligations = rows.reduce(
      (sum: number, row: any) => {
        if (row.recorded_status === 'excused') {
          return sum;
        }

        return sum + Math.min(
          Number(row.amount_due || 0),
          Number(row.amount_paid || 0)
        );
      },
      0
    );

    const memberIds = new Set(
      rows.map((row: any) => row.person_id).filter(Boolean)
    );

    const lateMemberIds = new Set(
      rows
        .filter(
          (row: any) =>
            row.status === 'late' &&
            Number(row.outstanding || 0) > 0
        )
        .map((row: any) => row.person_id)
        .filter(Boolean)
    );

    return {
      reportType,
      treasurerName: user?.full_name || 'Treasurer',
      generatedDate: now.toLocaleString('en-ZA'),
      period: reportType === 'monthly'
        ? `${monthNames[now.getMonth()]} ${year}`
        : `${year}`,
      clubs: reports.map((report: any) => ({
        id: report.group_id,
        name: report.group_name,
        member_count: new Set(
          (report.rows || [])
            .map((row: any) => row.person_id)
            .filter(Boolean)
        ).size,
        collected: Number(report.summary?.total_collected || 0),
        expected: Number(report.summary?.recorded_obligations || 0),
        late_count: Number(report.summary?.late_members || 0),
      })),
      summary: {
        totalCollected,
        totalExpected,
        collectionRate:
          totalExpected > 0
            ? (appliedToObligations / totalExpected) * 100
            : 0,
        totalMembers: memberIds.size,
        latePayments: lateMemberIds.size,
      },
    };
  };

  const handleExportPDF = async (reportType: 'monthly' | 'quarterly' | 'annual' | 'member') => {
    setIsGenerating(true);
    setGeneratingType(reportType);

    try {
      // Generate report data (in production, fetch from API)
      if (!dashboardData) {
        Alert.alert('Report Not Ready', 'Please wait for the latest financial data to load.');
        return;
      }

      if (reportType !== 'monthly' && reportType !== 'annual') {
        Alert.alert(
          'Report Not Available',
          'This report requires its own member or historical selection and will not be generated from unrelated financial data.'
        );
        return;
      }

      const reportData = await buildReportData(reportType);

      // Update period based on report type
      const now = new Date();
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                          'July', 'August', 'September', 'October', 'November', 'December'];
      
      switch (reportType) {
        case 'monthly':
          reportData.period = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
          break;
        case 'annual':
          reportData.period = `${now.getFullYear()}`;
          break;
      }

      // Generate PDF
      const result = await generatePDF(reportData);

      if (result.success && result.uri) {
        Alert.alert(
          'Report Generated',
          'Your PDF report is ready. What would you like to do?',
          [
            { text: 'Share', onPress: () => sharePDFReport(result.uri!) },
            { text: 'Done', style: 'cancel' },
          ]
        );
      } else {
        Alert.alert('Error', result.message);
      }
    } catch (error) {
      Alert.alert('Unable to generate report', error instanceof Error ? error.message : 'Please try again.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Retry', onPress: () => void handleExportPDF(reportType) },
      ]);
    } finally {
      setIsGenerating(false);
      setGeneratingType(null);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Preserve the report handler while removing only Quick Actions.
  const handlePrintReport = async (reportType: 'monthly' | 'quarterly' | 'annual' | 'member') => {
    setIsGenerating(true);
    setGeneratingType(reportType);

    try {
      if (!dashboardData) {
        Alert.alert('Report Not Ready', 'Please wait for the latest financial data to load.');
        return;
      }

      if (reportType !== 'monthly' && reportType !== 'annual') {
        Alert.alert(
          'Report Not Available',
          'This report requires its own member or historical selection and will not be generated from unrelated financial data.'
        );
        return;
      }

      const reportData = await buildReportData(reportType);

      const result = await printPDFReport(reportData);

      if (!result.success) {
        Alert.alert('Error', result.message);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to print report. Please try again.');
    } finally {
      setIsGenerating(false);
      setGeneratingType(null);
    }
  };

  const handleShareWhatsApp = async (reportType: 'monthly' | 'quarterly' | 'annual' | 'member') => {
    setIsGenerating(true);
    setGeneratingType(reportType);

    try {
      if (!dashboardData) {
        Alert.alert('Report Not Ready', 'Please wait for the latest financial data to load.');
        return;
      }

      if (reportType !== 'monthly' && reportType !== 'annual') {
        Alert.alert(
          'Report Not Available',
          'This report requires its own member or historical selection and will not be generated from unrelated financial data.'
        );
        return;
      }

      const reportData = await buildReportData(reportType);

      const result = await generatePDF(reportData);

      if (result.success && result.uri) {
        await sharePDFReport(result.uri);
      } else {
        Alert.alert('Error', result.message);
      }
    } catch (error) {
      Alert.alert('Unable to share report', error instanceof Error ? error.message : 'Please try again.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Retry', onPress: () => void handleShareWhatsApp(reportType) },
      ]);
    } finally {
      setIsGenerating(false);
      setGeneratingType(null);
    }
  };

  const renderActionButton = (
    reportType: 'monthly' | 'quarterly' | 'annual' | 'member',
    icon: string,
    color: string,
    onPress: () => void
  ) => {
    const isLoading = isGenerating && generatingType === reportType;
    
    return (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`${icon === 'download' ? 'Download' : 'Share'} ${reportType === 'monthly' ? 'current-month' : 'current-year'} contribution export`}
        style={styles.actionButton}
        onPress={onPress}
        disabled={isGenerating}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={color} />
        ) : (
          <Ionicons name={icon as any} size={20} color={color} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <ProfilePhotoViewer visible={photoExpanded} photoUri={user?.profile_photo} displayName={user?.full_name} onClose={() => setPhotoExpanded(false)} />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('/(treasurer)/profile')} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.white} />
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Expand profile photo"
          onPress={() => user?.profile_photo ? setPhotoExpanded(true) : router.push('/(treasurer)/profile')}
          style={styles.profileButton}
        >
          {user?.profile_photo ? (
            <Image source={{ uri: user.profile_photo }} style={styles.profileImage} resizeMode="cover" />
          ) : (
            <View style={styles.profilePlaceholder}>
              <Text style={styles.profileInitial}>{(user?.full_name || '').trim().charAt(0).toUpperCase() || '?'}</Text>
            </View>
          )}
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}><Text style={styles.headerTitle}>Reports</Text></View>
      </View>

      <ScrollView style={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void fetchReportData(true)} />}>
        {loadingReports ? <ActivityIndicator accessibilityLabel="Loading reports" color={Colors.accent} /> : null}
        {reportError ? (
          <View style={styles.section}>
            <Text style={styles.reportDescription}>{reportError}</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => void fetchReportData()}>
              <Text style={{ color: Colors.accent, paddingVertical: 12 }}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : !loadingReports && dashboardData?.clubs.length === 0 ? (
          <View style={styles.section}><Text style={styles.reportDescription}>No managed clubs or report data yet.</Text></View>
        ) : null}
        {dashboardData?.clubs.length > 0 && !reportError && (<>

        <MonthlyReport clubs={dashboardData.clubs} token={token} contextualClubId={group_id || clubId} refreshKey={reportRefreshKey} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Report actions</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: showExports }} onPress={() => setShowExports(value => !value)}>
            <Text style={styles.exportLink}>Other available exports {showExports ? '⌄' : '›'}</Text>
          </TouchableOpacity>
          {showExports ? <>
            <Text style={styles.reportDescription}>These contribution exports cover all your managed clubs. They do not use the club or month selected above, and do not include the new claims and payouts statement.</Text>
            <View style={styles.reportCard}>
              <Text style={styles.reportTitle}>Current-month contribution export</Text>
              <Text style={styles.reportDescription}>Contributions for the current month across all your managed clubs.</Text>
              <View style={styles.reportActions}>
                {renderActionButton('monthly', 'download', Colors.mediumGreen, () => handleExportPDF('monthly'))}
                {renderActionButton('monthly', 'logo-whatsapp', '#25D366', () => handleShareWhatsApp('monthly'))}
              </View>
            </View>
            <View style={styles.reportCard}>
              <Text style={styles.reportTitle}>Current-year contribution export</Text>
              <Text style={styles.reportDescription}>Contributions for the current year across all your managed clubs.</Text>
              <View style={styles.reportActions}>
                {renderActionButton('annual', 'download', Colors.mediumGreen, () => handleExportPDF('annual'))}
                {renderActionButton('annual', 'logo-whatsapp', '#25D366', () => handleShareWhatsApp('annual'))}
              </View>
            </View>
          </> : null}
        </View>

        </>)}
        {/* Ad Banner */}
        <AdBanner size="banner" />
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  backButton: {
    padding: 8,
  },
  headerTitleContainer: {
    flex: 1,
    minWidth: 0,
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
    borderWidth: 2,
    borderColor: Colors.gold,
    backgroundColor: Colors.gold,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInitial: {
    fontSize: 32,
    fontWeight: 'bold',
    color: Colors.white,
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
  exportLink: { color: Colors.accent, fontWeight: '600', paddingVertical: 12 },
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
