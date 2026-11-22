import { useEffect, useState } from 'react';
import { Platform, Share, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { useTranslation } from 'react-i18next';
import { Screen, Button, Card, P, Notice, H1 } from '../../src/components/ui';
import { LiveMap } from '../../src/components/LiveMap';
import { SosButton } from '../../src/components/SosButton';
import { errorNl } from '../../src/lib/convex';
import { useLiveLocations, useNow } from '../../src/lib/useLiveLocations';
import { checkInPhase, deliveryIcon, deliveryLabel, formatCountdown, notificationKindLabel, sharingStatus, timeAgo } from '../../src/lib/safety';
import { signalText } from '../../convex/motionText';
import { startSharing, stopSharing, untilFor } from '../../src/lib/location';
import { useSharingMode, useSharingSessionId } from '../../src/lib/sharingKeeper';
import { Choice, Toggle } from '../../src/components/Choice';
import { useLinkCodes } from '../../src/store/linkCodes';
import { CODE_HINT, LINK_KEY_WARNING, PRIVACY_HINT, VIEWER_ALERTS_HINT } from '../../src/content/liveSharing';
import { LINK_DURATIONS, type LinkDuration } from '../../convex/liveShare';
import { cancelReminders, scheduleCheckInReminder } from '../../src/lib/notifications';
import { ARRIVAL_PROMPT_M, arrivalDistance, shouldAskArrived } from '../../src/lib/arrival';
import { recordSafeArrival } from '../../src/lib/reviewPrompt';
import { reserveSmsMessage, tripLinkMessage } from '../../src/lib/composer';
import { shouldPromptRenewal } from '../../convex/longShare';
import { ContactComposer } from '../../src/components/ContactComposer';
import { OfflineSmsPrompt } from '../../src/components/OfflineSmsPrompt';
import { rideShareLine } from '../../src/lib/rideShare';
import { BATTERY_HINT_NL, openBatteryOptimizationSettings } from '../../src/lib/batteryOptimization';

export default function MySession() {
  const { t } = useTranslation();
  const id = useLocalSearchParams<{ id: string }>().id as Id<'sessions'>; const now = useNow(1000);
  const trail = useLiveLocations(id);
  const data = useQuery(api.sessions.get, { sessionId: id });
  const respondCheckIn = useMutation(api.sessions.respondCheckIn);
  const endSession = useMutation(api.sessions.end);
  const renewShare = useMutation(api.sessions.renewShare);
  const revokeViewer = useMutation(api.sessions.revokeViewer);
  const acknowledge = useMutation(api.motion.acknowledge);
  const [err, setErr] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [snoozedAt, setSnoozedAt] = useState<number | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkMsg, setLinkMsg] = useState<string | null>(null);
  const [linkText, setLinkText] = useState<string | null>(null);
  const createTripLink = useMutation(api.tracking.createTripLink);
  const revokeLink = useMutation(api.tracking.revokeShareLink);
  const allLinks = useQuery(api.tracking.myShareLinks);
  const sharingId = useSharingSessionId();
  const mode = useSharingMode();
  const codes = useLinkCodes((x) => x.codes); const putCode = useLinkCodes((x) => x.put);
  const [duration, setDuration] = useState<LinkDuration>('arrival');
  const [withCode, setWithCode] = useState(false);
  const linkLabel = (d: LinkDuration) => t(d === '15m' ? 'flow.share.l15' : d === '1h' ? 'flow.share.l1' : d === 'arrival' ? 'flow.share.arrival' : 'flow.share.d8');
  const s = data?.session; const ci = data?.checkIn;
  const ended = !!s && s.endedAt !== undefined;
  const isShare = s?.kind === 'share';
  const renewDue = !!(s && shouldPromptRenewal(s, now));
  useEffect(() => { if (ended) stopSharing(); }, [ended]);
  if (data === null) return (
    <Screen>
      <Notice kind="info">Deze reis bestaat niet meer of je hebt er geen toegang toe.</Notice>
      <Button title={t('flow.sosx.backDash')} variant="secondary" onPress={() => router.replace('/dashboard')} />
    </Screen>
  );
  if (!s) return <Screen><P muted>{t('flow.home.loading')}</P></Screen>;
  const share = data.isOwner && !ended ? sharingStatus(sharingId === id, trail.at(-1)?.recordedAt ?? null, now, mode) : null;
  const phase = ci && ci.status !== 'confirmed' && ci.status !== 'cancelled' ? checkInPhase(ci.dueAt, ci.graceMinutes, now) : null;
  const respond = async (extend: number) => {
    try {
      const due = await respondCheckIn({ sessionId: id, extendMinutes: extend });
      if (due) await scheduleCheckInReminder(new Date(due)).catch(() => {});
      else {
        await stopSharing(); await cancelReminders();
        // 3e schone veilige aankomst → eenmalig vragen om een beoordeling in de winkel.
        void recordSafeArrival({ clean: s.status !== 'alert' }).catch(() => undefined);
      }
    } catch (e) { setErr(errorNl(e)); }
  };
  const dest = s.destinationLat !== undefined && s.destinationLng !== undefined ? { lat: s.destinationLat, lng: s.destinationLng } : null;
  const last = trail.at(-1) ?? null;
  const askArrived = !!ci && ci.status !== 'confirmed' && ci.status !== 'cancelled'
    && shouldAskArrived({ last, dest, now, snoozedAt, active: data.isOwner && !ended && sharingId === id });
  const distance = arrivalDistance(last, dest);
  const site = process.env.EXPO_PUBLIC_CONVEX_SITE_URL?.replace(/\/$/, '') ?? '';
  const tripLinks = (allLinks ?? []).filter((l) => l.sessionId === id && !l.expired);
  const shareTripLink = async () => {
    setLinkBusy(true); setLinkMsg(null); setErr(null);
    try {
      // Expliciete keuze van de gebruiker (deze knop); locatie wordt al gedeeld met toestemming.
      const r = await createTripLink({ sessionId: id, locationConsent: true, duration, withCode });
      if (r.accessCode) putCode(r.id, r.accessCode);
      const text = tripLinkMessage(`${site}${r.path}`);
      setLinkText(text);
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text).catch(() => undefined);
        setLinkMsg('Link gekopieerd. Plak hem in sms of WhatsApp; jij tikt zelf op versturen.');
      } else {
        await Share.share({ message: text });
        setLinkMsg('Deelvenster geopend. Er is pas iets verstuurd als jij in die app op Versturen tikt.');
      }
    } catch (e) { setErr(errorNl(e)); }
    finally { setLinkBusy(false); }
  };
  const stop = async () => {
    setStopping(true); setErr(null);
    try { await endSession({ sessionId: id }); }
    catch (e) {
      // Niet lokaal stoppen: de reis loopt op de server nog door (check-in kan je contacten waarschuwen).
      setErr(t('flow.session.stopFail', { error: errorNl(e) }));
      setStopping(false);
      return;
    }
    await stopSharing(); await cancelReminders(); router.replace('/dashboard');
  };
  const resume = async () => {
    setResuming(true); setErr(null);
    try { await startSharing(id, { until: untilFor(s.expiresAt) }); }
    catch (e) { setErr(t('flow.session.perm', { detail: String((e as Error).message) })); }
    finally { setResuming(false); }
  };
  return (
    <Screen>
      <H1>{isShare ? `📍 ${s.destinationLabel}` : s.kind === 'timer' ? `⏱️ ${s.destinationLabel}` : s.destinationLabel}</H1>
      {isShare && !ended && (
        <P muted>{s.shareUntilStop ? t('flow.share.activeUntilStop') : t('flow.share.activeUntil')}{' '}
          {new Date(s.expectedArrival).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
        </P>
      )}
      {!!rideShareLine({ plate: s.ridePlate, driverName: s.rideDriverName, vehicle: s.rideVehicle }) && <Notice kind="info">🚗 {rideShareLine({ plate: s.ridePlate, driverName: s.rideDriverName, vehicle: s.rideVehicle })}</Notice>}
      {s.privacyMode && !ended && <Notice kind="info">🔒 Privacy-check-in staat aan. {PRIVACY_HINT}</Notice>}
      {ended && <Notice kind="info">{isShare ? t('flow.session.shareEnded') : t('flow.session.tripEnded')}</Notice>}
      <OfflineSmsPrompt />
      {share && (
        <Notice kind={share.kind}>{share.text}{share.lastAt ? ` Laatste punt: ${timeAgo(share.lastAt, now)}.` : ''}</Notice>
      )}
      {share && !share.live && (
        <Button title={t('flow.session.resume')} variant="success" loading={resuming} onPress={resume} />
      )}
      {data.isOwner && !ended && share && !share.live && (
        <Card>
          <P>{t('flow.session.smsTitle')}</P>
          <P muted>{t('flow.session.smsBody')}</P>
          <ContactComposer message={reserveSmsMessage({
            lat: last?.lat, lng: last?.lng, context: isShare ? 'share' : 'trip', what: s.kind === 'timer' || isShare ? s.destinationLabel : `reis naar ${s.destinationLabel}`,
            ride: { plate: s.ridePlate, driverName: s.rideDriverName, vehicle: s.rideVehicle },
          })} />
        </Card>
      )}
      {data.isOwner && !ended && <Notice kind="info">{BATTERY_HINT_NL}</Notice>}
      {data.isOwner && !ended && isShare && renewDue && (
        <Card>
          <P>{t('flow.share.renewTitle')}</P>
          <P muted>{t('flow.share.renewBody')}</P>
          <Button title={t('flow.share.renew')} variant="success" loading={renewing} onPress={() => {
            setRenewing(true); setErr(null);
            renewShare({ sessionId: id }).catch((e) => setErr(errorNl(e))).finally(() => setRenewing(false));
          }} />
        </Card>
      )}
      {data.isOwner && !ended && Platform.OS === 'android' && <Button title={t('flow.session.battery')} variant="secondary" onPress={() => { void openBatteryOptimizationSettings(); }} />}
      {s.status === 'alert' && !ended && <Notice kind="danger">{t('flow.session.missed')}</Notice>}
      {!ended && data.signals.map((sg) => (
        <Card key={sg._id} style={{ borderColor: '#F59E0B', borderWidth: 2 }}>
          <P>{signalText[sg.kind]}</P>
          <P muted>{t('flow.session.signalNote')}</P>
          <Button title={t('flow.session.allGood')} variant="success" onPress={() => acknowledge({ signalId: sg._id })} />
        </Card>
      ))}
      {askArrived && (
        <Card style={{ borderColor: '#22C55E', borderWidth: 2 }}>
          <P style={{ fontSize: 22, fontWeight: '800' }}>{t('flow.session.thereTitle')}</P>
          <P muted>{t('flow.session.thereBody', { meters: Math.max(5, Math.round((distance ?? ARRIVAL_PROMPT_M) / 5) * 5), place: s.destinationLabel })}</P>
          <Button title={t('flow.session.yesArrived')} variant="success" onPress={() => respond(0)} />
          <Button title={t('flow.session.notYet')} variant="secondary" onPress={() => setSnoozedAt(Date.now())} />
        </Card>
      )}
      {!ended && ci && phase && (
        <Card style={phase !== 'running' ? { borderColor: '#EF4444', borderWidth: 2 } : undefined}>
          {phase === 'running' ? <P>{t('flow.session.checkinIn', { time: formatCountdown(ci.dueAt - now) })}</P> : <P style={{ fontSize: 22, fontWeight: '800' }}>{t('flow.sosx.allGood')}</P>}
          {phase === 'grace' && <P muted>{t('flow.session.confirmWithin', { time: formatCountdown(ci.dueAt + ci.graceMinutes * 60_000 - now) })}</P>}
          <Button title={t('flow.session.arrived')} variant="success" onPress={() => respond(0)} />
          <Button title={t('flow.session.plus10')} variant="secondary" disabled={ci.extensions >= 3} onPress={() => respond(10)} />
          <Button title={t('flow.session.plus20')} variant="secondary" disabled={ci.extensions >= 3} onPress={() => respond(20)} />
        </Card>
      )}
      <LiveMap trail={trail} dest={s.destinationLat !== undefined && s.destinationLng !== undefined ? { lat: s.destinationLat, lng: s.destinationLng, label: s.destinationLabel } : null} now={now} />
      <Card>
        <P>{t('flow.session.viewers')}</P>
        {data.viewers.length === 0 && <P muted>{t('flow.session.viewersNone')}</P>}
        {data.viewers.map((v) => <P key={v.viewerId} muted>{v.revoked ? '⛔' : '👀'} {v.name}{v.revoked ? ` ${t('flow.session.revoked')}` : ''}</P>)}
        {!ended && data.viewers.filter((v) => !v.revoked).map((v) => (
          <Button key={'r' + v.viewerId} title={t('flow.session.revokeName', { name: v.name })} variant="secondary" onPress={() => revokeViewer({ sessionId: id, viewerId: v.viewerId }).catch((e) => setErr(errorNl(e)))} />
        ))}
      </Card>
      {data.isOwner && !ended && (
        <Card>
          <P>{t('flow.session.linkTitle')}</P>
          <P muted style={{ fontSize: 14 }}>{s.privacyMode ? t('flow.session.linkPrivate') : t('flow.session.linkLive')}</P>
          <P muted>{t('flow.session.linkHow')}</P>
          <Choice label={t('flow.share.linkDuration')} value={duration} onChange={setDuration} options={LINK_DURATIONS.map((d) => ({ value: d, label: linkLabel(d) }))} />
          <Toggle value={withCode} onChange={setWithCode} title={t('flow.share.codeToggle')} hint={CODE_HINT} />
          <Notice kind="warn">{LINK_KEY_WARNING}</Notice>
          <Button title={t('flow.session.shareLink')} onPress={shareTripLink} loading={linkBusy} />
          <P muted style={{ fontSize: 14 }}>{VIEWER_ALERTS_HINT}</P>
          {linkMsg && <Notice kind="ok">{linkMsg}</Notice>}
          {linkText && <ContactComposer message={linkText} />}
          {tripLinks.length > 0 && <P>{t('flow.session.activeLinks', { count: tripLinks.length })}</P>}
          {tripLinks.map((l) => (
            <View key={l.id} style={{ gap: 6, paddingVertical: 6 }}>
              <P muted style={{ fontSize: 14 }}>
                🔗 {t('flow.session.until', { time: new Date(l.expiresAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) })}{l.duration ? ` (${linkLabel(l.duration)})` : ''}
                {l.hasCode ? (codes[l.id] ? ` · code ${codes[l.id].slice(0, 3)} ${codes[l.id].slice(3)}` : ` · ${t('flow.session.withCode')}`) : ''}
                {l.codeLocked ? ` · ${t('flow.session.locked')}` : ''}
                {l.emailSubscribers ? ` · ${l.emailSubscribers === 1 ? t('flow.session.watchers', { count: l.emailSubscribers }) : t('flow.session.watchersPlural', { count: l.emailSubscribers })}` : ''}
              </P>
              <Button title={t('flow.session.revokeLink')} variant="danger" onPress={() => revokeLink({ id: l.id }).catch((e) => setErr(errorNl(e)))} />
            </View>
          ))}
        </Card>
      )}
      {data.notifications.length > 0 && (
        <Card>
          <P>{t('flow.session.notifs')}</P>
          {data.notifications.map((n) => <P key={n.id} muted>{deliveryIcon(n.status)} {notificationKindLabel[n.kind]} → {n.name}: {deliveryLabel[n.status]}</P>)}
        </Card>
      )}
      {err && <Notice kind="danger">{err}</Notice>}
      {!ended && <SosButton sessionId={id} />}
      {!ended && <Button title={isShare ? t('flow.share.stop') : t('flow.session.stopTrip')} variant="danger" loading={stopping} onPress={stop} />}
    </Screen>
  );
}
