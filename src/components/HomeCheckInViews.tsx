import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { api } from '../../convex/_generated/api';
import { Button, Card, Field, H1, Notice, P, Screen } from './ui';
import { Choice, Toggle } from './Choice';
import { useTheme } from '../lib/theme';
import { useProfile } from '../lib/queries';
import { formatCountdown } from '../lib/safety';
import {
  HOME_EXTEND_CHOICES,
  HOME_GRACE_MINUTES,
  HOME_MAX_ACTIVE,
  HOME_QUICK_MINUTES,
  ageLabel,
  cleanLabel,
  dueFromClock,
  dueFromMinutes,
  formatDue,
  homePhase,
  type HomeStatus,
} from '../lib/homeCheckIn';
import { useLocale } from '../i18n/provider';

const PREVIEW_NOW = new Date(2026, 10, 21, 18, 0, 0, 0).getTime();

type Contact = { id: string; name: string };

function minuteLabel(m: number, tr: TFunction): string {
  if (m < 60 || m % 60 !== 0) return tr('flow.home.minShort', { n: m });
  return tr('flow.home.hourShort', { n: m / 60 });
}

function statusName(tr: TFunction, status: HomeStatus): string {
  if (status === 'confirmed') return tr('checkin.confirmedTitle');
  if (status === 'cancelled') return tr('checkin.cancelledTitle');
  if (status === 'missed') return tr('checkin.missedTitle');
  return tr('checkin.runningTitle');
}

function statusDetail(tr: TFunction, status: HomeStatus, dueAt: number, graceMinutes: number, now: number, locationKnown: boolean, number: string) {
  if (status === 'confirmed') return { title: tr('checkin.confirmedTitle'), detail: tr('checkin.confirmedDetail') };
  if (status === 'cancelled') return { title: tr('checkin.cancelledTitle'), detail: tr('checkin.cancelledDetail') };
  if (status === 'missed') {
    return {
      title: tr('checkin.missedTitle'),
      detail: locationKnown ? tr('checkin.missedKnown', { number }) : tr('checkin.missedUnknown', { number }),
    };
  }
  const phase = homePhase(dueAt, graceMinutes, now);
  if (phase === 'running') {
    return {
      title: tr('checkin.runningTitle'),
      detail: locationKnown ? tr('checkin.runningKnown') : tr('checkin.runningUnknown'),
    };
  }
  return { title: tr('checkin.dueTitle'), detail: tr('checkin.dueDetail', { minutes: graceMinutes, number }) };
}

function Stepper({ label, value, onDec, onInc, decLabel, incLabel }: {
  label: string; value: number; onDec: () => void; onInc: () => void; decLabel: string; incLabel: string;
}) {
  const t = useTheme();
  const btn = { minWidth: 48, minHeight: 48, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.field, borderWidth: 1, borderColor: t.border };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Text style={{ color: t.muted, width: 64, fontWeight: '700' }}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={decLabel} onPress={onDec} style={btn}><Text style={{ color: t.text, fontSize: 22 }}>−</Text></Pressable>
      <Text style={{ color: t.text, fontSize: 32, fontWeight: '800', minWidth: 56, textAlign: 'center' }}>{String(value).padStart(2, '0')}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={incLabel} onPress={onInc} style={btn}><Text style={{ color: t.text, fontSize: 22 }}>+</Text></Pressable>
    </View>
  );
}

export function CheckInAdultGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const profile = useProfile();
  if (profile === undefined) return <Screen><P muted>{t('flow.home.loading')}</P></Screen>;
  if (!profile) return (
    <Screen>
      <H1>{t('checkin.title')}</H1>
      <P>{t('flow.home.loginNeed')}</P>
      <Button title={t('flow.auth.loginTitle')} onPress={() => router.push('/login')} />
    </Screen>
  );
  if (profile.ageStatus !== 'adult') return (
    <Screen>
      <H1>{t('checkin.title')}</H1>
      <Notice kind="info">{t('flow.home.ageGate')}</Notice>
      <Button title={t('common.back')} variant="secondary" onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/kind'); }} />
    </Screen>
  );
  return <>{children}</>;
}

