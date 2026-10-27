import { ConvexReactClient } from 'convex/react';
import { ConvexError } from 'convex/values';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { mapErrorNl } from './safety';

const url = process.env.EXPO_PUBLIC_CONVEX_URL ?? '';
export const isConfigured = Boolean(url);

/** Eén gedeelde client: ook gebruikt door de achtergrond-locatietaak en de SOS-wachtrij. */
export const convex = new ConvexReactClient(url || 'https://missing.convex.cloud', { unsavedChangesWarning: false });

// Auth-tokens versleuteld in Keychain/Keystore (SecureStore); web valt terug op AsyncStorage.
export const tokenStorage = Platform.OS === 'web' ? AsyncStorage : {
  getItem: (k: string) => SecureStore.getItemAsync(k.replace(/[^\w.-]/g, '_')),
  setItem: (k: string, v: string) => SecureStore.setItemAsync(k.replace(/[^\w.-]/g, '_'), v),
  removeItem: (k: string) => SecureStore.deleteItemAsync(k.replace(/[^\w.-]/g, '_')),
};

export const errorCode = (e: unknown): string => (e instanceof ConvexError ? String(e.data) : e instanceof Error ? e.message : String(e));
export const errorNl = (e: unknown) => mapErrorNl(errorCode(e));
