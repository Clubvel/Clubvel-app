import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { Colors } from '../constants/Colors';

export function WorkspaceControls() {
  const { selectedClub, clubs, membershipError, personalHome, selectGroup, refreshMemberships } = useWorkspace();
  const [switching, setSwitching] = useState(false);
  const [loading, setLoading] = useState(false);
  const open = () => {
    setSwitching(true); setLoading(true);
    void refreshMemberships().catch(() => {}).finally(() => setLoading(false));
  };
  return <>
    <View style={styles.bar}>
      <TouchableOpacity accessibilityRole="button" onPress={() => void personalHome()} style={styles.action}><Text style={styles.link}>Personal Home</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" onPress={open} style={styles.action}><Text style={styles.link}>{selectedClub ? `${selectedClub.name} · ${selectedClub.role}` : 'Switch group'} ▾</Text></TouchableOpacity>
    </View>
    <Modal visible={switching} transparent animationType="slide" onRequestClose={() => setSwitching(false)}>
      <View style={styles.overlay}><View style={styles.sheet}>
        <View style={styles.bar}><Text style={styles.title}>Switch workspace</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Close workspace list" style={styles.action} onPress={() => setSwitching(false)}><Text style={styles.link}>✕</Text></TouchableOpacity></View>
        <TouchableOpacity accessibilityRole="button" style={styles.action} onPress={() => { setSwitching(false); void personalHome(); }}><Text style={styles.link}>Personal Home</Text></TouchableOpacity>
        {loading ? <ActivityIndicator color={Colors.primary} /> : membershipError ? <TouchableOpacity style={styles.action} onPress={open}><Text>Could not load groups. Tap to retry.</Text></TouchableOpacity> : <ScrollView>
          {(clubs || []).map(club => <TouchableOpacity key={club.id} accessibilityRole="button" style={styles.action} onPress={() => { setSwitching(false); void selectGroup(club.id); }}><Text style={styles.link}>{club.name} — {club.role}</Text></TouchableOpacity>)}
          {clubs?.length === 0 && <Text>No active groups.</Text>}
        </ScrollView>}
      </View></View>
    </Modal>
  </>;
}

export function WorkspaceProgress() {
  const { checking, workspaceError, retryWorkspace, personalHome } = useWorkspace();
  return <Modal visible={checking || !!workspaceError} transparent animationType="fade" onRequestClose={() => void personalHome()}>
    <View style={styles.overlay}><View style={styles.sheet}>
      {checking ? <><ActivityIndicator color={Colors.primary} /><Text style={styles.title}>Checking group membership…</Text></> : <><Text>{workspaceError}</Text><TouchableOpacity style={styles.action} onPress={() => void retryWorkspace()}><Text style={styles.link}>Retry</Text></TouchableOpacity></>}
      <TouchableOpacity style={styles.action} onPress={() => void personalHome()}><Text style={styles.link}>Personal Home</Text></TouchableOpacity>
    </View></View>
  </Modal>;
}
const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.white, flexWrap: 'wrap' },
  action: { paddingHorizontal: 16, paddingVertical: 12, minHeight: 44 },
  link: { color: Colors.textPrimary, fontWeight: '600', fontSize: 14 },
  title: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary, marginVertical: 12 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: Colors.white, borderRadius: 12, padding: 20, maxHeight: '80%' },
});