export function HomeCheckInSetupView(props: {
  now: number;
  label: string;
  onLabel: (v: string) => void;
  mode: 'clock' | 'minutes';
  onMode: (m: 'clock' | 'minutes') => void;
  hour: number;
  minute: number;
  onHour: (n: number) => void;
  onMinute: (n: number) => void;
  tomorrow: boolean;
  onTomorrow: (b: boolean) => void;
  minutes: number;
  onMinutes: (n: number) => void;
  contacts: Contact[];
  selected: string[];
  onToggle: (id: string) => void;
  onSubmit: (dueAt: number) => void;
  busy?: boolean;
  error?: string | null;
  web?: boolean;
}) {
  const { t } = useTranslation();
  const { emergencyDigits } = useLocale();
  const resolved = props.mode === 'clock'
    ? dueFromClock({ hour: props.hour, minute: props.minute, tomorrow: props.tomorrow }, props.now)
    : dueFromMinutes(props.minutes, props.now);
  const labelOk = cleanLabel(props.label) !== null;
  const canSend = resolved.ok && labelOk && props.selected.length > 0 && !props.busy;
  return (
    <Screen>
      <H1>{t('flow.home.setupTitle')}</H1>
      <P>{t('checkin.intro', { minutes: HOME_GRACE_MINUTES, number: emergencyDigits })}</P>
      <Field label={t('flow.home.desc')} value={props.label} onChangeText={props.onLabel} maxLength={40} placeholder={t('flow.home.descPh')} />
      <Choice label={t('flow.home.howTime')} value={props.mode} onChange={props.onMode} options={[{ value: 'clock', label: t('flow.home.clock') }, { value: 'minutes', label: t('flow.home.inMinutes') }]} />
      {props.mode === 'clock' ? (
        <Card>
          <Stepper label={t('flow.home.hour')} value={props.hour} decLabel={t('flow.home.hourEarlier')} incLabel={t('flow.home.hourLater')} onDec={() => props.onHour((props.hour + 23) % 24)} onInc={() => props.onHour((props.hour + 1) % 24)} />
          <Stepper label={t('flow.home.minute')} value={props.minute} decLabel={t('flow.home.minEarlier')} incLabel={t('flow.home.minLater')} onDec={() => props.onMinute((props.minute + 55) % 60)} onInc={() => props.onMinute((props.minute + 5) % 60)} />
          <Toggle value={props.tomorrow} onChange={props.onTomorrow} title={t('flow.home.tomorrow')} hint={t('flow.home.tomorrowHint')} />
        </Card>
      ) : (
        <Choice label={t('flow.home.inHowMany')} value={props.minutes} onChange={props.onMinutes} options={HOME_QUICK_MINUTES.map((m) => ({ value: m, label: minuteLabel(m, t) }))} />
      )}
      {resolved.ok && labelOk ? (
        <Notice kind="info">{t('flow.home.dueLine', { time: formatDue(resolved.dueAt, props.now), label: cleanLabel(props.label) })}</Notice>
      ) : (
        <Notice kind="warn">{!labelOk ? t('flow.home.needLabel') : resolved.ok ? '' : resolved.error}</Notice>
      )}
      <Card>
        <P>{t('flow.home.who')}</P>
        {props.contacts.length === 0 && <P muted>{t('flow.home.noContacts')}</P>}
        {props.contacts.map((c) => (
          <Button key={c.id} title={`${props.selected.includes(c.id) ? '✓ ' : ''}${c.name}`} variant={props.selected.includes(c.id) ? 'success' : 'secondary'} onPress={() => props.onToggle(c.id)} />
        ))}
        {props.contacts.length === 0 && <Button title={t('flow.home.addContacts')} variant="secondary" onPress={() => router.push('/contacts')} />}
      </Card>
      <Notice kind="info">{t('flow.home.reminder')}</Notice>
      {props.web && <Notice kind="warn">{t('flow.home.webReminder')}</Notice>}
      {props.error && <Notice kind="danger">{props.error}</Notice>}
      <Button title={t('flow.home.start')} variant="success" disabled={!canSend} loading={props.busy} onPress={() => { if (resolved.ok) props.onSubmit(resolved.dueAt); }} />
    </Screen>
  );
}

