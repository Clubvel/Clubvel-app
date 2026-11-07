import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, StatusBar, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';

export default function ClubvelSpotlight() {
  const [showPreview, setShowPreview] = useState(false);
  const [showEarnDetails, setShowEarnDetails] = useState(false);

  return (
    <>
      <View style={styles.card} accessibilityLabel="Clubvel Spotlight video advertising preview">
        <View style={styles.header}>
          <View style={styles.iconWrap}>
            <Ionicons name="play-circle-outline" size={25} color={Colors.white} />
          </View>
          <View style={styles.heading}>
            <Text style={styles.title}>Clubvel Spotlight</Text>
            <Text style={styles.subtitle}>Discover · Save · Grow</Text>
          </View>
          <View style={styles.previewBadge}>
            <Text style={styles.previewBadgeText}>PREVIEW</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.videoPreview}
          onPress={() => setShowPreview(true)}
          accessibilityRole="button"
          accessibilityLabel="Preview full-screen sponsored video"
        >
          <View style={styles.playCircle}>
            <Ionicons name="play" size={27} color={Colors.white} />
          </View>
          <Text style={styles.videoTitle}>Stories, offers and opportunities</Text>
          <Text style={styles.videoDescription}>
            Explore sponsored videos from participating brands.
          </Text>
          <View style={styles.previewButton}>
            <Text style={styles.previewButtonText}>PREVIEW SPONSORED VIDEO</Text>
            <Ionicons name="arrow-forward" size={16} color={Colors.white} />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.earnButton}
          onPress={() => setShowEarnDetails((current) => !current)}
          accessibilityRole="button"
          accessibilityLabel="Learn about airtime and data rewards"
        >
          <Ionicons name="gift-outline" size={21} color={Colors.clementineDark} />
          <View style={styles.earnCopy}>
            <Text style={styles.earnTitle}>Watch & Earn</Text>
            <Text style={styles.earnDescription}>Airtime and mobile data rewards · Coming soon</Text>
          </View>
          <Ionicons name={showEarnDetails ? "chevron-up" : "chevron-down"} size={18} color={Colors.midnightNavy} />
        </TouchableOpacity>
        {showEarnDetails && (
          <View style={styles.earnDetails}>
            <Text style={styles.earnDetailsText}>
              Watch eligible sponsored videos to earn airtime or mobile data when rewards become available. Advertising and reward fulfilment are not connected yet.
            </Text>
          </View>
        )}
      </View>

      <Modal
        visible={showPreview}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowPreview(false)}
      >
        <StatusBar barStyle="light-content" backgroundColor="#10151D" />
        <View style={styles.fullScreen}>
          <View style={styles.modalTopBar}>
            <TouchableOpacity
              onPress={() => setShowPreview(false)}
              accessibilityRole="button"
              accessibilityLabel="Close sponsored video preview"
              style={styles.closeButton}
            >
              <Ionicons name="close" size={28} color={Colors.white} />
            </TouchableOpacity>
            <Text style={styles.adIndicator}>ADVERTISEMENT · PREVIEW</Text>
            <View style={styles.closeButton} />
          </View>

          <View style={styles.creative}>
            <View style={styles.creativeGlow} />
            <View style={styles.brandMark}>
              <Ionicons name="leaf" size={27} color={Colors.white} />
            </View>
            <Text style={styles.brandName}>YOUR BRAND HERE</Text>
            <Text style={styles.creativeEyebrow}>A SPONSORED MESSAGE</Text>
            <Text style={styles.creativeHeadline}>Small steps today.{ '\n' }More possibilities tomorrow.</Text>
            <Text style={styles.creativeBody}>
              Discover products and services designed to support your goals.
            </Text>
            <View style={styles.mockVideo}>
              <Ionicons name="play-circle-outline" size={58} color={Colors.white} />
              <Text style={styles.mockVideoText}>VIDEO CREATIVE PLACEHOLDER</Text>
              <Text style={styles.mockVideoSubtext}>Real advertiser video will appear here</Text>
            </View>
            <View style={styles.sponsorFootnote}>
              <Ionicons name="information-circle-outline" size={15} color="#D9E2F0" />
              <Text style={styles.sponsorFootnoteText}>
                Sample creative only. No advertiser is connected.
              </Text>
            </View>
          </View>

          <View style={styles.bottomPanel}>
            <Text style={styles.bottomTitle}>Discover something useful</Text>
            <Text style={styles.bottomDescription}>
              Sponsored offers may open an advertiser's page when live campaigns are connected.
            </Text>
            <TouchableOpacity
              style={styles.ctaButton}
              onPress={() => Alert.alert(
                'Preview only',
                'Advertiser links are not connected yet.'
              )}
              accessibilityRole="button"
            >
              <Text style={styles.ctaText}>LEARN MORE</Text>
              <Ionicons name="arrow-forward" size={19} color={Colors.white} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.closePreviewButton}
              onPress={() => setShowPreview(false)}
              accessibilityRole="button"
            >
              <Text style={styles.closePreviewText}>Close preview</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    padding: 12,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 16,
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  iconWrap: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: Colors.midnightNavy,
    alignItems: 'center', justifyContent: 'center',
  },
  heading: { marginLeft: 10, flex: 1 },
  title: { color: Colors.midnightNavy, fontSize: 16, fontWeight: '700' },
  subtitle: { color: Colors.textSecondary, fontSize: 12, marginTop: 3 },
  previewBadge: {
    backgroundColor: Colors.clementineLight,
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 5,
  },
  previewBadgeText: {
    color: Colors.clementineDark, fontSize: 9, fontWeight: '800', letterSpacing: 0.5,
  },
  videoPreview: {
    alignItems: 'center', paddingHorizontal: 14, paddingVertical: 18,
    borderRadius: 12, backgroundColor: Colors.midnightNavy,
  },
  playCircle: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: Colors.clementine,
    alignItems: 'center', justifyContent: 'center',
  },
  videoTitle: {
    color: Colors.white, fontSize: 15, fontWeight: '700',
    marginTop: 10, textAlign: 'center',
  },
  videoDescription: {
    color: '#D9E2F0', fontSize: 12, lineHeight: 17,
    textAlign: 'center', marginTop: 5,
  },
  previewButton: {
    alignSelf: 'stretch', marginTop: 14, minHeight: 40,
    paddingHorizontal: 12, borderRadius: 9,
    backgroundColor: Colors.clementine,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  previewButtonText: { color: Colors.white, fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  earnButton: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 10, paddingHorizontal: 10, paddingVertical: 9,
    backgroundColor: Colors.white, borderWidth: 1,
    borderColor: Colors.clementine, borderRadius: 10,
  },
  earnCopy: { flex: 1, marginHorizontal: 10 },
  earnDetails: {
    marginTop: 6, paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: Colors.white, borderWidth: 1,
    borderColor: Colors.clementine, borderRadius: 10,
  },
  earnDetailsText: {
    color: Colors.midnightNavy, fontSize: 12, lineHeight: 18,
  },
  earnTitle: { color: Colors.midnightNavy, fontSize: 13, fontWeight: '700' },
  earnDescription: { color: Colors.textSecondary, fontSize: 11, marginTop: 3 },
  fullScreen: { flex: 1, backgroundColor: '#10151D' },
  modalTopBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12,
  },
  closeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  adIndicator: { color: '#D9E2F0', fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  creative: {
    flex: 1, marginHorizontal: 16, marginBottom: 12, borderRadius: 20,
    padding: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#073B53',
  },
  creativeGlow: {
    position: 'absolute', top: -80, right: -90,
    width: 260, height: 260, borderRadius: 130, backgroundColor: '#087F75',
  },
  brandMark: {
    width: 56, height: 56, borderRadius: 18,
    backgroundColor: Colors.clementine, alignItems: 'center', justifyContent: 'center',
  },
  brandName: { color: Colors.white, fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginTop: 10 },
  creativeEyebrow: {
    color: '#FFD0A3', fontSize: 10, fontWeight: '800',
    letterSpacing: 1.5, marginTop: 30, textAlign: 'center',
  },
  creativeHeadline: {
    color: Colors.white, fontSize: 29, lineHeight: 36,
    fontWeight: '800', textAlign: 'center', marginTop: 12,
  },
  creativeBody: {
    color: '#E0EAF0', fontSize: 14, lineHeight: 21,
    textAlign: 'center', marginTop: 12,
  },
  mockVideo: {
    alignSelf: 'stretch', minHeight: 150, marginTop: 26,
    borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center', padding: 14,
  },
  mockVideoText: {
    color: Colors.white, fontSize: 10, fontWeight: '800',
    letterSpacing: 1, marginTop: 8, textAlign: 'center',
  },
  mockVideoSubtext: { color: '#D9E2F0', fontSize: 11, marginTop: 5, textAlign: 'center' },
  sponsorFootnote: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 20, paddingHorizontal: 6,
  },
  sponsorFootnoteText: { color: '#D9E2F0', fontSize: 10, flexShrink: 1 },
  bottomPanel: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14 },
  bottomTitle: { color: Colors.white, fontSize: 17, fontWeight: '700' },
  bottomDescription: { color: '#B9C3D1', fontSize: 12, lineHeight: 17, marginTop: 5 },
  ctaButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    minHeight: 48, borderRadius: 12, marginTop: 14,
    backgroundColor: Colors.clementine,
  },
  ctaText: { color: Colors.white, fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  closePreviewButton: { alignItems: 'center', padding: 12, marginTop: 2 },
  closePreviewText: { color: '#D9E2F0', fontSize: 12, fontWeight: '600' },
});
