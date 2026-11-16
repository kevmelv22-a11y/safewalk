import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useQuery } from 'convex/react';
import { router } from 'expo-router';
import { api } from '../../convex/_generated/api';
import { Screen, H1, P, Button, Card, Notice } from '../../src/components/ui';
import { Toggle } from '../../src/components/Choice';
import { useProfile } from '../../src/lib/queries';
import {
  AUTO_SMS_MAX_RECIPIENTS, AUTO_SMS_MAX_ROUNDS, autoSmsAgeOk, getAutoSmsOptIn, getAutoSmsPhones,
  hasSendSmsPermission, requestSendSmsPermission, setAutoSmsOptIn, setAutoSmsPhones,
} from '../../src/lib/autoSms';
import { AUTO_SMS_COPY } from '../../src/content/longShare';
import { e164Digits } from '../../src/lib/composer';

export default function AutoSmsSettings() {
  const profile = useProfile();
  const childLink = useQuery(api.childLinks.myLink);
  const saved = useQuery(api.deviceContacts.list) ?? [];
  const linked = !!childLink;
  const ageOk = autoSmsAgeOk(profile?.ageStatus, linked);
  const [optIn, setOptIn] = useState(false);
  const [phones, setPhones] = useState<string[]>([]);
  const [perm, setPerm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const android = Platform.OS === 'android';

  useEffect(() => { void getAutoSmsOptIn().then(setOptIn); }, []);
  useEffect(() => { void getAutoSmsPhones().then(setPhones); }, []);
  useEffect(() => { void hasSendSmsPermission().then(setPerm); }, []);

  const togglePhone = (raw: string) => {
    try {
      const p = e164Digits(raw);
      const next = phones.includes(p) ? phones.filter((x) => x !== p) : [...phones, p].slice(0, AUTO_SMS_MAX_RECIPIENTS);
      setPhones(next);
      void setAutoSmsPhones(next);
    } catch { /* ongeldig */ }
  };

  const onToggle = async (v: boolean) => {
    setMsg(null);
    if (!v) { setOptIn(false); await setAutoSmsOptIn(false); return; }
    if (!android) { setMsg(AUTO_SMS_COPY.notAndroid); return; }
    if (!ageOk) { setMsg(AUTO_SMS_COPY.ageBlocked); return; }
    const ok = perm || await requestSendSmsPermission();
    setPerm(ok);
    if (!ok) { setOptIn(false); await setAutoSmsOptIn(false); setMsg(AUTO_SMS_COPY.permissionDenied); return; }
    if (phones.length === 0) { setMsg(AUTO_SMS_COPY.noRecipients); }
    setOptIn(true);
    await setAutoSmsOptIn(true);
  };

  return (
    <Screen>
      <H1>{AUTO_SMS_COPY.title}</H1>
      <P muted>{AUTO_SMS_COPY.hint}</P>
      <Notice kind="warn">{AUTO_SMS_COPY.cost}</Notice>
      <Notice kind="info">{AUTO_SMS_COPY.playRisk}</Notice>
      {!android && <Notice kind="info">{AUTO_SMS_COPY.notAndroid}</Notice>}
      {!ageOk && profile && <Notice kind="warn">{AUTO_SMS_COPY.ageBlocked}</Notice>}
      <Card>
        <Toggle
          value={optIn && android && ageOk}
          onChange={(v) => { void onToggle(v); }}
          title="Automatische sms-updates aanzetten"
          hint={`Elke 10 minuten, maximaal ${AUTO_SMS_MAX_ROUNDS} sms’jes per contact per keer, maximaal ${AUTO_SMS_MAX_RECIPIENTS} contacten. Stopt bij internet of als jij stopt. Uit standaard.`}
        />
        {android && <P muted>Sms-toestemming: {perm ? 'gegeven' : 'nog niet gegeven'}.</P>}
        {android && !perm && (
          <Button title="Sms-toestemming vragen" variant="secondary" onPress={() => { void requestSendSmsPermission().then(setPerm); }} />
        )}
      </Card>
      <Card>
        <P>{AUTO_SMS_COPY.recipients}</P>
        <P muted>{AUTO_SMS_COPY.noRecipients}</P>
        {saved.length === 0 && (
          <Button title="Telefooncontacten kiezen" variant="secondary" onPress={() => router.push('/device-contacts')} />
        )}
        {saved.map((c) => {
          let e164 = '';
          try { e164 = e164Digits(c.phoneE164); } catch { return null; }
          const on = phones.includes(e164);
          return (
            <Button
              key={c._id}
              title={`${on ? '✓ ' : ''}${c.displayName}`}
              variant={on ? 'success' : 'secondary'}
              onPress={() => togglePhone(c.phoneE164)}
            />
          );
        })}
      </Card>
      {msg && <Notice kind="danger">{msg}</Notice>}
      <Button title="Terug" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}
