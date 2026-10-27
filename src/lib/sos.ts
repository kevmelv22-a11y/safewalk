import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import { PersistentQueue } from './queue';
import { convex } from './convex';
import { lastKnown } from './location';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

export type SosPayload = { clientRef: string; sessionId?: Id<'sessions'>; lat?: number; lng?: number; accuracyM?: number; locationAt?: number };
export const sosQueue = new PersistentQueue<SosPayload>(AsyncStorage, 'safewalk.sosQueue');

/** Geen time-out → onbetrouwbaar netwerk wordt als fout behandeld zodat de wachtrij het opnieuw probeert. */
const send = (p: SosPayload) => Promise.race([
  convex.mutation(api.sos.trigger, p),
  new Promise<never>((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), 10_000)),
]);

/** Registreert SOS (idempotent via clientRef). Bij netwerkfout blijft het in de wachtrij. */
export async function triggerSos(sessionId: Id<'sessions'> | null) {
  const loc = await lastKnown().catch(() => null);
  const payload: SosPayload = { clientRef: Crypto.randomUUID(), ...(sessionId ? { sessionId } : {}), ...(loc ?? {}) };
  await sosQueue.push(payload.clientRef, payload);
  let alertId: Id<'alerts'> | undefined;
  await sosQueue.flush(async (p) => { alertId = await send(p); });
  return { queued: !alertId, alertId, clientRef: payload.clientRef };
}

export function startSosRetry() {
  const flush = () => sosQueue.flush(async (p) => { await send(p); }).catch(() => {});
  const unsub = NetInfo.addEventListener((s) => { if (s.isConnected) flush(); });
  const iv = setInterval(flush, 15_000);
  return () => { unsub(); clearInterval(iv); };
}
