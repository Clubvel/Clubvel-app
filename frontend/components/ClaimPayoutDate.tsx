import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import axios from 'axios';
import { Colors } from '../constants/Colors';

type Props = {
  groupId: string;
  claimId: string;
  status: string;
  scheduledDate: string | null;
  token: string | null;
  onSaved: () => Promise<void>;
};

export function payoutDateLabel(value: string | null): string {
  if (!value) return 'To be scheduled';
  const input = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return 'To be scheduled';
  const parts = input.split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return Number.isNaN(date.getTime()) || date.getFullYear() !== parts[0] || date.getMonth() !== parts[1] - 1 || date.getDate() !== parts[2]
    ? 'To be scheduled' : date.toLocaleDateString();
}

export function ClaimPayoutDate({ groupId, claimId, status, scheduledDate, token, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  if (status !== 'approved') return null;

  const close = () => { if (!inFlight.current) setOpen(false); };
  const save = async () => {
    if (!token || inFlight.current) return;
    const input = value.trim();
    const parsed = new Date(`${input}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== input) {
      Alert.alert('Invalid date', 'Enter a valid payout date as YYYY-MM-DD.');
      return;
    }
    inFlight.current = true;
    setSaving(true);
    try {
      await axios.post(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/treasurer/groups/${groupId}/claims/${claimId}/payout-date`,
        { scheduled_claim_date: input }, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
      setOpen(false);
      await onSaved();
    } catch (error: any) {
      Alert.alert('Unable to set payout date', typeof error.response?.data?.detail === 'string'
        ? error.response.data.detail : 'Please refresh and try again.');
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <View style={styles.section}>
      <Text style={styles.date}>Payout date: {payoutDateLabel(scheduledDate)}</Text>
      <TouchableOpacity accessibilityRole="button" disabled={!token || saving} style={styles.edit} onPress={() => {
        setValue(scheduledDate?.slice(0, 10) || ''); setOpen(true);
      }}>
        <Text style={styles.editText}>{scheduledDate ? 'Change payout date' : 'Set payout date'}</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.card}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.title}>Set payout date</Text>
              <Text style={styles.date}>Scheduling does not mark this claim as paid.</Text>
              <Text style={styles.label}>Payout date (YYYY-MM-DD)</Text>
              <TextInput accessibilityLabel="Payout date (YYYY-MM-DD)" style={styles.input} value={value} onChangeText={setValue}
                placeholder="YYYY-MM-DD" maxLength={10} autoCapitalize="none" autoCorrect={false} editable={!saving} />
              <View style={styles.actions}>
                <TouchableOpacity style={styles.button} disabled={saving} onPress={close}><Text>Cancel</Text></TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" style={[styles.button, styles.save]} disabled={saving} onPress={() => void save()}>
                  {saving ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.saveText}>Save payout date</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 10 },
  date: { color: Colors.textSecondary, fontSize: 13 },
  edit: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
  editText: { color: Colors.textPrimary, fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: Colors.white, borderRadius: 16, padding: 20, maxHeight: '85%' },
  title: { fontSize: 20, color: Colors.textPrimary, fontWeight: '700', marginBottom: 8 },
  label: { color: Colors.textPrimary, marginTop: 16, marginBottom: 8 },
  input: { color: Colors.textPrimary, borderColor: Colors.cardBorder, borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 48 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  button: { flex: 1, minHeight: 48, padding: 12, borderRadius: 10, borderColor: Colors.cardBorder, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  save: { backgroundColor: Colors.primary },
  saveText: { color: Colors.white, fontWeight: '600' },
});
