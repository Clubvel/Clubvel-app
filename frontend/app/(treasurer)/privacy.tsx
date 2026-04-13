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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function PrivacyPolicyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

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
        <View style={styles.policyContainer}>
          <Text style={styles.mainTitle}>PRIVACY POLICY</Text>
          
          <Text style={styles.introText}>
            This app is operated in compliance with the Protection of Personal Information Act (POPIA), Act 4 of 2013.
          </Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What we collect:</Text>
            <Text style={styles.sectionContent}>
              Your name, contact details (phone/email), and financial contribution records related to your Stokvel group.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Why we collect it:</Text>
            <Text style={styles.sectionContent}>
              To manage your Stokvel group's contributions, claims, and financial records.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Who sees your data:</Text>
            <Text style={styles.sectionContent}>
              Only your Stokvel group administrator and authorised members of your group.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>How we protect it:</Text>
            <Text style={styles.sectionContent}>
              All data is encrypted and stored securely. We do not sell or share your data with third parties.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>How long we keep it:</Text>
            <Text style={styles.sectionContent}>
              For as long as your account is active, or as required by law for financial records.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your rights:</Text>
            <Text style={styles.sectionContent}>
              You have the right to access, correct, or request deletion of your personal information at any time. Use the "Delete My Account" option in Settings or contact us directly.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Data breaches:</Text>
            <Text style={styles.sectionContent}>
              In the event of a data breach, we will notify you and the Information Regulator as required by POPIA.
            </Text>
          </View>

          <View style={styles.contactSection}>
            <Text style={styles.sectionTitle}>Contact:</Text>
            <Text style={styles.contactText}>
              Chief Information Officer — Information Officer
            </Text>
            <Text style={styles.contactEmail}>cio@clubvel.co.za</Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
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
  policyContainer: {
    backgroundColor: Colors.white,
    margin: 16,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  mainTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 24,
  },
  introText: {
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 24,
    marginBottom: 24,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  sectionContent: {
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  contactSection: {
    marginTop: 8,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  contactText: {
    fontSize: 15,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  contactEmail: {
    fontSize: 15,
    color: Colors.mediumGreen,
    fontWeight: '600',
  },
});
