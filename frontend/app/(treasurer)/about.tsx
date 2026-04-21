import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function AboutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>About Us</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Logo and App Info */}
        <View style={styles.logoSection}>
          <Image 
            source={require('../../assets/images/icon.png')} 
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.appName}>Clubvel</Text>
          <Text style={styles.tagline}>Smart Stokvel / Social Club / Society Management</Text>
          <Text style={styles.version}>Version 1.0.0</Text>
        </View>

        {/* Mission Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Our Mission</Text>
          <Text style={styles.sectionText}>
            Clubvel is dedicated to empowering South African communities by modernizing
            the traditional stokvel experience. We believe in the power of collective
            savings and aim to make group financial management simple, transparent, and secure.
          </Text>
        </View>

        {/* What We Do Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What We Do</Text>
          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <View style={styles.featureIcon}>
                <Ionicons name="people" size={24} color={Colors.mediumGreen} />
              </View>
              <View style={styles.featureContent}>
                <Text style={styles.featureTitle}>Club Management</Text>
                <Text style={styles.featureDesc}>Easily manage your stokvel groups, members, and contributions all in one place.</Text>
              </View>
            </View>
            
            <View style={styles.featureItem}>
              <View style={styles.featureIcon}>
                <Ionicons name="cash" size={24} color={Colors.mediumGreen} />
              </View>
              <View style={styles.featureContent}>
                <Text style={styles.featureTitle}>Payment Tracking</Text>
                <Text style={styles.featureDesc}>Track contributions with proof of payment uploads and real-time status updates.</Text>
              </View>
            </View>
            
            <View style={styles.featureItem}>
              <View style={styles.featureIcon}>
                <Ionicons name="trophy" size={24} color={Colors.gold} />
              </View>
              <View style={styles.featureContent}>
                <Text style={styles.featureTitle}>Claims Rotation</Text>
                <Text style={styles.featureDesc}>Fair and transparent rotation system for payouts to all members.</Text>
              </View>
            </View>
            
            <View style={styles.featureItem}>
              <View style={styles.featureIcon}>
                <Ionicons name="shield-checkmark" size={24} color={Colors.mediumGreen} />
              </View>
              <View style={styles.featureContent}>
                <Text style={styles.featureTitle}>Trust & Security</Text>
                <Text style={styles.featureDesc}>Build trust with member profiles, contribution history, and secure data storage.</Text>
              </View>
            </View>
          </View>
        </View>

        {/* South African Pride Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Proudly South African</Text>
          <Text style={styles.sectionText}>
            Built in South Africa, for South Africans. Clubvel understands the unique
            financial traditions and needs of our communities. We're committed to
            preserving the spirit of ubuntu while bringing stokvels into the digital age.
          </Text>
        </View>

        {/* Contact Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Get In Touch</Text>
          <TouchableOpacity 
            style={styles.contactItem}
            onPress={() => Linking.openURL('mailto:support@clubvel.co.za')}
          >
            <Ionicons name="mail-outline" size={20} color={Colors.mediumGreen} />
            <Text style={styles.contactText}>support@clubvel.co.za</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.contactItem}
            onPress={() => Linking.openURL('https://www.clubvel.co.za')}
          >
            <Ionicons name="globe-outline" size={20} color={Colors.mediumGreen} />
            <Text style={styles.contactText}>www.clubvel.co.za</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            © 2025 Clubvel. All rights reserved.
          </Text>
          <Text style={styles.footerText}>
            Made with ❤️ in South Africa
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
  logoSection: {
    alignItems: 'center',
    paddingVertical: 32,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 16,
  },
  appName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.darkGreen,
    marginTop: 16,
  },
  tagline: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  version: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 8,
  },
  section: {
    backgroundColor: Colors.white,
    padding: 20,
    marginTop: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.cardBorder,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  sectionText: {
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 24,
  },
  featureList: {
    gap: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.lightBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureContent: {
    flex: 1,
    marginLeft: 12,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  featureDesc: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  contactText: {
    fontSize: 15,
    color: Colors.mediumGreen,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  footerText: {
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 4,
  },
});
