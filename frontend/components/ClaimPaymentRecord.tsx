import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import axios from 'axios';
import { Colors } from '../constants/Colors';
import { payoutDateLabel } from './ClaimPayoutDate';

type Props = {
  groupId: string; claimId: string; memberName: string; status: string;
  approvedAmount: number | null; actualAmountPaid: number | null;
  actualPaymentDate?: string | null; scheduledDate: string | null;
  token: string | null; onRecorded: () => Promise<void>;
};
const money = (amount: number) => `R${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ClaimPaymentRecord({ groupId, claimId, memberName, status, approvedAmount, actualAmountPaid, actualPaymentDate, scheduledDate, token, onRecorded }: Props) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const confirming = useRef(false);
  const previous = actualAmountPaid || 0;
  if (status !== 'approved' && status !== 'paid') return null;
  const remaining = Math.max((approvedAmount || 0) - previous, 0);
  const close = () => { if (!inFlight.current && !confirming.current) setOpen(false); };
  const review = () => {
    if (!token || inFlight.current || confirming.current || status !== 'approved') return;
    const value = amount.trim(), total = Number(value), input = date.trim();
    const parsed = new Date(`${input}T00:00:00Z`);
    if (!/^\d+(\.\d{1,2})?$/.test(value) || !Number.isFinite(total) || total <= previous || approvedAmount == null || total > approvedAmount) {
      Alert.alert('Invalid amount', 'Enter the total paid to date, greater than the recorded amount and no more than the approved amount.'); return;
    }
    const today = new Date();
    const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== input || input > localToday) {
      Alert.alert('Invalid payment date', 'Enter the date payment actually occurred as YYYY-MM-DD, today or earlier.'); return;
    }
    confirming.current = true;
    const record = async () => {
      if (inFlight.current) return;
      inFlight.current = true; setSaving(true);
      try {
        await axios.post(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/treasurer/groups/${groupId}/claims/${claimId}/record-payment`,
          { actual_amount_paid: total, expected_actual_amount_paid: previous, actual_payment_date: input },
          { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
        setOpen(false);
        await onRecorded();
      } catch (error: any) {
        Alert.alert('Unable to record payment', typeof error.response?.data?.detail === 'string'
          ? error.response.data.detail : 'Payment may have been recorded. Refresh before retrying; an identical retry will not record it twice.');
      } finally { inFlight.current = false; confirming.current = false; setSaving(false); }
    };
    Alert.alert('Confirm external payout',
      `Member: ${memberName}\nApproved claim: ${money(approvedAmount)}\nTotal paid to date: ${money(total)}\nNew amount recorded: ${money(total - previous)}\nActual payment date: ${input}\n\nThis records an external payout. Clubvel does not move money or verify a bank transaction.`,
      [{ text: 'Cancel', style: 'cancel', onPress: () => { confirming.current = false; } },
        { text: 'Confirm Payment Record', onPress: () => void record() }],
      { cancelable: true, onDismiss: () => { confirming.current = false; } });
  };
  return (
    <View style={styles.section}>
      {previous > 0 ? <>
        <Text style={styles.detail}>Paid: {money(previous)}{status === 'approved' ? ' (partially paid)' : ''}</Text>
        <Text style={styles.detail}>{status === 'paid' ? 'Payment date' : 'Last payment date'}: {actualPaymentDate ? payoutDateLabel(actualPaymentDate) : 'Not recorded'}</Text>
        <Text style={styles.detail}>Remaining: {money(remaining)}</Text>
      </> : null}
      {status === 'paid' && scheduledDate ? <Text style={styles.detail}>Scheduled payout: {payoutDateLabel(scheduledDate)}</Text> : null}
      {status === 'approved' && remaining > 0 ? <>
        <TouchableOpacity accessibilityRole="button" disabled={!token || saving} style={styles.action} onPress={() => {
          if (inFlight.current || confirming.current) return;
          setAmount(String(approvedAmount)); setDate(''); setOpen(true);
        }}><Text style={styles.actionText}>Mark as Paid</Text></TouchableOpacity>
        <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
          <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.card}><ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.title}>Record external payout</Text>
              <Text style={styles.detail}>Approved: {money(approvedAmount || 0)} · Recorded: {money(previous)}</Text>
              <Text style={styles.detail}>Enter the cumulative total, including earlier payments. A partial payment leaves the remaining balance awaiting payout.</Text>
              <Text style={styles.label}>Total paid to date (R)</Text>
              <TextInput accessibilityLabel="Total paid to date (R)" style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={!saving} />
              <Text style={styles.label}>Actual payment date (YYYY-MM-DD)</Text>
              <TextInput accessibilityLabel="Actual payment date (YYYY-MM-DD)" style={styles.input} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" maxLength={10} autoCapitalize="none" autoCorrect={false} editable={!saving} />
              <View style={styles.actions}>
                <TouchableOpacity style={styles.button} disabled={saving} onPress={close}><Text>Cancel</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.button, styles.save]} disabled={saving} onPress={review}>
                  {saving ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.saveText}>Review Payment</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView></View>
          </KeyboardAvoidingView>
        </Modal>
      </> : null}
    </View>
  );
}
const styles = StyleSheet.create({
  section: { marginTop: 10 }, detail: { color: Colors.textSecondary, fontSize: 13, marginBottom: 4 },
  action: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' }, actionText: { color: Colors.textPrimary, fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: Colors.white, borderRadius: 16, padding: 20, maxHeight: '85%' },
  title: { fontSize: 20, color: Colors.textPrimary, fontWeight: '700', marginBottom: 8 },
  label: { color: Colors.textPrimary, marginTop: 16, marginBottom: 8 },
  input: { color: Colors.textPrimary, borderColor: Colors.cardBorder, borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 48 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  button: { flex: 1, minHeight: 48, padding: 12, borderRadius: 10, borderColor: Colors.cardBorder, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  save: { backgroundColor: Colors.primary }, saveText: { color: Colors.white, fontWeight: '600' },
});
