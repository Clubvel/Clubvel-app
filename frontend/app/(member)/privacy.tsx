import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';

export default function PrivacyPolicyScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.lastUpdated}>Last Updated: April 2026</Text>
          
          <Text style={styles.intro}>
            Clubvel ("we", "our", or "us") is committed to protecting your privacy. 
            This Privacy Policy explains how we collect, use, and safeguard your 
            information when you use our mobile application.
          </Text>

          <View style={styles.policySection}>
            <Text style={styles.sectionTitle}>1. Information We Collect</Text>
            <Text style={styles.sectionContent}>
              <Text style={styles.bold}>Personal Information:</Text>{'\n'}
              • Full name{'\n'}
              • Phone number{'\n'}
              • Email address (optional){'\n'}
              • Profile photo (optional){'\n\n'}
              
              <Text style={styles.bold}>Financial Information:</Text>{'\n'}
              • Stokvel/savings club membership details{'\n'}
              • Contribution amounts and history{'\n'}
              • Proof of payment images{'\n'}
              • Bank account references (for payment identification){'\n\n'}
              
              <Text style={styles.bold}>Device Information:</Text>{'\n'}
              • Device type and operating system{'\n'}
              • App version{'\n'}
              • Usage statistics
            </Text>
          </View>

          <View style={styles.policySection}>
            <Text style={styles.sectionTitle}>2. How We Use Your Information</Text>
            <Text style={styles.sectionContent}>
              We use your information to:{'\n\n'}
              • Create and manage your account{'\n'}
              • Process and track your stokvel contributions{'\n'}
              • Send payment reminders and confirmations{'\n'}
              • Verify proof of payments{'\n'}
              • Calculate and display your trust score{'\n'}
              • Communicate important updates about your clubs{'\n'}
              • Improve our services and user experience{'\n'}
              • Comply with legal obligations
            </Text>
          </View>

          <View style={styles.policySection}>
            <Text style={styles.sectionTitle}>3. Data Storage and Security</Text>
            <Text style={styles.sectionContent}>
              • All data is stored on secure, encrypted servers{'\n'}
              • Passwords are hashed using industry-standard bcrypt{'\n'}
              • All communications use HTTPS encryption{'\n'}
              • Proof of payment images are stored securely{'\n'}
              • We implement access controls and regular security audits{'\n'}
              • Data is backed up regularly to prevent loss
            </Text>
          </View>

          <View style={styles.policySection}>
            <Text style={styles.sectionTitle}>4. Information Sharing</Text>
            <Text style={styles.sectionContent}>
              We share your information only with:{'\n\n'}
              • <Text style={styles.bold}>Your Stokvel Treasurers:</Text> To manage contributions 
              and verify payments{'\n\n'}
              • <Text style={styles.bold}>Club Members:</Text> Limited information like name and 
              payment status within your clubs{'\n\n'}
              • <Text style={styles.bold}>Service Providers:</Text> Third-party services that help 
              us operate (SMS, notifications){'\n\n'}
              We do NOT sell your personal information to third parties.
            </Text>
          </View>

          <View style={styles.policySection}>
            <Text style={styles.sectionTitle}>5. Your Rights (POPIA Compliance)</Text>
            <Text style={styles.sectionContent}>
              Under the Protection of Personal Information Act (POPIA), you have the right to:{'\n\n'}
              • <Text style={styles.bold}>Access:</Text> Request a copy of your personal data{'\n\n'}
              • <Text style={styles.bold}>Correction:</Text> Update or correct your information{'\n\n'}
              • <Text style={styles.bold}>Deletion:</Text> Request deletion of your account and data{'\n\n'}
              • <Text style={styles.bold}>Object:</Text> Object to certain processing of your data{'\n\n'}
              • <Text style={styles.bold}>Portability:</Text> Request your data in a portable format{'\n\n'}
              To exercise these rights, contact us at support@clubvel.co.za
            </Text>
          </View>

          <View style={styles.policySection}>
            <Text style={styles.sectionTitle}>6. Data Retention</Text>
            <Text style={styles.sectionContent}>
              • Active account data is retained while your account is active{'\n'}
              • Transaction history is kept for 5 years for record-keeping{'\n'}
              • Deleted account data is removed within 30 days{'\n'}
              • Backup data is purged within 90 days of deletion request
            </Text>
          </View>

          <View style={styles.policySection}>
            <Text style={styles.sectionTitle}>7. Children's Privacy</Text>
            <Text style={styles.sectionContent}>
              Our service is not intended for users under 18 years of age. 
              We do not knowingly collect information from children.
            </Text>
          </View>

          <View style={styles.policySection}>
            <Text style={styles.sectionTitle}>8. Changes to This Policy</Text>
            <Text style={styles.sectionContent}>
              We may update this Privacy Policy from time to time. We will notify 
              you of any changes by posting the new policy in the app and updating 
              the "Last Updated" date.
            </Text>
          </View>

          <View style={styles.policySection}>
            <Text style={styles.sectionTitle}>9. Contact Us</Text>
            <Text style={styles.sectionContent}>
              If you have questions about this Privacy Policy, please contact us:{'\n\n'}
              Email: support@clubvel.co.za{'\n'}
              WhatsApp: +27 60 995 3034{'\n'}
              Address: Pretoria, South Africa
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            By using Clubvel, you agree to this Privacy Policy.
          </Text>
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
    backgroundColor: Colors.darkGreen,
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.white,
  },
  content: {
    flex: 1,
  },
  section: {
    backgroundColor: Colors.white,
    margin: 16,
    borderRadius: 16,
    padding: 20,
  },
  lastUpdated: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 16,
    textAlign: 'center',
  },
  intro: {
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: 24,
  },
  policySection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.darkGreen,
    marginBottom: 12,
  },
  sectionContent: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  bold: {
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
