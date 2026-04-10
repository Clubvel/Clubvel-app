import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function PrivacyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const sections = [
    {
      title: '1. Information We Collect',
      content: 'We collect information you provide directly, including your name, phone number, and payment proof images. We also collect usage data to improve our services.',
    },
    {
      title: '2. How We Use Your Information',
      content: 'Your information is used to manage your stokvel membership, track contributions, facilitate claims payouts, and communicate important updates about your groups.',
    },
    {
      title: '3. Data Storage & Security',
      content: 'Your data is stored securely using industry-standard encryption. Payment proof images are stored as encoded data in our secure database. We implement appropriate technical measures to protect against unauthorized access.',
    },
    {
      title: '4. Information Sharing',
      content: 'We share your contribution status and basic profile information with your group treasurer and fellow members. We do not sell your personal information to third parties.',
    },
    {
      title: '5. Your Rights',
      content: 'You have the right to access, correct, or delete your personal information. You can request a copy of your data or ask us to remove your account by contacting our support team.',
    },
    {
      title: '6. POPIA Compliance',
      content: 'We comply with the Protection of Personal Information Act (POPIA) of South Africa. We only process your personal information with your consent and for legitimate purposes related to stokvel management.',
    },
    {
      title: '7. Cookies & Tracking',
      content: 'Our mobile app may use local storage to remember your preferences and login status. We may collect anonymous analytics data to improve app performance.',
    },
    {
      title: '8. Changes to This Policy',
      content: 'We may update this privacy policy from time to time. We will notify you of any significant changes through the app or via your registered contact details.',
    },
    {
      title: '9. Contact Us',
      content: 'If you have any questions about this privacy policy or our data practices, please contact us at privacy@clubvel.co.za or call our support line.',
    },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <Text style={styles.introTitle}>Privacy Policy</Text>
          <Text style={styles.introDate}>Last updated: January 2025</Text>
          <Text style={styles.introText}>
            Clubvel ("we", "our", or "us") is committed to protecting your privacy. 
            This policy explains how we collect, use, and safeguard your personal information.
          </Text>
        </View>

        {sections.map((section, index) => (
          <View key={index} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionContent}>{section.content}</Text>
          </View>
        ))}

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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.white,
  },
  content: {
    flex: 1,
  },
  intro: {
    backgroundColor: Colors.white,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  introTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  introDate: {
    fontSize: 14,
    color: Colors.textMuted,
    marginBottom: 16,
  },
  introText: {
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  section: {
    backgroundColor: Colors.white,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  sectionContent: {
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  footer: {
    padding: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