export function HomeCheckInStatusView(props: {
  label: string;
  status: HomeStatus;
  dueAt: number;
  graceMinutes: number;
  extensions: number;
  now: number;
  locationKnown: boolean;
  locationAt?: number;
  viewerNames: string[];
  onHome?: () => void;
  onExtend?: (minutes: number) => void;
  onCancel?: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { emergencyDigits } = useLocale();
  const copy = statusDetail(t, props.status, props.dueAt, props.graceMinutes, props.now, props.locationKnown, emergencyDigits);
  const pending = props.status === 'pending';
  const left = props.dueAt - props.now;
  const urgent = !pending || left < props.graceMinutes * 60_000;
  const name = statusName(t, props.status);
  return (
    <Screen>
      <H1>{props.label}</H1>
      <P muted>{name} · {formatDue(props.dueAt, props.now)}</P>
      <Card style={urgent && props.status !== 'confirmed' && props.status !== 'cancelled' ? { borderColor: '#EF4444', borderWidth: 2 } : undefined}>
        <Text style={{ fontSize: 40, fontWeight: '800', color: theme.text }}>{pending ? formatCountdown(left) : name}</Text>
        <P>{copy.title}</P>
        <P muted>{copy.detail}</P>
        {props.locationKnown && props.locationAt ? <P muted>{t('flow.home.lastLoc', { age: ageLabel(props.locationAt, props.now) })}</P> : null}
        {!props.locationKnown && pending ? <P muted>{t('flow.home.noLocYet')}</P> : null}
      </Card>
      {props.viewerNames.length > 0 && <P muted>{t('flow.home.contactsLine', { names: props.viewerNames.join(', ') })}</P>}
      {(pending || props.status === 'missed') && props.onHome && (
        <Button title={props.status === 'missed' ? t('flow.home.homeLate') : t('flow.home.homeNow')} variant="success" onPress={props.onHome} loading={props.busy} />
      )}
      {pending && props.onExtend && HOME_EXTEND_CHOICES.map((m) => (
        <Button key={m} title={t('flow.home.extend', { n: m })} variant="secondary" disabled={props.extensions >= 3 || props.busy} onPress={() => props.onExtend?.(m)} />
      ))}
      {pending && props.extensions >= 3 && <P muted>{t('flow.home.extendMax')}</P>}
      {pending && props.onCancel && <Button title={t('common.cancel')} variant="secondary" disabled={props.busy} onPress={props.onCancel} />}
      {props.error && <Notice kind="danger">{props.error}</Notice>}
      <Notice kind="info">{t('checkin.honest', { number: emergencyDigits })}</Notice>
      <Button title={t('flow.home.allList')} variant="secondary" onPress={() => router.replace('/check-in')} />
    </Screen>
  );
}

export function previewSetupNow() { return PREVIEW_NOW; }

export function previewStatus(staat: string | undefined): {
  status: HomeStatus; dueAt: number; now: number; locationKnown: boolean; locationAt?: number;
} {
  if (staat === 'thuis') return { status: 'confirmed', dueAt: PREVIEW_NOW - 5 * 60_000, now: PREVIEW_NOW, locationKnown: true, locationAt: PREVIEW_NOW - 6 * 60_000 };
  if (staat === 'gemist') return { status: 'missed', dueAt: PREVIEW_NOW - 8 * 60_000, now: PREVIEW_NOW, locationKnown: false };
  return { status: 'pending', dueAt: PREVIEW_NOW + 42 * 60_000 + 10_000, now: PREVIEW_NOW, locationKnown: true, locationAt: PREVIEW_NOW - 2 * 60_000 };
}

export function HomeCheckInDash({ now }: { now: number }) {
  const { t } = useTranslation();
  const data = useQuery(api.homeCheckIn.mine);
  const attention = [...(data?.pending ?? []), ...(data?.recent ?? []).filter((r) => r.status === 'missed')];
  if (attention.length === 0) return null;
  return (
    <View style={{ gap: 10 }}>
      {attention.map((c) => (
        <Card key={c._id} style={c.status === 'missed' ? { borderColor: '#EF4444', borderWidth: 2 } : undefined}>
          <P>{c.status === 'missed' ? t('flow.home.missedDash') : t('flow.home.runningDash')}</P>
          <P muted>{c.status === 'pending'
            ? t('flow.home.left', { label: c.label, time: formatDue(c.dueAt, now), left: formatCountdown(c.dueAt - now) })
            : t('flow.home.noLeft', { label: c.label, time: formatDue(c.dueAt, now) })}</P>
          <Button title={c.status === 'missed' ? t('flow.home.viewConfirm') : t('flow.home.openCheck')} onPress={() => router.push(`/check-in/${c._id}`)} />
        </Card>
      ))}
      {(data?.pending.length ?? 0) >= HOME_MAX_ACTIVE && <P muted>{t('flow.home.maxRunning', { max: HOME_MAX_ACTIVE })}</P>}
    </View>
  );
}
