import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import { ConvexError } from 'convex/values';
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

/** Een ConvexError is een bewust serverantwoord (bv. leeftijd, limiet): opnieuw proberen helpt niet. */
const isServerRejection = (e: unknown) => e instanceof ConvexError;

type QueueLike = Pick<PersistentQueue<SosPayload>, 'push' | 'remove'>;

/**
 * Verstuurt precies DEZE SOS. Eerst in de wachtrij (overleeft een crash), dan direct versturen.
 * - gelukt → uit de wachtrij, alertId terug
 * - geen verbinding/time-out → blijft in de wachtrij (queued)
 * - server weigert → uit de wachtrij en fout doorgeven, zodat de gebruiker niet ten onrechte
 *   "wordt later verstuurd" ziet
 */
export async function deliverSos(
  queue: QueueLike, payload: SosPayload, sendFn: (p: SosPayload) => Promise<Id<'alerts'>>,
  isPermanent: (e: unknown) => boolean = isServerRejection,
): Promise<{ queued: boolean; alertId?: Id<'alerts'> }> {
  await queue.push(payload.clientRef, payload);
  try {
    const alertId = await sendFn(payload);
    await queue.remove(payload.clientRef);
    return { queued: false, alertId };
  } catch (e) {
    if (isPermanent(e)) { await queue.remove(payload.clientRef); throw e; }
    return { queued: true };
  }
}

/** Registreert SOS (idempotent via clientRef). Bij netwerkfout blijft het in de wachtrij. */
export async function triggerSos(sessionId: Id<'sessions'> | null) {
  const loc = await lastKnown().catch(() => null);
  const payload: SosPayload = { clientRef: Crypto.randomUUID(), ...(sessionId ? { sessionId } : {}), ...(loc ?? {}) };
  const r = await deliverSos(sosQueue, payload, send);
  return { ...r, clientRef: payload.clientRef };
}

export function startSosRetry() {
  const flush = () => sosQueue.flush(async (p) => {
    try { await send(p); } catch (e) { if (!isServerRejection(e)) throw e; } // weigering: niet eindeloos herhalen
  }).catch(() => {});
  const unsub = NetInfo.addEventListener((s) => { if (s.isConnected) flush(); });
  const iv = setInterval(flush, 15_000);
  return () => { unsub(); clearInterval(iv); };
}
