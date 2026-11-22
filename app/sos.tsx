import { useEffect, useRef, useState } from 'react';
import { Text, View, Vibration } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { Screen, Button, Notice, P, H1 } from '../src/components/ui';
import { DeliveryList } from '../src/components/DeliveryList';
import { triggerSos, sosQueue } from '../src/lib/sos';
import { useTranslation } from 'react-i18next';
import { EmergencyButton } from '../src/components/EmergencyButton';
import { useLocale } from '../src/i18n/provider';
import { useProfile } from '../src/lib/queries';
import { useTheme } from '../src/lib/theme';
import { errorNl } from '../src/lib/convex';
import { ContactComposer } from '../src/components/ContactComposer';
import { reserveSmsMessage } from '../src/lib/composer';
import { lastKnown } from '../src/lib/location';
import { SHAKE } from '../src/content/liveSharing';

type Phase = 'countdown' | 'sending' | 'sent' | 'queued' | 'cancelled' | 'error';

export default function Sos() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const { emergencyDigits } = useLocale();
  const { sessionId, trigger } = useLocalSearchParams<{ sessionId?: string; trigger?: string }>();
  // Via schudden altijd minstens 5 s om te annuleren; bij valdetectie 10 s “Alles goed?”.
  const minCountdown = trigger === 'fall' ? 10 : trigger === 'shake' ? 5 : 0;
  const profile = useProfile();
  const cancelAlert = useMutation(api.sos.cancel);
  const [left, setLeft] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('countdown');
  const [alertId, setAlertId] = useState<Id<'alerts'> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fired = useRef(false); const clientRef = useRef<string | null>(null);
  const alert = useQuery(api.sos.get, alertId ? { alertId } : 'skip');
  const [smsLoc, setSmsLoc] = useState<{ lat?: number; lng?: number }>({});
  useEffect(() => { void lastKnown().then((l) => { if (l) setSmsLoc({ lat: l.lat, lng: l.lng }); }).catch(() => {}); }, []);

  const fire = async () => {
    if (fired.current) return; fired.current = true; setPhase('sending');
    try {
      const r = await triggerSos((sessionId as Id<'sessions'>) ?? null);
      clientRef.current = r.clientRef;
      if (r.alertId) { setAlertId(r.alertId); setPhase('sent'); } else setPhase('queued');
    } catch (e) { setErr(errorNl(e)); setPhase('error'); }
  };
  // Aftelling start ook als het profiel (offline) niet laadt: standaard 5 s
  useEffect(() => { if (left === null) { const t = setTimeout(() => setLeft((l) => l ?? 5), 1500); return () => clearTimeout(t); } }, [left]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- eenmalig de aftelduur uit het (later geladen) profiel overnemen
  useEffect(() => { if (left === null && profile) setLeft(Math.max(minCountdown, profile.sosCountdownSeconds)); }, [profile, left, minCountdown]);
  useEffect(() => {
    if (phase !== 'countdown' || left === null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- teller op 0: SOS versturen
    if (left <= 0) { fire(); return; }
    Vibration.vibrate(150);
    const tm = setTimeout(() => setLeft((l) => (l ?? 1) - 1), 1000);
    return () => clearTimeout(tm);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fire is idempotent (fired-ref); alleen op tik van de teller reageren
  }, [left, phase]);

  const cancelAfter = async () => {
    if (alertId) await cancelAlert({ alertId }).catch(() => {});
    if (clientRef.current) await sosQueue.remove(clientRef.current);
    setPhase('cancelled');
  };

  return (
    <Screen>
      {phase === 'countdown' && (
        <View style={{ alignItems: 'center', gap: 16, paddingTop: 30 }}>
          {trigger === 'shake' && <Notice kind="warn">{SHAKE.detected}. {tr('flow.sosx.cancel')}</Notice>}
          {trigger === 'fall' && <Notice kind="warn">{tr('flow.sosx.fall')}</Notice>}
          <H1>{trigger === 'fall' ? tr('flow.sosx.allGood') : tr('flow.sosx.sendingIn')}</H1>
          <Text accessibilityLiveRegion="assertive" style={{ fontSize: 120, fontWeight: '900', color: t.red }}>{left ?? '…'}</Text>
          <P muted>{tr('flow.sosx.contactsPush')}</P>
          <View style={{ alignSelf: 'stretch', gap: 12 }}>
            <Button title={tr('flow.sosx.cancel')} variant="secondary" onPress={() => { setPhase('cancelled'); if (router.canGoBack()) router.back(); else router.replace('/dashboard'); }} />
            <Button title={tr('flow.sosx.sendNow')} variant="danger" onPress={() => setLeft(0)} />
          </View>
        </View>
      )}
      {phase === 'sending' && <H1>{tr('flow.sosx.sending')}</H1>}
      {phase === 'sent' && (<>
        <H1>{tr('flow.sosx.registered')}</H1>
        <Notice kind="info">{tr('flow.sosx.delivery')}</Notice>
        <DeliveryList deliveries={alert?.deliveries ?? []} />
      </>)}
      {phase === 'queued' && <Notice kind="danger">{tr('flow.sosx.queued', { number: emergencyDigits })}</Notice>}
      {phase === 'error' && <Notice kind="danger">{tr('flow.sosx.failed', { error: err ?? '', number: emergencyDigits })}</Notice>}
      {phase === 'cancelled' && <Notice kind="ok">{tr('flow.sosx.cancelled')}</Notice>}
      {phase !== 'countdown' && (<>

      {(phase === 'queued' || phase === 'error' || phase === 'sent') && (
        <>
          <Notice kind={phase === 'sent' ? 'info' : 'warn'}>
            {phase === 'queued' || phase === 'error'
              ? tr('flow.sosx.smsOffline')
              : tr('flow.sosx.smsAlso')}
          </Notice>
          <ContactComposer message={reserveSmsMessage({ lat: smsLoc.lat, lng: smsLoc.lng, context: 'sos' })} />
        </>
      )}
        <EmergencyButton />
        <P muted>{tr('dial.hint')}. {tr('dial.title', { number: emergencyDigits })}</P>
        {(phase === 'sent' || phase === 'queued') && <Button title={tr('flow.sosx.falseAlarm')} variant="secondary" onPress={cancelAfter} />}
        <Button title={tr('flow.sosx.backDash')} variant="secondary" onPress={() => router.replace('/dashboard')} />
      </>)}
    </Screen>
  );
}
