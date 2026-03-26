import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';

export default function ReportsScreen() {
  const handleExportPDF = (reportType: string) => {
    Alert.alert('Export Report', `${reportType} will be exported as PDF and can be shared via WhatsApp or email.`);
  };

  const handleShareWhatsApp = (reportType: string) => {
    Alert.alert('Share via WhatsApp', `Sending ${reportType} to group members...`);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Reports</Text>
        <Text style={styles.headerSubtitle}>Soshanguve Savings Club</Text>
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
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleExportPDF('Monthly Report')}
              >
                <Ionicons name="download" size={20} color={Colors.mediumGreen} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleShareWhatsApp('Monthly Report')}
              >
                <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
              </TouchableOpacity>
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
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleExportPDF('Annual Report')}
              >
                <Ionicons name="download" size={20} color={Colors.mediumGreen} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleShareWhatsApp('Annual Report')}
              >
                <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
              </TouchableOpacity>
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
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => Alert.alert('Select Member', 'Choose a member to generate their statement')}
              >
                <Ionicons name="arrow-forward" size={20} color={Colors.mediumGreen} />
              </TouchableOpacity>
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
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleExportPDF('Defaulters Report')}
              >
                <Ionicons name="download" size={20} color={Colors.mediumGreen} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleShareWhatsApp('Defaulters Report')}
              >
                <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Share Options */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Share Report Via</Text>
          <View style={styles.shareButtons}>
            <TouchableOpacity style={[styles.shareButton, styles.whatsappButton]}>
              <Ionicons name="logo-whatsapp" size={24} color={Colors.white} />
              <Text style={styles.shareButtonText}>WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.shareButton, styles.pdfButton]}>
              <Ionicons name="document-text" size={24} color={Colors.white} />
              <Text style={styles.shareButtonText}>PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.shareButton, styles.emailButton]}>
              <Ionicons name="mail" size={24} color={Colors.white} />
              <Text style={styles.shareButtonText}>Email</Text>
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
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
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
    fontSize: 14,
    fontWeight: '600',
  },
});
