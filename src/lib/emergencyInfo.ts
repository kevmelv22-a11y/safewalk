import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/** Noodinfo blijft op dit toestel. Niet naar SafeWalk of contacten, tenzij jij het zelf deelt. */
export const EMERGENCY_INFO_KEY = 'safewalk.emergencyInfo.v1';
export const EMERGENCY_FIELD_MAX = 500;
export const ICE_NAME_MAX = 80;
export const ICE_PHONE_MAX = 20;

export type EmergencyInfo = {
  medicalNotes: string;
  allergies: string;
  bloodType: string;
  iceName: string;
  icePhone: string;
};

export const EMPTY_EMERGENCY_INFO: EmergencyInfo = {
  medicalNotes: '',
  allergies: '',
  bloodType: '',
  iceName: '',
  icePhone: '',
};

export const EMERGENCY_INFO_HINT_NL =
  'Optioneel. Deze gegevens blijven op dit toestel en gaan niet naar SafeWalk. Hulpdiensten zien ze alleen als jij je telefoon laat zien of de tekst zelf deelt.';

function clip(s: string, max: number) {
  return s.replace(/\u0000/g, '').slice(0, max);
}

export function normalizeEmergencyInfo(input: Partial<EmergencyInfo> | null | undefined): EmergencyInfo {
  return {
    medicalNotes: clip(String(input?.medicalNotes ?? ''), EMERGENCY_FIELD_MAX),
    allergies: clip(String(input?.allergies ?? ''), EMERGENCY_FIELD_MAX),
    bloodType: clip(String(input?.bloodType ?? ''), 20),
    iceName: clip(String(input?.iceName ?? ''), ICE_NAME_MAX),
    icePhone: clip(String(input?.icePhone ?? ''), ICE_PHONE_MAX),
  };
}

const store = {
  async get(): Promise<string | null> {
    if (Platform.OS === 'web') return AsyncStorage.getItem(EMERGENCY_INFO_KEY);
    try { return await SecureStore.getItemAsync(EMERGENCY_INFO_KEY); } catch { return AsyncStorage.getItem(EMERGENCY_INFO_KEY); }
  },
  async set(v: string): Promise<void> {
    if (Platform.OS === 'web') { await AsyncStorage.setItem(EMERGENCY_INFO_KEY, v); return; }
    try { await SecureStore.setItemAsync(EMERGENCY_INFO_KEY, v); } catch { await AsyncStorage.setItem(EMERGENCY_INFO_KEY, v); }
  },
  async clear(): Promise<void> {
    if (Platform.OS === 'web') { await AsyncStorage.removeItem(EMERGENCY_INFO_KEY); return; }
    try { await SecureStore.deleteItemAsync(EMERGENCY_INFO_KEY); } catch { /* */ }
    await AsyncStorage.removeItem(EMERGENCY_INFO_KEY);
  },
};

export async function loadEmergencyInfo(): Promise<EmergencyInfo> {
  try {
    const raw = await store.get();
    if (!raw) return { ...EMPTY_EMERGENCY_INFO };
    return normalizeEmergencyInfo(JSON.parse(raw) as Partial<EmergencyInfo>);
  } catch {
    return { ...EMPTY_EMERGENCY_INFO };
  }
}

export async function saveEmergencyInfo(info: EmergencyInfo): Promise<EmergencyInfo> {
  const value = normalizeEmergencyInfo(info);
  await store.set(JSON.stringify(value));
  return value;
}

export async function clearEmergencyInfo(): Promise<void> {
  await store.clear();
}
