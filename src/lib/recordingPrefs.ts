import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Explicit, separate opt-ins (default OFF). The build config only makes these capabilities possible;
 * nothing is captured or sent in the background unless the user switched it on here.
 */
const BG_REC = 'safewalk.pref.backgroundRecording.v1';
const VOL_SEND = 'safewalk.pref.volumeDoublePressSend.v1';

async function getBool(k: string) { try { return (await AsyncStorage.getItem(k)) === '1'; } catch { return false; } }
async function setBool(k: string, v: boolean) { await AsyncStorage.setItem(k, v ? '1' : '0'); }

export const getBackgroundRecordingOptIn = () => getBool(BG_REC);
export const setBackgroundRecordingOptIn = (v: boolean) => setBool(BG_REC, v);
export const getVolumeSendOptIn = () => getBool(VOL_SEND);
export const setVolumeSendOptIn = (v: boolean) => setBool(VOL_SEND, v);
