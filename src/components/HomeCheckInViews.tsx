import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from 'convex/react';
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
  statusCopy,
  statusLabel,
  type HomeStatus,
} from '../lib/homeCheckIn';

const PREVIEW_NOW = new Date(2026, 10, 21, 18, 0, 0, 0).getTime();

type Contact = { id: string; name: string };

function minuteLabel(m: number): string {
  if (m < 60) return `${m} min`;
  if (m % 60 === 0) return `${m / 60} uur`;
  return `${m} min`;
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
  const profile = useProfile();
  if (profile === undefined) return <Screen><P muted>Laden…</P></Screen>;
  if (!profile) return (
    <Screen>
      <H1>Thuis-check-in</H1>
      <P>Log in om een thuis-check-in te starten.</P>
      <Button title="Inloggen" onPress={() => router.push('/login')} />
    </Screen>
  );
  if (profile.ageStatus !== 'adult') return (
    <Screen>
      <H1>Thuis-check-in</H1>
      <Notice kind="info">Dit is er vanaf 16 jaar. Het kan je laatst bekende locatie naar contacten sturen die jij kiest, en dat blijft onder 16 dicht. In kindermodus gebruik je “Ik ben veilig thuis”: dat seintje gaat naar je ouder.</Notice>
      <Button title="Terug" variant="secondary" onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/kind'); }} />
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
  const resolved = props.mode === 'clock'
    ? dueFromClock({ hour: props.hour, minute: props.minute, tomorrow: props.tomorrow }, props.now)
    : dueFromMinutes(props.minutes, props.now);
  const labelOk = cleanLabel(props.label) !== null;
  const canSend = resolved.ok && labelOk && props.selected.length > 0 && !props.busy;
  return (
    <Screen>
      <H1>Ik ben om … thuis</H1>
      <P>Kies hoe laat je thuis denkt te zijn. Bevestig je dat niet, dan krijgen je gekozen contacten na {HOME_GRACE_MINUTES} minuten respijt een melding. SafeWalk helpt je dat seintje te sturen. Het is geen vervanging voor 112.</P>
      <Field label="Omschrijving" value={props.label} onChangeText={props.onLabel} maxLength={40} placeholder="Thuis" />
      <Choice label="Hoe wil je de tijd kiezen?" value={props.mode} onChange={props.onMode} options={[{ value: 'clock', label: 'Tijdstip' }, { value: 'minutes', label: 'Over … minuten' }]} />
      {props.mode === 'clock' ? (
        <Card>
          <Stepper label="Uur" value={props.hour} decLabel="Uur eerder" incLabel="Uur later" onDec={() => props.onHour((props.hour + 23) % 24)} onInc={() => props.onHour((props.hour + 1) % 24)} />
          <Stepper label="Minuut" value={props.minute} decLabel="5 minuten eerder" incLabel="5 minuten later" onDec={() => props.onMinute((props.minute + 55) % 60)} onInc={() => props.onMinute((props.minute + 5) % 60)} />
          <Toggle value={props.tomorrow} onChange={props.onTomorrow} title="Morgen" hint="Zet aan als je na middernacht thuis bent. Een tijd die vandaag al voorbij is, wordt niet stil op morgen gezet." />
        </Card>
      ) : (
        <Choice label="Over hoeveel minuten ben je thuis?" value={props.minutes} onChange={props.onMinutes} options={HOME_QUICK_MINUTES.map((m) => ({ value: m, label: minuteLabel(m) }))} />
      )}
      {resolved.ok && labelOk ? (
        <Notice kind="info">{`Ik ben om ${formatDue(resolved.dueAt, props.now)} thuis (${cleanLabel(props.label)}).`}</Notice>
      ) : (
        <Notice kind="warn">{!labelOk ? 'Vul een korte omschrijving in, bijvoorbeeld Thuis.' : resolved.ok ? '' : resolved.error}</Notice>
      )}
      <Card>
        <P>Wie krijgt een melding als je niet bevestigt?</P>
        {props.contacts.length === 0 && <P muted>Je hebt nog geen vertrouwde contacten. Zonder contact kan deze check-in niet starten.</P>}
        {props.contacts.map((c) => (
          <Button key={c.id} title={`${props.selected.includes(c.id) ? '✓ ' : ''}${c.name}`} variant={props.selected.includes(c.id) ? 'success' : 'secondary'} onPress={() => props.onToggle(c.id)} />
        ))}
        {props.contacts.length === 0 && <Button title="Contacten toevoegen" variant="secondary" onPress={() => router.push('/contacts')} />}
      </Card>
      <Notice kind="info">Je krijgt eerst zelf een herinnering, ongeveer een minuut van tevoren, als meldingen aanstaan. De server bewaakt de tijd ook als SafeWalk dicht is. Aflevering is niet zeker. Zonder recente locatie zeggen we dat de plek onbekend is.</Notice>
      {props.web && <Notice kind="warn">In de browser komt die herinnering op dit apparaat niet aan. Gebruik de telefoon-app als je zelf een seintje wilt. Contacten krijgen alleen iets als zij SafeWalk met meldingen gebruiken.</Notice>}
      {props.error && <Notice kind="danger">{props.error}</Notice>}
      <Button title="Start thuis-check-in" variant="success" disabled={!canSend} loading={props.busy} onPress={() => { if (resolved.ok) props.onSubmit(resolved.dueAt); }} />
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
  const t = useTheme();
  const copy = statusCopy({ status: props.status, dueAt: props.dueAt, graceMinutes: props.graceMinutes, now: props.now, locationKnown: props.locationKnown });
  const pending = props.status === 'pending';
  const left = props.dueAt - props.now;
  const urgent = !pending || left < props.graceMinutes * 60_000;
  return (
    <Screen>
      <H1>{props.label}</H1>
      <P muted>{statusLabel(props.status)} · {formatDue(props.dueAt, props.now)}</P>
      <Card style={urgent && props.status !== 'confirmed' && props.status !== 'cancelled' ? { borderColor: '#EF4444', borderWidth: 2 } : undefined}>
        <Text style={{ fontSize: 40, fontWeight: '800', color: t.text }}>{pending ? formatCountdown(left) : statusLabel(props.status)}</Text>
        <P>{copy.title}</P>
        <P muted>{copy.detail}</P>
        {props.locationKnown && props.locationAt ? <P muted>Laatst bekende locatie: {ageLabel(props.locationAt, props.now)}. Die kan verouderd zijn.</P> : null}
        {!props.locationKnown && pending ? <P muted>Nog geen locatie. Bij een melding staat dat de plek onbekend is.</P> : null}
      </Card>
      {props.viewerNames.length > 0 && <P muted>Contacten: {props.viewerNames.join(', ')}</P>}
      {(pending || props.status === 'missed') && props.onHome && (
        <Button title={props.status === 'missed' ? 'Ik ben alsnog thuis' : 'Ik ben thuis'} variant="success" onPress={props.onHome} loading={props.busy} />
      )}
      {pending && props.onExtend && HOME_EXTEND_CHOICES.map((m) => (
        <Button key={m} title={`+${m} minuten`} variant="secondary" disabled={props.extensions >= 3 || props.busy} onPress={() => props.onExtend?.(m)} />
      ))}
      {pending && props.extensions >= 3 && <P muted>Je hebt al 3 keer verlengd. Bevestig dat je thuis bent, of annuleer.</P>}
      {pending && props.onCancel && <Button title="Annuleren" variant="secondary" disabled={props.busy} onPress={props.onCancel} />}
      {props.error && <Notice kind="danger">{props.error}</Notice>}
      <Notice kind="info">Dit helpt je contacten. Het is geen vervanging voor 112, en SafeWalk controleert niet of je echt thuis bent.</Notice>
      <Button title="Alle thuis-check-ins" variant="secondary" onPress={() => router.replace('/check-in')} />
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
  const data = useQuery(api.homeCheckIn.mine);
  const attention = [...(data?.pending ?? []), ...(data?.recent ?? []).filter((r) => r.status === 'missed')];
  if (attention.length === 0) return null;
  return (
    <View style={{ gap: 10 }}>
      {attention.map((c) => (
        <Card key={c._id} style={c.status === 'missed' ? { borderColor: '#EF4444', borderWidth: 2 } : undefined}>
          <P>{c.status === 'missed' ? 'Thuis-check-in niet bevestigd' : 'Thuis-check-in loopt'}</P>
          <P muted>{c.label} · {formatDue(c.dueAt, now)}{c.status === 'pending' ? ` · nog ${formatCountdown(c.dueAt - now)}` : ''}</P>
          <Button title={c.status === 'missed' ? 'Bekijk en bevestig alsnog' : 'Open check-in'} onPress={() => router.push(`/check-in/${c._id}`)} />
        </Card>
      ))}
      {(data?.pending.length ?? 0) >= HOME_MAX_ACTIVE && <P muted>Je hebt het maximum van {HOME_MAX_ACTIVE} lopende thuis-check-ins.</P>}
    </View>
  );
}
