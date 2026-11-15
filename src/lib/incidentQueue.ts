import AsyncStorage from '@react-native-async-storage/async-storage';
import { convex, errorCode } from './convex';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { PersistentQueue } from './queue';

export type IncidentPing = {
  incidentId: Id<'incidents'>;
  clientId: string;
  lat: number;
  lng: number;
  accuracyM?: number;
  recordedAt: number;
  locationConsent: true;
};

export const incidentQueue = new PersistentQueue<IncidentPing>(AsyncStorage, 'safewalk.incidentQueue', 20);

export async function enqueueIncidentPing(row: IncidentPing) {
  await incidentQueue.push(row.clientId, row);
}

export async function flushIncidentQueue() {
  await incidentQueue.flush(async (row) => {
    try {
      await convex.mutation(api.incidents.pingLocation, row);
    } catch (e) {
      const code = errorCode(e);
      if (code === 'NOT_FOUND' || code === 'BAD_REQUEST' || code === 'LOCATION_CONSENT_REQUIRED') return;
      throw e;
    }
  });
}
