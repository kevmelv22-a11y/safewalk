import { useState, useEffect } from 'react';
import { useNow } from '../../src/lib/useLiveLocations';
import { router } from 'expo-router';
import { Platform, Share } from 'react-native';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { useTranslation } from 'react-i18next';
import { Screen, H1, P, Button, Notice, Card } from '../../src/components/ui';
import { Choice, Toggle } from '../../src/components/Choice';
import { LiveDisclosure } from '../../src/components/LiveDisclosure';
import { useContacts, useProfile } from '../../src/lib/queries';
import { errorNl } from '../../src/lib/convex';
import { validateShareInput } from '../../src/lib/safety';
import { useLinkCodes } from '../../src/store/linkCodes';
import { sharingMode, startSharing, untilFor } from '../../src/lib/location';
import { localNotify } from '../../src/lib/notifications';
import { acceptDisclosure, disclosureAccepted } from '../../src/lib/liveDisclosure';
import { tripLinkMessage } from '../../src/lib/composer';
import { CODE_HINT, LINK_KEY_WARNING, LINK_ONLY_HINT, VIEWER_ALERTS_HINT } from '../../src/content/liveSharing';
import { LINK_DURATIONS, type LinkDuration } from '../../convex/liveShare';
import { SHARE_DURATIONS, type ShareDuration, shareExpiry } from '../../convex/longShare';
import { useLocale } from '../../src/i18n/provider';

export default function Delen() {
  const { t } = useTranslation();
  const { emergencyDigits } = useLocale();
  const begin = useMutation(api.sessions.begin);
  const contacts = useContacts()?.mine ?? [];
  const profile = useProfile();
  const putCode = useLinkCodes((s) => s.put);
  const [duration, setDuration] = useState<ShareDuration>('4h');
  const [sel, setSel] = useState<Id<'users'>[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [withLink, setWithLink] = useState(false);
  const [linkTouched, setLinkTouched] = useState(false);
  const [linkDuration, setLinkDuration] = useState<LinkDuration>('arrival');
  const [withCode, setWithCode] = useState(false);
  const [disclose, setDisclose] = useState(false);
  const now = useNow(15_000);
  const { endsAt, untilStop } = shareExpiry(duration, now);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- standaardkeuze volgt de (later geladen) contactenlijst
  useEffect(() => { if (!linkTouched) setWithLink(contacts.length === 0); }, [contacts.length, linkTouched]);

  const toggle = (id: Id<'users'>) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const shareLabel = (d: ShareDuration) => t(d === '1h' ? 'flow.share.d1' : d === '4h' ? 'flow.share.d4' : d === '8h' ? 'flow.share.d8' : d === '24h' ? 'flow.share.d24' : 'flow.share.untilStop');
  const linkLabel = (d: LinkDuration) => t(d === '15m' ? 'flow.share.l15' : d === '1h' ? 'flow.share.l1' : d === 'arrival' ? 'flow.share.arrival' : 'flow.share.d8');

  const ask = async () => {
    setErr(null);
    if (profile && profile.ageStatus !== 'adult') return setErr(t('flow.share.ageBlocked'));
    const v = validateShareInput({ arrival: new Date(endsAt), viewerIds: sel, withLink });
    if (v) return setErr(v);
    if (await disclosureAccepted()) return start();
    setDisclose(true);
  };

  const start = async () => {
    setBusy(true); setErr(null);
    const label = untilStop ? `${t('flow.share.title')} (${t('flow.share.untilStop')})` : t('flow.share.title');
    let id: Id<'sessions'>; let link: Awaited<ReturnType<typeof begin>>['link'] = null;
    try {
      const r = await begin({
        kind: 'share',
        destination: label,
        viewerIds: sel,
        expectedArrival: endsAt,
        shareUntilStop: untilStop,
        ...(withLink ? { link: { duration: linkDuration, withCode, locationConsent: true } } : {}),
      });
      id = r.sessionId; link = r.link;
    } catch (e) { setBusy(false); return setErr(errorNl(e)); }
    if (link?.accessCode) putCode(link.id, link.accessCode);
    let shared = true;
    try { await startSharing(id, { until: untilFor(endsAt) }); }
    catch { shared = false; }
    await localNotify(t('flow.share.started'), !shared
      ? t('flow.share.notYet')
      : sharingMode() === 'background'
        ? t('flow.share.bg')
        : t('flow.share.fg')).catch(() => {});
    if (link) {
      const site = process.env.EXPO_PUBLIC_CONVEX_SITE_URL?.replace(/\/$/, '') ?? '';
      const text = tripLinkMessage(`${site}${link.path}`);
      try {
        if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) await navigator.clipboard.writeText(text);
        else await Share.share({ message: text });
      } catch { /* later delen vanaf het sessiescherm */ }
    }
    setBusy(false);
    router.replace(`/session/${id}`);
  };

  return (
    <Screen>
      <H1>{t('flow.share.title')}</H1>
      <P muted>{t('flow.share.intro', { number: emergencyDigits })}</P>
      <P>{t('flow.share.howLong')}</P>
      <Choice
        label={t('flow.share.duration')}
        value={duration}
        onChange={setDuration}
        options={SHARE_DURATIONS.map((d) => ({ value: d, label: shareLabel(d) }))}
      />
      <P muted>{untilStop ? t('flow.share.untilStopHint') : t('flow.share.limitHint')}</P>
      <P muted>{untilStop ? t('flow.share.activeUntilStop') : t('flow.share.activeUntil')}{' '}
        {new Date(endsAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', weekday: 'short' })}
      </P>

      <Card>
        <P>{t('flow.share.who')}</P>
        {contacts.length === 0 && <P muted>{t('flow.share.noContacts')} {LINK_ONLY_HINT}</P>}
        {contacts.map((c) => (
          <Button key={c.userId} title={`${sel.includes(c.userId) ? '✓ ' : ''}${c.name}`} variant={sel.includes(c.userId) ? 'success' : 'secondary'} onPress={() => toggle(c.userId)} />
        ))}
      </Card>

      <Card>
        <Toggle value={withLink} onChange={(v) => { setLinkTouched(true); setWithLink(v); }} title={t('flow.share.linkToggle')} hint={t('flow.share.linkHint')} />
        {withLink && (<>
          <P muted>{t('flow.share.linkHow')}</P>
          <Choice label={t('flow.share.linkDuration')} value={linkDuration} onChange={setLinkDuration} options={LINK_DURATIONS.map((d) => ({ value: d, label: linkLabel(d) }))} />
          <Toggle value={withCode} onChange={setWithCode} title={t('flow.share.codeToggle')} hint={CODE_HINT} />
          <Notice kind="warn">{LINK_KEY_WARNING}</Notice>
          <P muted>{VIEWER_ALERTS_HINT}</P>
        </>)}
      </Card>

      {err && <Notice kind="danger">{err}</Notice>}
      <Button title={t('flow.share.start')} onPress={() => { void ask(); }} loading={busy} />
      <Button title={t('common.cancel')} variant="secondary" onPress={() => router.back()} />
      <LiveDisclosure visible={disclose} privacyMode={false} onAccept={() => { void acceptDisclosure().then(() => { setDisclose(false); void start(); }); }} onCancel={() => setDisclose(false)} />
    </Screen>
  );
}
