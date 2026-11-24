import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Image, ActivityIndicator, KeyboardAvoidingView,
  Platform, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../../contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

interface ChatMessage {
  id: string;
  sender_user_id: string;
  sender_name: string;
  sender_profile_photo?: string | null;
  text: string;
  created_at: string;
}

interface ClubMember {
  id: string;
  name: string;
  profile_photo?: string | null;
  role?: string;
}

export default function GroupChatScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { user, token } = useAuth();
  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

  const [club, setClub] = useState<{ name: string; photo?: string | null } | null>(null);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMembers, setShowMembers] = useState(false);

  const fetchChat = useCallback(async () => {
    if (!id || !user?.id || !token || !API_URL) {
      setError('Unable to open this chat. Please sign in again.');
      setLoading(false);
      return;
    }

    setError(null);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [contextResponse, directoryResponse] = await Promise.all([
        axios.get(`${API_URL}/api/groups/${id}/context`, { headers, timeout: 15000 }),
        axios.get(`${API_URL}/api/groups/${id}/directory`, { headers, timeout: 15000 }),
      ]);

      const group = contextResponse.data?.club;
      if (!group || group.id !== id || !Array.isArray(directoryResponse.data?.members)) {
        throw new Error('Invalid chat response');
      }

      setClub({
        name: group.name || 'Group chat',
        photo: group.group_photo || group.photo_data_url || null,
      });
      setMembers(directoryResponse.data.members);

      try {
        const messagesResponse = await axios.get(
          `${API_URL}/api/groups/${id}/messages`,
          { headers, timeout: 15000 }
        );
        if (!Array.isArray(messagesResponse.data?.messages)) {
          throw new Error('Invalid messages response');
        }
        setMessages(messagesResponse.data.messages);
      } catch (messageError: any) {
        if (messageError.response?.status !== 404) throw messageError;
        setMessages([]);
      }
    } catch (err: any) {
      setError(
        err.response?.status === 403
          ? 'You no longer have access to this group chat.'
          : err.response?.status === 404
            ? 'This group is no longer available.'
            : 'Unable to load this conversation. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }, [id, user?.id, token, API_URL]);

  useFocusEffect(useCallback(() => {
    void fetchChat();
  }, [fetchChat]));

  const sendMessage = async () => {
    const text = messageText.trim();
    if (!text || sending || !id || !token || !API_URL) return;

    setSending(true);
    try {
      const response = await axios.post(
        `${API_URL}/api/groups/${id}/messages`,
        { text },
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 15000,
        }
      );

      const sent = response.data?.message;
      if (!sent?.id || !sent?.text) throw new Error('Invalid message response');

      setMessages(previous => [
        ...previous.filter(item => item.id !== sent.id),
        sent,
      ]);
      setMessageText('');
    } catch (err: any) {
      Alert.alert(
        'Message not sent',
        err.response?.status === 403
          ? 'You no longer have permission to post in this group.'
          : 'Please check your connection and try again.'
      );
    } finally {
      setSending(false);
    }
  };

  const formatTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString([], {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={23} color="#343A40" />
        </TouchableOpacity>

        {club?.photo ? (
          <Image source={{ uri: club.photo }} style={styles.groupPhoto} />
        ) : (
          <View style={styles.groupPhotoPlaceholder}>
            <Ionicons name="people-outline" size={22} color="#FFFFFF" />
          </View>
        )}

        <View style={styles.headerInfo}>
          <Text style={styles.groupName} numberOfLines={1}>
            {club?.name || 'Group chat'}
          </Text>
          <Text style={styles.memberCount}>
            {members.length} {members.length === 1 ? 'member' : 'members'}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => setShowMembers(value => !value)}
          style={styles.membersButton}
          accessibilityLabel="View group members"
        >
          <Ionicons name="people-outline" size={23} color="#343A40" />
        </TouchableOpacity>
      </View>

      {showMembers && (
        <View style={styles.membersPanel}>
          <Text style={styles.membersTitle}>GROUP MEMBERS</Text>
          {members.map(member => (
            <View key={member.id} style={styles.memberRow}>
              {member.profile_photo ? (
                <Image source={{ uri: member.profile_photo }} style={styles.memberPhoto} />
              ) : (
                <View style={styles.memberPhotoPlaceholder}>
                  <Ionicons name="person" size={17} color="#FFFFFF" />
                </View>
              )}
              <Text style={styles.memberName}>{member.name}</Text>
              {member.role && member.role !== 'member' && (
                <Text style={styles.memberRole}>{member.role}</Text>
              )}
            </View>
          ))}
        </View>
      )}

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#343A40" />
          <Text style={styles.stateText}>Loading conversation...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <Ionicons name="chatbubbles-outline" size={42} color="#858585" />
          <Text style={styles.stateText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => {
            setLoading(true);
            void fetchChat();
          }}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView
            style={styles.messages}
            contentContainerStyle={styles.messagesContent}
            keyboardShouldPersistTaps="handled"
          >
            {messages.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="chatbubble-ellipses-outline" size={42} color="#A0A0A0" />
                <Text style={styles.emptyTitle}>Start the conversation</Text>
                <Text style={styles.emptySubtitle}>
                  Send the first message to your group.
                </Text>
              </View>
            ) : (
              messages.map(item => {
                const ownMessage = item.sender_user_id === user?.id;
                return (
                  <View key={item.id} style={styles.messageRow}>
                    {item.sender_profile_photo ? (
                      <Image
                        source={{ uri: item.sender_profile_photo }}
                        style={styles.senderPhoto}
                      />
                    ) : (
                      <View style={styles.senderPhotoPlaceholder}>
                        <Ionicons name="person" size={16} color="#FFFFFF" />
                      </View>
                    )}
                    <View style={styles.messageContent}>
                      <View style={styles.messageMeta}>
                        <Text style={styles.senderName}>
                          {ownMessage ? 'You' : item.sender_name}
                        </Text>
                        <Text style={styles.messageTime}>
                          {formatTime(item.created_at)}
                        </Text>
                      </View>
                      <View style={styles.messageCard}>
                        <Text style={styles.messageText}>{item.text}</Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          <View style={styles.composer}>
            <TextInput
              style={styles.messageInput}
              value={messageText}
              onChangeText={setMessageText}
              placeholder="Write a message..."
              placeholderTextColor="#929292"
              multiline
              maxLength={2000}
              editable={!sending}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                (!messageText.trim() || sending) && styles.sendButtonDisabled,
              ]}
              onPress={sendMessage}
              disabled={!messageText.trim() || sending}
              accessibilityLabel="Send message"
            >
              {sending ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Ionicons name="arrow-up" size={22} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    minHeight: 76, paddingHorizontal: 15, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: '#EEEEEE',
  },
  backButton: { padding: 7, marginRight: 7 },
  groupPhoto: { width: 43, height: 43, borderRadius: 22 },
  groupPhotoPlaceholder: {
    width: 43, height: 43, borderRadius: 22,
    backgroundColor: '#343A40', alignItems: 'center', justifyContent: 'center',
  },
  headerInfo: { flex: 1, marginLeft: 11 },
  groupName: { color: '#343A40', fontSize: 16, fontWeight: '500' },
  memberCount: { color: '#888888', fontSize: 12, marginTop: 3 },
  membersButton: { padding: 9 },
  membersPanel: {
    paddingHorizontal: 18, paddingVertical: 12,
    backgroundColor: '#FAFAF8', borderBottomWidth: 1, borderBottomColor: '#EEEEEE',
  },
  membersTitle: {
    color: '#888888', fontSize: 10, letterSpacing: 1.1,
    fontWeight: '600', marginBottom: 10,
  },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  memberPhoto: { width: 32, height: 32, borderRadius: 16 },
  memberPhotoPlaceholder: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#858585', alignItems: 'center', justifyContent: 'center',
  },
  memberName: { flex: 1, marginLeft: 10, color: '#343A40', fontSize: 13 },
  memberRole: { color: '#888888', fontSize: 11, textTransform: 'capitalize' },
  messages: { flex: 1 },
  messagesContent: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 22 },
  messageRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 19 },
  senderPhoto: { width: 34, height: 34, borderRadius: 17, marginRight: 10 },
  senderPhotoPlaceholder: {
    width: 34, height: 34, borderRadius: 17, marginRight: 10,
    backgroundColor: '#858585', alignItems: 'center', justifyContent: 'center',
  },
  messageContent: { flex: 1 },
  messageMeta: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 5,
  },
  senderName: { color: '#343A40', fontSize: 13, fontWeight: '600' },
  messageTime: { color: '#999999', fontSize: 10 },
  messageCard: {
    backgroundColor: '#F7F6F2', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#EEEEEA',
  },
  messageText: { color: '#343A40', fontSize: 14, lineHeight: 21 },
  emptyState: { alignItems: 'center', paddingTop: 95, paddingHorizontal: 25 },
  emptyTitle: { color: '#343A40', fontSize: 16, marginTop: 14, fontWeight: '500' },
  emptySubtitle: { color: '#888888', fontSize: 13, marginTop: 6, textAlign: 'center' },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  stateText: { color: '#777777', fontSize: 13, marginTop: 12, textAlign: 'center' },
  retryButton: {
    backgroundColor: '#343A40', paddingHorizontal: 22,
    paddingVertical: 10, borderRadius: 7, marginTop: 18,
  },
  retryText: { color: '#FFFFFF', fontSize: 13 },
  composer: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 13, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: '#EEEEEE',
    backgroundColor: '#FFFFFF', gap: 10,
  },
  messageInput: {
    flex: 1, minHeight: 44, maxHeight: 110,
    backgroundColor: '#F7F6F2', borderRadius: 9,
    paddingHorizontal: 13, paddingTop: 12, paddingBottom: 10,
    color: '#343A40', fontSize: 14,
  },
  sendButton: {
    width: 43, height: 43, borderRadius: 22,
    backgroundColor: '#343A40', alignItems: 'center', justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.4 },
});
