import React, { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { Colors } from '../constants/Colors';

// The existing account model has one full_name field; preserve all surname parts.
export function splitProfileName(name: string) {
  const [firstName = '', ...surname] = name.trim().split(/\s+/);
  return { firstName, surname: surname.join(' ') };
}

export default function EditProfile() {
  const { user, updateProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const open = () => {
    const parts = splitProfileName(user?.full_name || '');
    setFirstName(parts.firstName); setSurname(parts.surname); setError(null); setVisible(true);
  };
  const close = () => { if (!pending.current) setVisible(false); };
  const save = async () => {
    if (pending.current) return;
    const first = firstName.trim(), last = surname.trim();
    const name = `${first} ${last}`.replace(/\s+/g, ' ');
    if (!first || !last || name.length > 100 || !/\p{L}/u.test(first) || !/\p{L}/u.test(last) || !/^[\p{L}\p{M} .'‘’-]+$/u.test(name)) {
      setError('Enter your first name and surname (100 characters maximum).'); return;
    }
    pending.current = true; setSaving(true); setError(null);
    try {
      await updateProfile(name);
      setVisible(false); Alert.alert('Profile updated', 'Your name has been updated.');
    } catch (failure: any) {
      setError(failure.message || 'Could not save your profile. Please try again.');
    } finally { pending.current = false; setSaving(false); }
  };
  return (
    <>
      <TouchableOpacity onPress={open} accessibilityRole="button" style={styles.edit}>
        <Text style={styles.editText}>Edit Profile</Text>
      </TouchableOpacity>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.overlay}>
          <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.title}>Edit Profile</Text>
              <Text style={styles.label}>First name</Text>
              <TextInput accessibilityLabel="First name" value={firstName} onChangeText={setFirstName} editable={!saving} maxLength={100} autoCapitalize="words" style={styles.input} />
              <Text style={styles.label}>Surname</Text>
              <TextInput accessibilityLabel="Surname" value={surname} onChangeText={setSurname} editable={!saving} maxLength={100} autoCapitalize="words" style={styles.input} />
              <Text style={styles.note}>Your verified phone number and account permissions remain unchanged.</Text>
              {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
              <View style={styles.actions}>
                <TouchableOpacity onPress={close} disabled={saving} accessibilityRole="button" style={styles.action}><Text>Cancel</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => void save()} disabled={saving} accessibilityRole="button" style={styles.action}><Text>{saving ? 'Saving…' : 'Save'}</Text></TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  edit: { paddingHorizontal: 16, paddingVertical: 12 },
  editText: { color: Colors.white, fontSize: 16, fontWeight: '600' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  panel: { backgroundColor: Colors.white, padding: 24, maxHeight: '85%', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  title: { fontSize: 24, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 16 },
  label: { color: Colors.textPrimary, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: 8, padding: 12, color: Colors.textPrimary, marginBottom: 16 },
  note: { color: Colors.textSecondary, fontSize: 13 },
  error: { color: Colors.statusLate, marginTop: 12 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16, marginTop: 16 },
  action: { minHeight: 48, padding: 12, justifyContent: 'center' },
});
