import AsyncStorage from '@react-native-async-storage/async-storage';
// Versie omhoog als de uitleg inhoudelijk verandert, zodat iedereen hem opnieuw ziet.
const KEY = 'safewalk.liveDisclosure.v1';
export async function disclosureAccepted() { return (await AsyncStorage.getItem(KEY)) === '1'; }
export async function acceptDisclosure() { await AsyncStorage.setItem(KEY, '1'); }
