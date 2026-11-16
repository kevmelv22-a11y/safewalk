import { useEffect, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import * as Location from 'expo-location';
import { Button, Card, P, Notice } from './ui';
import { classifyConnection, type ConnectionKind, type NetSnapshot } from '../lib/connectionStatus';
import { shouldShowOfflineSmsPrompt } from '../lib/shareOfflinePrompt';
import { autoSmsAgeOk, getAutoSmsOptIn, getAutoSmsPhones, hasSendSmsPermission } from '../lib/autoSms';
import { reserveSmsMessage, smsBodyUrl } from '../lib/composer';
import { useSessions, useProfile } from '../lib/queries';
import { localNotify } from '../lib/notifications';
import { OFFLINE_SMS_COPY } from '../content/longShare';
import { useSharingSessionId } from '../lib/sharingKeeper';

function snap(s: NetInfoState): NetSnapshot {
  return { isConnected: s.isConnected, isInternetReachable: s.isInternetReachable, type: s.type };
}

/**
 * In-app herinnering (en lokale melding) om zelf een sms te openen als er geen internet is.
 * Geen automatische verzending. Op Android met werkende auto-sms blijft dit verborgen.
 */
export function OfflineSmsPrompt() {
  const sessions = useSessions();
  const profile = useProfile();
  const childLink = useQuery(api.childLinks.myLink);
  const incident = useQuery(api.incidents.active);
  const sharingId = useSharingSessionId();
  const mine = sessions?.mine;
  const [kind, setKind] = useState<ConnectionKind>('online');
  const [visible, setVisible] = useState(false);
  const [opening, setOpening] = useState(false);
  const lastPromptAt = useRef(0);
  const lastNotifyAt = useRef(0);

  useEffect(() => {
    const apply = (s: NetInfoState) => setKind(classifyConnection(snap(s)));
    const unsub = NetInfo.addEventListener(apply);
    void NetInfo.fetch().then(apply).catch(() => {});
    return () => unsub();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const active = !!(mine && mine.endedAt === undefined) || !!incident?._id || !!sharingId;
      const [optIn, phones, perm] = await Promise.all([getAutoSmsOptIn(), getAutoSmsPhones(), hasSendSmsPermission()]);
      const autoSmsActive = Platform.OS === 'android' && optIn && perm && phones.length > 0 && autoSmsAgeOk(profile?.ageStatus, !!childLink);
      const now = Date.now();
      const show = shouldShowOfflineSmsPrompt({ active, connection: kind, lastPromptAt: lastPromptAt.current || undefined, now, autoSmsActive });
      if (cancelled) return;
      setVisible(show);
      if (show && now - lastNotifyAt.current > 14 * 60_000) {
        lastNotifyAt.current = now;
        lastPromptAt.current = now;
        void localNotify(OFFLINE_SMS_COPY.notifyTitle, OFFLINE_SMS_COPY.notifyBody).catch(() => {});
      }
    })();
    return () => { cancelled = true; };
  }, [kind, mine, incident?._id, sharingId, profile?.ageStatus, childLink]);

  const openSms = async () => {
    setOpening(true);
    lastPromptAt.current = Date.now();
    try {
      const l = await Location.getLastKnownPositionAsync().catch(() => null);
      const body = reserveSmsMessage({
        lat: l?.coords.latitude, lng: l?.coords.longitude,
        context: incident?._id ? 'sos' : (mine?.kind === 'share' ? 'share' : 'trip'),
        what: mine?.destinationLabel,
      });
      await Linking.openURL(smsBodyUrl(Platform.OS, body));
    } catch { /* gebruiker kan later opnieuw */ }
    finally { setOpening(false); setVisible(false); }
  };

  if (!visible) return null;
  return (
    <Card>
      <Notice kind="warn">{OFFLINE_SMS_COPY.title}</Notice>
      <P muted>{OFFLINE_SMS_COPY.body}</P>
      <Button title={OFFLINE_SMS_COPY.action} onPress={() => { void openSms(); }} loading={opening} />
    </Card>
  );
}
