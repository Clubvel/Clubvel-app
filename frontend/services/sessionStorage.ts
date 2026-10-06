import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Native tokens belong in platform-protected storage. Web retains its existing storage.
export const sessionStorage = {
  async getToken(): Promise<string | null> {
    if (Platform.OS === 'web') return AsyncStorage.getItem('auth_token');
    const secure = await SecureStore.getItemAsync('auth_token');
    if (secure) return secure;
    const legacy = await AsyncStorage.getItem('auth_token');
    if (legacy) {
      await SecureStore.setItemAsync('auth_token', legacy);
      await AsyncStorage.removeItem('auth_token');
    }
    return legacy;
  },
  async setToken(token: string) {
    if (Platform.OS === 'web') await AsyncStorage.setItem('auth_token', token);
    else {
      await SecureStore.setItemAsync('auth_token', token);
      await AsyncStorage.removeItem('auth_token');
    }
  },
  async clearToken() {
    if (Platform.OS !== 'web') await SecureStore.deleteItemAsync('auth_token');
    await AsyncStorage.removeItem('auth_token');
  },
};
