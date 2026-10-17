import React from 'react';
import { Image, Modal, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  visible: boolean;
  photoUri?: string | null;
  onClose: () => void;
  displayName?: string;
};

// Reusable full-screen profile photo preview for members, admins and future profile surfaces.
export default function ProfilePhotoViewer({ visible, photoUri, onClose, displayName }: Props) {
  return (
    <Modal visible={visible && !!photoUri} animationType="fade" transparent={false}
      statusBarTranslucent onRequestClose={onClose}>
      <StatusBar backgroundColor="#101010" barStyle="light-content" />
      <View style={styles.container}>
        <Pressable onPress={onClose} style={styles.close} accessibilityRole="button"
          accessibilityLabel="Close expanded profile photo">
          <Ionicons name="arrow-back" size={28} color="#fff" />
          <Text style={styles.closeText}>Back</Text>
        </Pressable>
        {!!photoUri && <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="contain"
          accessibilityLabel={displayName ? `Profile photo of ${displayName}` : 'Expanded profile photo'} />}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  close: { position: 'absolute', top: 52, left: 18, zIndex: 2, flexDirection: 'row',
    alignItems: 'center', padding: 12, gap: 8 },
  closeText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  photo: { width: '100%', height: '80%' },
});
