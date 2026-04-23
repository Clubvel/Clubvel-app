import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import axios from 'axios';

interface TrustScoreData {
  id: string;
  user_id: string;
  overall_score: number;
  payment_consistency_score: number;
  months_active_score: number;
  groups_joined_score: number;
  disputes_score: number;
  last_calculated: string;
}

export default function TrustScoreScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [trustScore, setTrustScore] = useState<TrustScoreData | null>(null);
  const [loading, setLoading] = useState(true);

  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

  useEffect(() => {
    fetchTrustScore();
  }, []);

  const fetchTrustScore = async () => {
    try {
      // In a real implementation, this would be an API endpoint
      // For now, using mock data based on user
      const mockScore: TrustScoreData = {
        id: '1',
        user_id: user?.id || '',
        overall_score: 87,
        payment_consistency_score: 92,
        months_active_score: 85,
        groups_joined_score: 80,
        disputes_score: 100,
        last_calculated: new Date().toISOString(),
      };
      setTrustScore(mockScore);
    } catch (error) {
      console.error('Error fetching trust score:', error);
    } finally {
      setLoading(false);
    }
  };

  const getScoreLabel = (score: number) => {
    if (score >= 90) return 'Excellent';
    if (score >= 75) return 'Good';
    if (score >= 60) return 'Fair';
    return 'Needs Attention';
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return Colors.statusPaid;
    if (score >= 75) return Colors.mediumGreen;
    if (score >= 60) return Colors.gold;
    return Colors.statusLate;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.mediumGreen} />
      </View>
    );
  }

  if (!trustScore) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Unable to load trust score</Text>
      </View>
    );
  }

  const scoreColor = getScoreColor(trustScore.overall_score);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('/(member)/profile')} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trust Score</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content}>
        {/* Overall Score Circle */}
        <View style={styles.scoreSection}>
          <View style={[styles.scoreCircle, { borderColor: scoreColor }]}>
            <Text style={[styles.scoreNumber, { color: scoreColor }]}>{trustScore.overall_score}</Text>
            <Text style={styles.scoreMax}>/ 100</Text>
          </View>
          <Text style={[styles.scoreLabel, { color: scoreColor }]}>{getScoreLabel(trustScore.overall_score)}</Text>
          <Text style={styles.scoreDescription}>
            Your trust score reflects your financial reliability in stokvel groups
          </Text>
        </View>

        {/* Score Breakdown */}
        <View style={styles.breakdownSection}>
          <Text style={styles.sectionTitle}>Score Breakdown</Text>

          {/* Payment Consistency */}
          <View style={styles.breakdownItem}>
            <View style={styles.breakdownHeader}>
              <View style={styles.breakdownTitleRow}>
                <Ionicons name="checkmark-done" size={20} color={Colors.mediumGreen} />
                <Text style={styles.breakdownTitle}>Payment Consistency</Text>
              </View>
              <Text style={styles.breakdownScore}>{trustScore.payment_consistency_score}%</Text>
            </View>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${trustScore.payment_consistency_score}%`,
                    backgroundColor: getScoreColor(trustScore.payment_consistency_score),
                  },
                ]}
              />
            </View>
            <Text style={styles.breakdownDescription}>
              How regularly you make payments on time
            </Text>
          </View>

          {/* Months Active */}
          <View style={styles.breakdownItem}>
            <View style={styles.breakdownHeader}>
              <View style={styles.breakdownTitleRow}>
                <Ionicons name="calendar" size={20} color={Colors.mediumGreen} />
                <Text style={styles.breakdownTitle}>Months Active</Text>
              </View>
              <Text style={styles.breakdownScore}>{trustScore.months_active_score}%</Text>
            </View>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${trustScore.months_active_score}%`,
                    backgroundColor: getScoreColor(trustScore.months_active_score),
                  },
                ]}
              />
            </View>
            <Text style={styles.breakdownDescription}>
              Length of your active participation in stokvels
            </Text>
          </View>

          {/* Groups Joined */}
          <View style={styles.breakdownItem}>
            <View style={styles.breakdownHeader}>
              <View style={styles.breakdownTitleRow}>
                <Ionicons name="people" size={20} color={Colors.mediumGreen} />
                <Text style={styles.breakdownTitle}>Groups Joined</Text>
              </View>
              <Text style={styles.breakdownScore}>{trustScore.groups_joined_score}%</Text>
            </View>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${trustScore.groups_joined_score}%`,
                    backgroundColor: getScoreColor(trustScore.groups_joined_score),
                  },
                ]}
              />
            </View>
            <Text style={styles.breakdownDescription}>
              Number of active stokvel memberships
            </Text>
          </View>

          {/* Zero Disputes */}
          <View style={styles.breakdownItem}>
            <View style={styles.breakdownHeader}>
              <View style={styles.breakdownTitleRow}>
                <Ionicons name="shield-checkmark" size={20} color={Colors.statusPaid} />
                <Text style={styles.breakdownTitle}>Zero Disputes</Text>
              </View>
              <Text style={styles.breakdownScore}>{trustScore.disputes_score}%</Text>
            </View>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${trustScore.disputes_score}%`,
                    backgroundColor: getScoreColor(trustScore.disputes_score),
                  },
                ]}
              />
            </View>
            <Text style={styles.breakdownDescription}>
              No payment disputes or issues reported
            </Text>
          </View>
        </View>

        {/* What This Means */}
        <View style={styles.meaningSection}>
          <Text style={styles.sectionTitle}>What This Means</Text>
          <View style={styles.meaningCard}>
            <Ionicons name="information-circle" size={24} color={Colors.mediumGreen} />
            <Text style={styles.meaningText}>
              Your Clubvel Trust Score is a measure of your financial reliability. Banks, insurers, and lenders 
              can use this score to assess your creditworthiness. A higher score opens doors to better financial 
              products and lower interest rates.
            </Text>
          </View>
        </View>

        {/* How to Improve */}
        <View style={styles.improvementSection}>
          <Text style={styles.sectionTitle}>How to Improve Your Score</Text>
          <View style={styles.tipCard}>
            <Ionicons name="time" size={20} color={Colors.gold} />
            <Text style={styles.tipText}>Pay on or before your due date every month</Text>
          </View>
          <View style={styles.tipCard}>
            <Ionicons name="trending-up" size={20} color={Colors.gold} />
            <Text style={styles.tipText}>Stay active in your groups for longer periods</Text>
          </View>
          <View style={styles.tipCard}>
            <Ionicons name="people" size={20} color={Colors.gold} />
            <Text style={styles.tipText}>Join additional trusted stokvel groups</Text>
          </View>
          <View style={styles.tipCard}>
            <Ionicons name="shield" size={20} color={Colors.gold} />
            <Text style={styles.tipText}>Maintain zero disputes with treasurers</Text>
          </View>
        </View>

        {/* Ad Placement */}
        <View style={styles.adContainer}>
          <Text style={styles.adLabel}>Sponsored</Text>
          <View style={styles.adCard}>
            <Text style={styles.adTitle}>Your {trustScore.overall_score} score qualifies you!</Text>
            <Text style={styles.adBody}>
              Pre-approved for R50,000 personal loan at 15% interest. No paperwork required with your Clubvel Trust Score.
            </Text>
            <TouchableOpacity style={styles.adButton}>
              <Text style={styles.adButtonText}>Apply Now</Text>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.lightBackground,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.lightBackground,
  },
  errorText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  header: {
    backgroundColor: Colors.darkGreen,
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 40,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.white,
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  scoreSection: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  scoreCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.white,
    marginBottom: 16,
  },
  scoreNumber: {
    fontSize: 64,
    fontWeight: 'bold',
  },
  scoreMax: {
    fontSize: 20,
    color: Colors.textSecondary,
  },
  scoreLabel: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  scoreDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  breakdownSection: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  breakdownItem: {
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 12,
  },
  breakdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  breakdownTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  breakdownTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  breakdownScore: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  progressBar: {
    height: 8,
    backgroundColor: Colors.lightBackground,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  breakdownDescription: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  meaningSection: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  meaningCard: {
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    flexDirection: 'row',
    gap: 12,
  },
  meaningText: {
    flex: 1,
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  improvementSection: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  tipCard: {
    backgroundColor: Colors.white,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  adContainer: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
  },
  adLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  adCard: {
    backgroundColor: Colors.lightGold,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gold,
  },
  adTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  adBody: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  adButton: {
    backgroundColor: Colors.gold,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  adButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
