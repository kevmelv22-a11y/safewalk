import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const isConfigured = Boolean(url && anonKey);

// Sessietokens versleuteld in SecureStore (Keychain/Keystore). Grote waarden vallen terug op AsyncStorage.
const secureStorage = {
  getItem: async (k: string) => (Platform.OS === 'web' ? AsyncStorage.getItem(k) : (await SecureStore.getItemAsync(k)) ?? AsyncStorage.getItem(k)),
  setItem: async (k: string, v: string) => {
    if (Platform.OS !== 'web' && v.length < 2000) return SecureStore.setItemAsync(k, v);
    return AsyncStorage.setItem(k, v);
  },
  removeItem: async (k: string) => { if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(k); await AsyncStorage.removeItem(k); },
};

export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'missing-anon-key', {
  auth: { storage: secureStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw error;
  return data as T;
}
