import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { syncHomeCheckInReminders } from './notifications';

type BoundaryProps = { children: React.ReactNode; fallback?: React.ReactNode };
type BoundaryState = { error: boolean };

/** Vangt een ontbrekende serverfunctie op, zodat de rest van de app bruikbaar blijft tot de schemawijziging live is. */
export class HomeCheckInBoundary extends React.Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: false };
  static getDerivedStateFromError(): BoundaryState { return { error: true }; }
  render() {
    if (this.state.error) return this.props.fallback ?? null;
    return this.props.children;
  }
}

/**
 * Na een herstart (of op de voorgrond): lokale herinnering opnieuw zetten en,
 * alleen als locatie al is toegestaan, de laatst bekende plek bijwerken.
 * Vraagt zelf geen toestemming. Zonder punt blijft de melding eerlijk "onbekend".
 */
export function HomeCheckInKeeper() {
  const data = useQuery(api.homeCheckIn.mine);
  const update = useMutation(api.homeCheckIn.updateLocation);
  const pending = data?.pending ?? [];
  const key = pending.map((p) => `${p._id}:${p.dueAt}`).join('|');
  const active = pending.length > 0;

  useEffect(() => {
    if (data === undefined) return;
    void syncHomeCheckInReminders(pending.map((p) => ({ id: p._id, dueAt: p.dueAt }))).catch(() => undefined);
    // key dekt id + deadline; pending zelf zou elke render opnieuw plannen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, data === undefined]);

  useEffect(() => {
    if (!active) return;
    let stop = false;
    const tick = async () => {
      if (stop || AppState.currentState !== 'active') return;
      const perm = await Location.getForegroundPermissionsAsync().catch(() => null);
      if (!perm || perm.status !== 'granted') return;
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (stop) return;
        await update({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          ...(pos.coords.accuracy != null ? { accuracyM: pos.coords.accuracy } : {}),
          locationAt: pos.timestamp || Date.now(),
        });
      } catch { /* geen punt: de melding zegt dan dat de locatie onbekend is */ }
    };
    void tick();
    const id = setInterval(() => { void tick(); }, 60_000);
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') void tick(); });
    return () => { stop = true; clearInterval(id); sub.remove(); };
  }, [active, update]);

  return null;
}
