import { useEffect, useState } from 'react';
import { Redirect, router } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { api } from '../convex/_generated/api';
import { Screen, H1, P, Button, Notice } from '../src/components/ui';
import { useProfile } from '../src/lib/queries';
import { startSharing, stopSharing, untilFor, lastKnown } from '../src/lib/location';
import { getConsentedLocation } from '../src/lib/locationOnce';
import { errorNl } from '../src/lib/convex';
import { EmergencyButton } from '../src/components/EmergencyButton';
import { ContactComposer } from '../src/components/ContactComposer';
import { reserveSmsMessage } from '../src/lib/composer';
import { useLocale } from '../src/i18n/provider';

/** Kindermodus: één grote SOS, aankomst thuis/school, zichtbare deel-melding. Geen SOS-uitknop. */
export default function KindHome() {
  const { t } = useTranslation();
  const { emergencyDigits } = useLocale();
  const profile = useProfile();
  const link = useQuery(api.childLinks.myLink);
  const startShare = useMutation(api.childLinks.startShare);
  const stopShare = useMutation(api.childLinks.stopShare);
  const arrived = useMutation(api.childLinks.arrived);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [smsLoc, setSmsLoc] = useState<{ lat?: number; lng?: number }>({});

  useEffect(() => { void lastKnown().then((l) => { if (l) setSmsLoc({ lat: l.lat, lng: l.lng }); }).catch(() => {}); }, []);

  useEffect(() => {
    if (!link?.linkId) return;
    let cancelled = false;
    (async () => {
      try {
        const sid = await startShare({});
        if (cancelled) return;
        await startSharing(sid, { until: untilFor(Date.now() + 8 * 3600_000) }).catch(() => {});
      } catch (e) { if (!cancelled) setErr(errorNl(e)); }
    })();
    return () => { cancelled = true; };
  }, [link?.linkId, startShare]);

  if (profile === undefined || link === undefined) return <Screen><P>{t('flow.kind.loading')}</P></Screen>;
  if (profile && profile.ageStatus === 'adult') return <Redirect href="/dashboard" />;
  if (profile && profile.ageStatus !== 'minor') return <Redirect href="/age" />;
  if (!link) return <Redirect href="/kind/koppelen" />;

  const names = [link.parentName, ...link.contactNames].filter(Boolean);
  const shareLine = names.length > 1
    ? t('flow.kind.shared', { names: names.join(', ') })
    : t('flow.kind.sharedOne', { name: names[0] || link.parentName });

  const onArrived = async (place: 'home' | 'school') => {
    setBusy(place); setErr(null); setMsg(null);
    try {
      const loc = await getConsentedLocation();
      await arrived({
        place,
        ...(loc.locationConsent ? { lat: loc.lat, lng: loc.lng, locationAt: loc.locationAt } : {}),
      });
      setMsg(place === 'home' ? t('flow.kind.homeMsg') : t('flow.kind.schoolMsg'));
    } catch (e) { setErr(errorNl(e)); }
    finally { setBusy(null); }
  };

  const onStop = async () => {
    setBusy('stop'); setErr(null);
    try {
      await stopShare({});
      await stopSharing().catch(() => {});
      setMsg(t('flow.kind.stopped'));
    } catch (e) { setErr(errorNl(e)); }
    finally { setBusy(null); }
  };

  return (
    <Screen>
      <H1>{t('flow.kind.title')}</H1>
      <Notice kind="warn">{shareLine} {t('flow.kind.whileOpen')}</Notice>
      <Button title="SOS" variant="danger" onPress={() => router.push({ pathname: '/sos', params: link.sessionId ? { sessionId: link.sessionId } : {} })}
        hint={t('flow.kind.sosHint', { number: emergencyDigits })} />
      <Button title={t('flow.kind.home')} variant="success" onPress={() => { void onArrived('home'); }} loading={busy === 'home'} disabled={!!busy} />
      <Button title={t('flow.kind.school')} variant="success" onPress={() => { void onArrived('school'); }} loading={busy === 'school'} disabled={!!busy} />
      <EmergencyButton />
      <Notice kind="info">{t('flow.kind.smsNote')}</Notice>
      <ContactComposer message={reserveSmsMessage({ lat: smsLoc.lat, lng: smsLoc.lng, context: 'sos' })} />
      {msg && <Notice kind="ok">{msg}</Notice>}
      {err && <Notice kind="danger">{err}</Notice>}
      {link.sharing && <Button title={t('flow.kind.stopShare')} variant="secondary" onPress={() => { void onStop(); }} loading={busy === 'stop'} disabled={!!busy}
        hint={t('flow.kind.stopHint')} />}
      <Button title={t('flow.kind.privacy')} variant="secondary" onPress={() => router.push('/privacy')} />
    </Screen>
  );
}
