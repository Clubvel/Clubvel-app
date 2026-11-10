import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, StatusBar, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function ClubvelSpotlight() {
  const [showPreview, setShowPreview] = useState(false);
  const [showEarnDetails, setShowEarnDetails] = useState(false);
  return (
    <>
      <View style={styles.card} accessibilityLabel="Clubvel Spotlight video advertising preview">
        <View style={styles.topRow}>
          <Text style={styles.sectionTitle}>CLUBVEL SPOTLIGHT</Text>
          <Text style={styles.preview}>PREVIEW</Text>
        </View>
        <TouchableOpacity style={styles.feature} onPress={() => setShowPreview(true)} accessibilityRole="button" accessibilityLabel="Preview sponsored video">
          <View style={styles.playCircle}><Ionicons name="play" size={20} color="#FFFFFF" /></View>
          <Text style={styles.featureTitle}>Stories, offers and{ '\n' }opportunities</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.earnRow} onPress={() => setShowEarnDetails(value => !value)} accessibilityRole="button" accessibilityLabel="Learn about airtime and data rewards">
          <Text style={styles.earnTitle}>Watch &amp; Earn</Text>
          <Text style={styles.comingSoon}>COMING SOON</Text>
        </TouchableOpacity>
        {showEarnDetails && <Text style={styles.details}>Watch eligible sponsored videos to earn airtime or mobile data when rewards become available. Advertising and reward fulfilment are not connected yet.</Text>}
      </View>
      <Modal visible={showPreview} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setShowPreview(false)}>
        <StatusBar barStyle="light-content" backgroundColor="#10151D" />
        <View style={styles.fullScreen}>
          <View style={styles.modalTopBar}>
            <TouchableOpacity onPress={() => setShowPreview(false)} accessibilityRole="button" accessibilityLabel="Close sponsored video preview" style={styles.closeButton}><Ionicons name="close" size={28} color="#FFFFFF" /></TouchableOpacity>
            <Text style={styles.adIndicator}>ADVERTISEMENT · PREVIEW</Text><View style={styles.closeButton} />
          </View>
          <View style={styles.creative}>
            <View style={styles.brandMark}><Ionicons name="leaf" size={27} color="#FFFFFF" /></View>
            <Text style={styles.brandName}>YOUR BRAND HERE</Text>
            <Text style={styles.creativeEyebrow}>A SPONSORED MESSAGE</Text>
            <Text style={styles.creativeHeadline}>Small steps today.{ '\n' }More possibilities tomorrow.</Text>
            <Text style={styles.creativeBody}>Discover products and services designed to support your goals.</Text>
            <View style={styles.mockVideo}><Ionicons name="play-circle-outline" size={58} color="#FFFFFF" /><Text style={styles.mockVideoText}>VIDEO CREATIVE PLACEHOLDER</Text><Text style={styles.mockVideoSubtext}>Real advertiser video will appear here</Text></View>
            <Text style={styles.sponsorFootnote}>Sample creative only. No advertiser is connected.</Text>
          </View>
          <View style={styles.bottomPanel}>
            <Text style={styles.bottomTitle}>Discover something useful</Text>
            <Text style={styles.bottomDescription}>Sponsored offers may open an advertiser's page when live campaigns are connected.</Text>
            <TouchableOpacity style={styles.ctaButton} onPress={() => Alert.alert('Preview only', 'Advertiser links are not connected yet.')} accessibilityRole="button"><Text style={styles.ctaText}>LEARN MORE</Text><Ionicons name="arrow-forward" size={19} color="#FFFFFF" /></TouchableOpacity>
            <TouchableOpacity style={styles.closePreviewButton} onPress={() => setShowPreview(false)} accessibilityRole="button"><Text style={styles.closePreviewText}>Close preview</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}
const styles = StyleSheet.create({
  card: { margin: 0, paddingHorizontal: 20, paddingTop: 17, paddingBottom: 15, backgroundColor: '#586A55' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 },
  sectionTitle: { color: '#E6E9DF', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  preview: { color: '#E6E9DF', fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 13, minHeight: 62 },
  playCircle: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', alignItems: 'center', justifyContent: 'center' },
  featureTitle: { color: '#FFFFFF', fontSize: 16, lineHeight: 21, fontWeight: '500', flex: 1 },
  earnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 13, paddingTop: 11, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.18)' },
  earnTitle: { color: '#FFFFFF', fontSize: 11, fontWeight: '500' },
  comingSoon: { color: '#E6E9DF', fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  details: { color: '#FFFFFF', fontSize: 11, lineHeight: 16, marginTop: 10 },
  fullScreen: { flex: 1, backgroundColor: '#10151D' },
  modalTopBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12 },
  closeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  adIndicator: { color: '#D9E2F0', fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  creative: { flex: 1, marginHorizontal: 16, marginBottom: 12, borderRadius: 20, padding: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#073B53' },
  brandMark: { width: 56, height: 56, borderRadius: 18, backgroundColor: '#F58220', alignItems: 'center', justifyContent: 'center' },
  brandName: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginTop: 10 },
  creativeEyebrow: { color: '#FFD0A3', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginTop: 30, textAlign: 'center' },
  creativeHeadline: { color: '#FFFFFF', fontSize: 29, lineHeight: 36, fontWeight: '800', textAlign: 'center', marginTop: 12 },
  creativeBody: { color: '#E0EAF0', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 12 },
  mockVideo: { alignSelf: 'stretch', minHeight: 150, marginTop: 26, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.22)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center', padding: 14 },
  mockVideoText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginTop: 8, textAlign: 'center' },
  mockVideoSubtext: { color: '#D9E2F0', fontSize: 11, marginTop: 5 },
  sponsorFootnote: { color: '#D9E2F0', fontSize: 10, marginTop: 20 },
  bottomPanel: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14 },
  bottomTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  bottomDescription: { color: '#B9C3D1', fontSize: 12, lineHeight: 17, marginTop: 5 },
  ctaButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: 12, marginTop: 14, backgroundColor: '#F58220' },
  ctaText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  closePreviewButton: { alignItems: 'center', padding: 12, marginTop: 2 },
  closePreviewText: { color: '#D9E2F0', fontSize: 12, fontWeight: '600' },
});
