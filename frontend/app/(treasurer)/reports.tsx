import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'expo-router';
import { AdBanner } from '../../components/AdBanner';
import axios from 'axios';
import { 
  generatePDFReport, 
  sharePDFReport, 
  printPDFReport,
  ReportData 
} from '../../services/pdfReportService';

export default function ReportsScreen() {
  const { user, token } = useAuth();
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingType, setGeneratingType] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loadingReports, setLoadingReports] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

  const fetchReportData = async () => {
    if (!user?.id) return;

    try {
      const response = await axios.get(`${API_URL}/api/admin/dashboard/${user.id}`, { headers: { Authorization: `Bearer ${token}` } });
      setDashboardData(response.data);
    } catch (error) {
      console.error('Error fetching report data:', error);
      Alert.alert('Unable to Load Reports', 'Clubvel could not load the latest financial data. Please try again.');
    } finally {
      setLoadingReports(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchReportData();
    }
  }, [user?.id]);

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
      const result = await generatePDFReport(reportData);

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
      Alert.alert('Error', 'Failed to generate report. Please try again.');
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

      const result = await generatePDFReport(reportData);

      if (result.success && result.uri) {
        await sharePDFReport(result.uri);
      } else {
        Alert.alert('Error', result.message);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to share report. Please try again.');
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('/(treasurer)/profile')} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.white} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Reports</Text>
        </View>
      </View>

      <ScrollView style={styles.content}>
        {/* Current Month Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Month</Text>
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Collected</Text>
              <Text style={[styles.summaryValue, styles.collectedValue]}>
                R{(dashboardData?.clubs || []).reduce((sum: number, club: any) => sum + Number(club.collected || 0), 0).toFixed(2)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Collection Rate</Text>
              <Text style={styles.summaryValue}>
                {(() => {
                  const clubs = dashboardData?.clubs || [];
                  const collected = clubs.reduce((sum: number, club: any) => sum + Number(club.collected || 0), 0);
                  const expected = clubs.reduce((sum: number, club: any) => sum + Number(club.expected || 0), 0);
                  return expected > 0 ? `${Math.round((collected / expected) * 100)}%` : '0%';
                })()}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Outstanding</Text>
              <Text style={[styles.summaryValue, styles.outstandingValue]}>
                R{Math.max(
                  0,
                  (dashboardData?.clubs || []).reduce((sum: number, club: any) => sum + Number(club.expected || 0), 0) -
                  (dashboardData?.clubs || []).reduce((sum: number, club: any) => sum + Number(club.collected || 0), 0)
                ).toFixed(2)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Late Members</Text>
              <Text style={[styles.summaryValue, styles.lateValue]}>
                {(dashboardData?.clubs || []).reduce((sum: number, club: any) => sum + Number(club.late_count || 0), 0)}
              </Text>
            </View>
          </View>
        </View>

        {/* Report Types */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Available Reports</Text>

          {/* Monthly Report */}
          <View style={styles.reportCard}>
            <View style={styles.reportIcon}>
              <Ionicons name="calendar" size={32} color={Colors.mediumGreen} />
            </View>
            <View style={styles.reportInfo}>
              <Text style={styles.reportTitle}>Monthly Report</Text>
              <Text style={styles.reportDescription}>
                Detailed breakdown of all contributions for the current month with member-by-member analysis.
              </Text>
            </View>
            <View style={styles.reportActions}>
              {renderActionButton('monthly', 'download', Colors.mediumGreen, () => handleExportPDF('monthly'))}
              {renderActionButton('monthly', 'logo-whatsapp', '#25D366', () => handleShareWhatsApp('monthly'))}
            </View>
          </View>

          {/* Annual Report */}
          <View style={styles.reportCard}>
            <View style={styles.reportIcon}>
              <Ionicons name="bar-chart" size={32} color={Colors.gold} />
            </View>
            <View style={styles.reportInfo}>
              <Text style={styles.reportTitle}>Annual Report</Text>
              <Text style={styles.reportDescription}>
                Month-by-month collection summary for the entire year with trends and totals.
              </Text>
            </View>
            <View style={styles.reportActions}>
              {renderActionButton('annual', 'download', Colors.mediumGreen, () => handleExportPDF('annual'))}
              {renderActionButton('annual', 'logo-whatsapp', '#25D366', () => handleShareWhatsApp('annual'))}
            </View>
          </View>

          {/* Member Statement */}
          <View style={styles.reportCard}>
            <View style={styles.reportIcon}>
              <Ionicons name="person" size={32} color={Colors.mediumGreen} />
            </View>
            <View style={styles.reportInfo}>
              <Text style={styles.reportTitle}>Member Statement</Text>
              <Text style={styles.reportDescription}>
                Complete payment history for any individual member with proof of payment images.
              </Text>
            </View>
            <View style={styles.reportActions}>
              {renderActionButton('member', 'download', Colors.mediumGreen, () => handleExportPDF('member'))}
              {renderActionButton('member', 'logo-whatsapp', '#25D366', () => handleShareWhatsApp('member'))}
            </View>
          </View>

          {/* Defaulters Report */}
          <View style={styles.reportCard}>
            <View style={styles.reportIcon}>
              <Ionicons name="alert-circle" size={32} color={Colors.statusLate} />
            </View>
            <View style={styles.reportInfo}>
              <Text style={styles.reportTitle}>Defaulters Report</Text>
              <Text style={styles.reportDescription}>
                List of all members with late or missed payments across all months managed.
              </Text>
            </View>
            <View style={styles.reportActions}>
              {renderActionButton('monthly', 'download', Colors.mediumGreen, () => handleExportPDF('monthly'))}
              {renderActionButton('monthly', 'logo-whatsapp', '#25D366', () => handleShareWhatsApp('monthly'))}
            </View>
          </View>
        </View>

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
