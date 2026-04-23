import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Platform, Linking, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';

const { width } = Dimensions.get('window');

// APK Download URL - Latest Build from Expo
const APK_DOWNLOAD_URL = 'https://expo.dev/accounts/modjadji/projects/clubvel/builds/c9801fdf-102b-4e59-82eb-901998634a61';

const slides = [
  {
    icon: 'people-outline' as const,
    title: 'All your clubs. One screen.',
    body: 'Manage every stokvel, social club, or society in one place. No more paper books. No more WhatsApp confusion.',
  },
  {
    icon: 'notifications-outline' as const,
    title: 'Never be the one who forgot.',
    body: 'Smart reminders before your due date. Automatic alerts when members go quiet.',
  },
  {
    icon: 'trophy-outline' as const,
    title: 'Build your financial reputation.',
    body: 'Every contribution builds your Clubvel Trust Score — proof of your financial discipline that banks and insurers recognise.',
  },
];

export default function OnboardingScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const router = useRouter();
  const isLastSlide = currentIndex === slides.length - 1;

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleSkip = () => {
    setCurrentIndex(slides.length - 1);
  };

  const handleAndroidDownload = async () => {
    try {
      await Linking.openURL(APK_DOWNLOAD_URL);
    } catch (error) {
      console.error('Failed to open download URL:', error);
    }
  };

  const handleiPhoneStart = () => {
    router.replace('/auth');
  };

  const slide = slides[currentIndex];

  // Render Get Started section on last slide
  if (isLastSlide) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <View style={styles.getStartedContent}>
          {/* Logo */}
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>CV</Text>
          </View>
          
          <Text style={styles.getStartedTitle}>Get Started</Text>
          <Text style={styles.getStartedSubtitle}>
            Join your Stokvel / Social Club / Society today
          </Text>

          {/* Get Started Button - Main CTA */}
          <TouchableOpacity 
            style={styles.androidButton} 
            onPress={handleiPhoneStart}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-forward-circle" size={24} color={Colors.darkGreen} />
            <Text style={styles.androidButtonText}>Get Started</Text>
          </TouchableOpacity>

          {/* Features recap */}
          <View style={styles.featuresBox}>
            <View style={styles.featureRow}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.gold} />
              <Text style={styles.featureText}>Track contributions in real-time</Text>
            </View>
            <View style={styles.featureRow}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.gold} />
              <Text style={styles.featureText}>Upload proof of payment instantly</Text>
            </View>
            <View style={styles.featureRow}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.gold} />
              <Text style={styles.featureText}>Get smart payment reminders</Text>
            </View>
            <View style={styles.featureRow}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.gold} />
              <Text style={styles.featureText}>POPIA compliant & secure</Text>
            </View>
          </View>

          {/* Dots */}
          <View style={styles.dotsContainer}>
            {slides.map((_, index) => (
              <TouchableOpacity
                key={index}
                onPress={() => setCurrentIndex(index)}
                style={[
                  styles.dot,
                  index === currentIndex && styles.activeDot,
                ]}
              />
            ))}
          </View>
        </View>
      </ScrollView>
    );
  }

  // Regular onboarding slides
  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name={slide.icon} size={120} color={Colors.gold} />
        </View>

        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.body}>{slide.body}</Text>

        <View style={styles.dotsContainer}>
          {slides.map((_, index) => (
            <TouchableOpacity
              key={index}
              onPress={() => setCurrentIndex(index)}
              style={[
                styles.dot,
                index === currentIndex && styles.activeDot,
              ]}
            />
          ))}
        </View>
      </View>

      <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
        <Text style={styles.nextButtonText}>Next</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.darkGreen,
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  skipButton: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  skipText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 16,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.white,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  body: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  dotsContainer: {
    flexDirection: 'row',
    marginTop: 32,
    gap: 8,
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  activeDot: {
    backgroundColor: Colors.gold,
    width: 24,
  },
  nextButton: {
    backgroundColor: Colors.gold,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  nextButtonText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  // Get Started section styles
  getStartedContent: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 60,
  },
  logoBox: {
    width: 100,
    height: 100,
    backgroundColor: Colors.gold,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  logoText: {
    fontSize: 42,
    fontWeight: 'bold',
    color: Colors.white,
  },
  getStartedTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: Colors.white,
    marginBottom: 8,
  },
  getStartedSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 32,
    textAlign: 'center',
  },
  androidButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.gold,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    marginBottom: 12,
    gap: 12,
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  androidButtonText: {
    color: Colors.darkGreen,
    fontSize: 18,
    fontWeight: 'bold',
  },
  iphoneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: Colors.white,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    marginBottom: 16,
    gap: 12,
  },
  iphoneButtonText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  helperTextContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    gap: 10,
  },
  helperText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    lineHeight: 20,
  },
  featuresBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  featureText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.85)',
    flex: 1,
  },
});
