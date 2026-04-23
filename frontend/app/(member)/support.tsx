import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Linking,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../contexts/AuthContext';

export default function SupportScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [feedbackType, setFeedbackType] = useState<'bug' | 'feature' | 'general' | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  // Support contact details - phone numbers to be updated
  const SUPPORT_EMAIL = 'support@clubvel.co.za';
  const SUPPORT_WHATSAPP = ''; // To be updated
  const SUPPORT_PHONE = ''; // To be updated

  const handleWhatsAppSupport = () => {
    if (!SUPPORT_WHATSAPP) {
      Alert.alert('Coming Soon', 'WhatsApp support number will be added soon.');
      return;
    }
    const whatsappUrl = `whatsapp://send?phone=${SUPPORT_WHATSAPP}&text=Hi, I need help with Clubvel app. My phone: ${user?.phone_number || 'N/A'}`;
    Linking.openURL(whatsappUrl).catch(() => {
      Alert.alert('Error', 'WhatsApp is not installed on this device');
    });
  };

  const handleEmailSupport = () => {
    const subject = encodeURIComponent('Clubvel App Support Request');
    const body = encodeURIComponent(`
Hi Clubvel Support,

I need assistance with the following:

[Please describe your issue here]

---
User Details:
Phone: ${user?.phone_number || 'N/A'}
Name: ${user?.full_name || 'N/A'}
App Version: 1.0.0
    `);
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`);
  };

  const handlePhoneSupport = () => {
    if (!SUPPORT_PHONE) {
      Alert.alert('Coming Soon', 'Phone support number will be added soon.');
      return;
    }
    Linking.openURL(`tel:${SUPPORT_PHONE}`);
  };

  const handleSubmitFeedback = async () => {
    if (!feedbackType) {
      Alert.alert('Select Type', 'Please select a feedback type');
      return;
    }
    if (!message.trim()) {
      Alert.alert('Enter Message', 'Please describe your feedback');
      return;
    }

    setSending(true);
    
    // In production, this would send to your backend
    // For now, we'll simulate and open email
    setTimeout(() => {
      setSending(false);
      
      const subject = encodeURIComponent(`Clubvel ${feedbackType === 'bug' ? 'Bug Report' : feedbackType === 'feature' ? 'Feature Request' : 'Feedback'}`);
      const body = encodeURIComponent(`
Type: ${feedbackType}

Message:
${message}

---
User Details:
Phone: ${user?.phone_number || 'N/A'}
Name: ${user?.full_name || 'N/A'}
App Version: 1.0.0
Device: ${Platform.OS} ${Platform.Version}
      `);
      
      Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`);
      
      Alert.alert(
        'Thank You!',
        'Your feedback has been prepared. Please send the email to complete submission.',
        [{ text: 'OK', onPress: () => {
          setMessage('');
          setFeedbackType(null);
        }}]
      );
    }, 1000);
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help & Support</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Quick Contact Options */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact Us</Text>
          
          <TouchableOpacity style={styles.contactCard} onPress={handleWhatsAppSupport}>
            <View style={[styles.contactIcon, { backgroundColor: '#25D366' }]}>
              <Ionicons name="logo-whatsapp" size={28} color={Colors.white} />
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactTitle}>WhatsApp Support</Text>
              <Text style={styles.contactSubtitle}>Chat with us instantly</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.contactCard} onPress={handleEmailSupport}>
            <View style={[styles.contactIcon, { backgroundColor: Colors.gold }]}>
              <Ionicons name="mail" size={28} color={Colors.white} />
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactTitle}>Email Support</Text>
              <Text style={styles.contactSubtitle}>{SUPPORT_EMAIL}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.contactCard} onPress={handlePhoneSupport}>
            <View style={[styles.contactIcon, { backgroundColor: Colors.mediumGreen }]}>
              <Ionicons name="call" size={28} color={Colors.white} />
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactTitle}>Phone Support</Text>
              <Text style={styles.contactSubtitle}>Call us directly</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Feedback Form */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Send Feedback</Text>
          
          <Text style={styles.label}>What type of feedback?</Text>
          <View style={styles.feedbackTypes}>
            <TouchableOpacity
              style={[styles.feedbackTypeButton, feedbackType === 'bug' && styles.feedbackTypeActive]}
              onPress={() => setFeedbackType('bug')}
            >
              <Ionicons 
                name="bug" 
                size={20} 
                color={feedbackType === 'bug' ? Colors.white : Colors.textSecondary} 
              />
              <Text style={[styles.feedbackTypeText, feedbackType === 'bug' && styles.feedbackTypeTextActive]}>
                Bug
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.feedbackTypeButton, feedbackType === 'feature' && styles.feedbackTypeActive]}
              onPress={() => setFeedbackType('feature')}
            >
              <Ionicons 
                name="bulb" 
                size={20} 
                color={feedbackType === 'feature' ? Colors.white : Colors.textSecondary} 
              />
              <Text style={[styles.feedbackTypeText, feedbackType === 'feature' && styles.feedbackTypeTextActive]}>
                Feature
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.feedbackTypeButton, feedbackType === 'general' && styles.feedbackTypeActive]}
              onPress={() => setFeedbackType('general')}
            >
              <Ionicons 
                name="chatbubble" 
                size={20} 
                color={feedbackType === 'general' ? Colors.white : Colors.textSecondary} 
              />
              <Text style={[styles.feedbackTypeText, feedbackType === 'general' && styles.feedbackTypeTextActive]}>
                General
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Your Message</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Describe your feedback, issue, or suggestion..."
            placeholderTextColor={Colors.textMuted}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            value={message}
            onChangeText={setMessage}
          />

          <TouchableOpacity
            style={[styles.submitButton, (!feedbackType || !message.trim()) && styles.submitButtonDisabled]}
            onPress={handleSubmitFeedback}
            disabled={sending || !feedbackType || !message.trim()}
          >
            {sending ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <>
                <Ionicons name="send" size={20} color={Colors.white} />
                <Text style={styles.submitButtonText}>Submit Feedback</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* FAQ Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>

          <View style={styles.faqItem}>
            <Text style={styles.faqQuestion}>How do I upload proof of payment?</Text>
            <Text style={styles.faqAnswer}>
              Go to "Proof of Payments" tab, tap "Upload Proof of Payment", select your club, 
              and choose an image from your gallery.
            </Text>
          </View>

          <View style={styles.faqItem}>
            <Text style={styles.faqQuestion}>How long until my payment is confirmed?</Text>
            <Text style={styles.faqAnswer}>
              Your treasurer will review and confirm your payment within 24-48 hours. 
              You'll receive a notification once confirmed.
            </Text>
          </View>

          <View style={styles.faqItem}>
            <Text style={styles.faqQuestion}>Is my data secure?</Text>
            <Text style={styles.faqAnswer}>
              Yes! We use industry-standard encryption and secure servers to protect your 
              personal and financial information.
            </Text>
          </View>

          <View style={styles.faqItem}>
            <Text style={styles.faqQuestion}>How do I change my password?</Text>
            <Text style={styles.faqAnswer}>
              Go to Profile tab and tap "Change Password". You'll need to verify your 
              phone number with an OTP.
            </Text>
          </View>

          <View style={styles.faqItem}>
            <Text style={styles.faqQuestion}>What happens if I miss a payment?</Text>
            <Text style={styles.faqAnswer}>
              Late payments may affect your trust score. Contact your treasurer 
              if you're having difficulties making a payment on time.
            </Text>
          </View>
        </View>

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appName}>Clubvel</Text>
          <Text style={styles.appVersion}>Version 1.0.0</Text>
          <Text style={styles.appTagline}>Managing stokvels, social clubs & societies made simple</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.lightBackground,
  },
  contactIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactInfo: {
    flex: 1,
    marginLeft: 14,
  },
  contactTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  contactSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 10,
  },
  feedbackTypes: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  feedbackTypeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.lightBackground,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  feedbackTypeActive: {
    backgroundColor: Colors.mediumGreen,
    borderColor: Colors.mediumGreen,
  },
  feedbackTypeText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  feedbackTypeTextActive: {
    color: Colors.white,
  },
  textInput: {
    backgroundColor: Colors.lightBackground,
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    color: Colors.textPrimary,
    minHeight: 120,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  submitButton: {
    backgroundColor: Colors.gold,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 12,
  },
  submitButtonDisabled: {
    backgroundColor: Colors.textMuted,
  },
  submitButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  faqItem: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.lightBackground,
  },
  faqQuestion: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  faqAnswer: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  appInfo: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  appName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: Colors.darkGreen,
  },
  appVersion: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 4,
  },
  appTagline: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 8,
    fontStyle: 'italic',
  },
});
