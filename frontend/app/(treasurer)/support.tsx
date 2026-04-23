import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SupportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const supportOptions = [
    {
      icon: 'mail-outline',
      title: 'Email Support',
      description: 'Get help via email',
      action: () => Linking.openURL('mailto:support@clubvel.co.za'),
    },
    {
      icon: 'call-outline',
      title: 'Call Us',
      description: 'Phone support coming soon',
      action: () => {},  // Phone number to be added
    },
    {
      icon: 'logo-whatsapp',
      title: 'WhatsApp',
      description: 'WhatsApp support coming soon',
      action: () => {},  // WhatsApp number to be added
    },
    {
      icon: 'help-circle-outline',
      title: 'FAQs',
      description: 'Find answers to common questions',
      action: () => {},
    },
  ];

  const faqs = [
    {
      question: 'How do I confirm member payments?',
      answer: 'Go to Payments tab, find the pending contribution, and tap "Confirm" to mark it as paid.',
    },
    {
      question: 'How do I add a new member?',
      answer: 'From Members tab, tap the "+" button and fill in the new member details.',
    },
    {
      question: 'How does the claims rotation work?',
      answer: 'Claims are rotated monthly based on the order members joined. You can view the rotation schedule in the Claims tab.',
    },
    {
      question: 'How do I generate reports?',
      answer: 'Go to Reports tab and tap "Export PDF" to generate a detailed contribution report.',
    },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => router.push('/(treasurer)/profile')} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Contact Us</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Support Options */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Get in Touch</Text>
          {supportOptions.map((option, index) => (
            <TouchableOpacity 
              key={index} 
              style={styles.optionCard}
              onPress={option.action}
            >
              <View style={styles.optionIcon}>
                <Ionicons name={option.icon as any} size={24} color={Colors.mediumGreen} />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>{option.title}</Text>
                <Text style={styles.optionDescription}>{option.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>

        {/* FAQs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Admin FAQs</Text>
          {faqs.map((faq, index) => (
            <View key={index} style={styles.faqCard}>
              <Text style={styles.faqQuestion}>{faq.question}</Text>
              <Text style={styles.faqAnswer}>{faq.answer}</Text>
            </View>
          ))}
        </View>

        {/* Support Hours */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support Hours</Text>
          <View style={styles.hoursCard}>
            <View style={styles.hoursRow}>
              <Text style={styles.hoursDay}>Monday - Friday</Text>
              <Text style={styles.hoursTime}>08:00 - 18:00</Text>
            </View>
            <View style={styles.hoursRow}>
              <Text style={styles.hoursDay}>Saturday</Text>
              <Text style={styles.hoursTime}>09:00 - 13:00</Text>
            </View>
            <View style={styles.hoursRow}>
              <Text style={styles.hoursDay}>Sunday & Holidays</Text>
              <Text style={styles.hoursTime}>Closed</Text>
            </View>
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
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.lightBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionContent: {
    flex: 1,
    marginLeft: 16,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  optionDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  faqCard: {
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  faqQuestion: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  faqAnswer: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  hoursCard: {
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  hoursDay: {
    fontSize: 15,
    color: Colors.textPrimary,
  },
  hoursTime: {
    fontSize: 15,
    color: Colors.textSecondary,
  },
});
