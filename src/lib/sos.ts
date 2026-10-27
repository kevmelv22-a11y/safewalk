import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import { PersistentQueue } from './queue';
import { callFunction } from './supabase';
import { lastKnown } from './location';

export type SosPayload = { client_ref: string; session_id?: string | null; lat?: number; lng?: number; accuracy_m?: number | null; location_at?: string };
export const sosQueue = new PersistentQueue<SosPayload>(AsyncStorage, 'safewalk.sosQueue');
export type SosResult = { alert_id: string; deliveries: Record<string, string> };

/** Registreert SOS. Bij netwerkfout blijft het in de wachtrij en wordt automatisch opnieuw geprobeerd. */
export async function triggerSos(sessionId: string | null): Promise<{ queued: boolean; result?: SosResult; clientRef: string }> {
  const loc = await lastKnown().catch(() => null);
  const payload: SosPayload = { client_ref: Crypto.randomUUID(), session_id: sessionId, ...(loc ?? {}) };
  await sosQueue.push(payload.client_ref, payload);
  let result: SosResult | undefined;
  await sosQueue.flush(async (p) => { result = await callFunction<SosResult>('sos-alert', { ...p }); });
  return { queued: !result, result, clientRef: payload.client_ref };
}

export function startSosRetry() {
  const flush = () => sosQueue.flush((p) => callFunction('sos-alert', { ...p }).then(() => undefined));
  const unsub = NetInfo.addEventListener((s) => { if (s.isConnected) flush(); });
  const iv = setInterval(flush, 15_000);
  return () => { unsub(); clearInterval(iv); };
}
