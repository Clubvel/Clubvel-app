import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Colors } from '../constants/Colors';

export default function ContactVisibilityPreference() {
  const { user, token } = useAuth();
  const url = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/user/contact-visibility/${encodeURIComponent(user?.id || '')}`;
  const context = JSON.stringify([user?.id, token, url]);
  const revision = useRef({ context, value: 0 });
  if (revision.current.context !== context) revision.current = { context, value: revision.current.value + 1 };
  const key = JSON.stringify([context, revision.current.value]);
  const latest = useRef(key); latest.current = key;
  const sequence = useRef(0), pending = useRef<{ key: string; ticket: number } | null>(null);
  const [stored, setStored] = useState<{ owner: string; phase: 'ready' | 'saving' | 'error'; value: boolean } | null>(null);
  const state = stored?.owner === key ? stored : null;
  const request = useCallback(async (value?: boolean) => {
    if (!user?.id || !token || latest.current !== key || pending.current?.key === key) return;
    const ticket = ++sequence.current; pending.current = { key, ticket };
    if (value !== undefined) setStored({ owner: key, phase: 'saving', value });
    try {
      const options = { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 };
      const response = value === undefined ? await axios.get(url, options) : await axios.put(url, { share_mobile_with_clubs: value }, options);
      if (latest.current !== key || sequence.current !== ticket) return;
      const shared = response.data?.share_mobile_with_clubs;
      if (typeof shared !== 'boolean' || (value !== undefined && shared !== value)) throw new Error('Invalid sharing preference');
      setStored({ owner: key, phase: 'ready', value: shared });
    } catch {
      if (latest.current === key && sequence.current === ticket) setStored({ owner: key, phase: 'error', value: false });
    } finally { if (pending.current?.ticket === ticket) pending.current = null; }
  }, [key, user?.id, token, url]);
  useFocusEffect(useCallback(() => { void request(); return () => { ++sequence.current; pending.current = null; }; }, [request]));
  if (!user?.id || !token) return null;
  return <View style={styles.card}>
    <Text style={styles.title}>Contact privacy</Text>
    <Text style={styles.description}>Share my mobile number with members of my clubs</Text>
    <Text style={styles.note}>Off by default. When enabled, active members of your clubs can see your registered number and open WhatsApp or SMS. You can turn sharing off at any time.</Text>
    {!state && <ActivityIndicator accessibilityLabel="Loading contact visibility" color={Colors.royalBlue} />}
    {state?.phase === 'error' ? <View><Text accessibilityRole="alert" style={styles.note}>Sharing preference unavailable. Refresh before changing it.</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Retry contact visibility" style={styles.retry} onPress={() => void request()}><Text style={styles.link}>Retry</Text></TouchableOpacity></View> :
      <Switch accessibilityLabel="Share my mobile number with members of my clubs" value={state?.value === true} disabled={state?.phase !== 'ready'} onValueChange={value => { if (state?.phase === 'ready') void request(value); }} trackColor={{ false: Colors.cardBorder, true: Colors.royalBlue }} />}
  </View>;
}

const styles = StyleSheet.create({
  card: { margin: 16, padding: 16, borderRadius: 16, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.cardBorder },
  title: { color: Colors.primary, fontSize: 18, fontWeight: '400' }, description: { color: Colors.textPrimary, fontSize: 15, lineHeight: 22, marginTop: 8 },
  note: { color: Colors.textSecondary, fontSize: 13, lineHeight: 19, marginVertical: 8 }, retry: { minHeight: 44, justifyContent: 'center' }, link: { color: Colors.royalBlue },
});
