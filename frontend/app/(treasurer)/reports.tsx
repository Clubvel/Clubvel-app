import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { 
  generatePDFReport, 
  sharePDFReport, 
  printPDFReport,
  generateSampleReportData,
  ReportData 
} from '../../services/pdfReportService';

export default function ReportsScreen() {
  const { user } = useAuth();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingType, setGeneratingType] = useState<string | null>(null);

  const handleExportPDF = async (reportType: 'monthly' | 'quarterly' | 'annual' | 'member') => {
    setIsGenerating(true);
    setGeneratingType(reportType);

    try {
      // Generate report data (in production, fetch from API)
      const reportData: ReportData = {
        ...generateSampleReportData(user?.full_name || 'Treasurer'),
        reportType,
      };

      // Update period based on report type
      const now = new Date();
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                          'July', 'August', 'September', 'October', 'November', 'December'];
      
      switch (reportType) {
        case 'monthly':
          reportData.period = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
          break;
        case 'quarterly':
          const quarter = Math.floor(now.getMonth() / 3) + 1;
          reportData.period = `Q${quarter} ${now.getFullYear()}`;
          break;
        case 'annual':
          reportData.period = `${now.getFullYear()}`;
          break;
        case 'member':
          reportData.period = `Jan - ${monthNames[now.getMonth()]} ${now.getFullYear()}`;
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

  const handlePrintReport = async (reportType: 'monthly' | 'quarterly' | 'annual' | 'member') => {
    setIsGenerating(true);
    setGeneratingType(reportType);

    try {
      const reportData: ReportData = {
        ...generateSampleReportData(user?.full_name || 'Treasurer'),
        reportType,
      };

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
      const reportData: ReportData = {
        ...generateSampleReportData(user?.full_name || 'Treasurer'),
        reportType,
      };

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
        <Text style={styles.headerTitle}>Reports</Text>
        <Text style={styles.headerSubtitle}>Phala tja Pele</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Current Month Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Month</Text>
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Collected</Text>
              <Text style={[styles.summaryValue, styles.collectedValue]}>R500.00</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Collection Rate</Text>
              <Text style={styles.summaryValue}>50%</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Outstanding</Text>
              <Text style={[styles.summaryValue, styles.outstandingValue]}>R500.00</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Late Members</Text>
              <Text style={[styles.summaryValue, styles.lateValue]}>1</Text>
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

        {/* Share Options */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.shareButtons}>
            <TouchableOpacity 
              style={[styles.shareButton, styles.whatsappButton]}
              onPress={() => handleShareWhatsApp('monthly')}
              disabled={isGenerating}
            >
              <Ionicons name="logo-whatsapp" size={20} color={Colors.white} />
              <Text style={styles.shareButtonText}>WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.shareButton, styles.pdfButton]}
              onPress={() => handleExportPDF('monthly')}
              disabled={isGenerating}
            >
              <Ionicons name="document-text" size={20} color={Colors.white} />
              <Text style={styles.shareButtonText}>PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.shareButton, styles.emailButton]}
              onPress={() => handlePrintReport('monthly')}
              disabled={isGenerating}
            >
              <Ionicons name="print" size={20} color={Colors.white} />
              <Text style={styles.shareButtonText}>Print</Text>
            </TouchableOpacity>
          </View>
        </View>
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
