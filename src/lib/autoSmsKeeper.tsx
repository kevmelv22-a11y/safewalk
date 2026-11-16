import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import * as Location from 'expo-location';
import { classifyConnection, type ConnectionKind, type NetSnapshot } from './connectionStatus';
import { useSessions, useProfile } from './queries';
import {
  decideAutoSms, getAutoSmsOptIn, getAutoSmsPhones, hasSendSmsPermission,
  loadRoundState, saveRoundState, clearRoundState, sendAutoSmsRound, autoSmsAgeOk, testGuardActive,
  type SmsSender,
} from './autoSms';
import { useSharingSessionId } from './sharingKeeper';

function snap(s: NetInfoState): NetSnapshot {
  return { isConnected: s.isConnected, isInternetReachable: s.isInternetReachable, type: s.type };
}

async function lastCoords(): Promise<{ lat: number; lng: number } | null> {
  try {
    const l = await Location.getLastKnownPositionAsync();
    if (!l) return null;
    return { lat: l.coords.latitude, lng: l.coords.longitude };
  } catch {
    return null;
  }
}

async function nativeSender(): Promise<SmsSender | null> {
  if (testGuardActive()) return null;
  if (Platform.OS !== 'android') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- optionele native module, zelfde patroon als alarmService
    const native = require('safewalk-native') as { sendSms?: SmsSender };
    return native.sendSms ?? null;
  } catch {
    return null;
  }
}

/**
 * Stuurt op Android (na opt-in) periodiek een sms als er geen internet is tijdens delen of SOS.
 * Verstuurt nooit in tests; iOS/web is een no-op.
 */
export function AutoSmsKeeper() {
  const sessions = useSessions();
  const profile = useProfile();
  const childLink = useQuery(api.childLinks.myLink);
  const incident = useQuery(api.incidents.active);
  const sharingId = useSharingSessionId();
  const mine = sessions?.mine;
  const [epoch, setEpoch] = useState(0);
  const tick = useRef(0);

  useEffect(() => {
    const bump = () => setEpoch((n) => n + 1);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') bump(); });
    const unsub = NetInfo.addEventListener(() => bump());
    const iv = setInterval(bump, 60_000);
    return () => { sub.remove(); unsub(); clearInterval(iv); };
  }, []);

  useEffect(() => {
    if (sessions === undefined) return;
    const n = ++tick.current;
    const active = !!(mine && mine.endedAt === undefined) || !!incident?._id || !!sharingId;
    const key = String(incident?._id ?? mine?._id ?? sharingId ?? '');
    void (async () => {
      if (!active || !key) {
        await clearRoundState();
        return;
      }
      const [optIn, phones, perm, net, coords, state] = await Promise.all([
        getAutoSmsOptIn(),
        getAutoSmsPhones(),
        hasSendSmsPermission(),
        NetInfo.fetch().then((s) => classifyConnection(snap(s))).catch((): ConnectionKind => 'offline'),
        lastCoords(),
        loadRoundState(key),
      ]);
      if (n !== tick.current) return;
      const decision = decideAutoSms({
        platform: Platform.OS,
        optIn,
        ageOk: autoSmsAgeOk(profile?.ageStatus, !!childLink),
        permission: perm,
        connection: net,
        active,
        lastRoundAt: state.lastAt || undefined,
        roundsSent: state.rounds,
        phones,
        lat: coords?.lat,
        lng: coords?.lng,
        now: Date.now(),
      });
      if (decision.action !== 'send') return;
      const sender = await nativeSender();
      if (!sender) return;
      const result = await sendAutoSmsRound(decision.phones, decision.body, sender);
      if (result.sent.length === 0) return;
      await saveRoundState({ key, rounds: state.rounds + 1, lastAt: Date.now() });
    })();
  }, [epoch, sessions, mine, incident?._id, sharingId, profile?.ageStatus, childLink]);

  return null;
}
