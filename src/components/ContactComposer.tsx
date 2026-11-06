import { useState } from 'react';
import { Linking, Platform } from 'react-native';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Button, Card, Notice, P } from './ui';
import { MAX_SMS_RECIPIENTS, smsUrl, whatsappUrl } from '../lib/composer';

/**
 * Sends ONE prepared message to phone contacts the user ticks here. Opens the SMS/WhatsApp composer;
 * the user confirms Send in that app. SafeWalk never sends SMS/WhatsApp itself.
 */
export function ContactComposer({ message }: { message: string }) {
  const contacts = useQuery(api.deviceContacts.list) ?? [];
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<string | null>(null);
  const picked = contacts.filter((c) => chosen[c._id]);
  const open = async (url: string) => {
    setErr(null);
    try {
      if (!(await Linking.canOpenURL(url)) && !url.startsWith('https://')) throw new Error('NO_APP');
      await Linking.openURL(url);
    } catch { setErr('Kon de berichten-app niet openen. Gebruik “Delen” of kopieer de link.'); }
  };
  if (contacts.length === 0) {
    return <P muted>Nog geen telefooncontacten gekozen. Kies ze bij Telefooncontacten om ze hier een sms of WhatsApp te sturen.</P>;
  }
  return (
    <Card>
      <P>Stuur deze link aan telefooncontacten (jij tikt zelf op Verstuur):</P>
      <P muted>{message}</P>
      {contacts.map((c) => (
        <Button key={c._id} variant="secondary"
          title={`${chosen[c._id] ? '☑' : '☐'} ${c.displayName} (${c.phoneE164})`}
          onPress={() => setChosen((s) => ({ ...s, [c._id]: !s[c._id] }))} />
      ))}
      <Button title={`SMS openen voor ${picked.length} contact(en)`} disabled={picked.length === 0 || picked.length > MAX_SMS_RECIPIENTS}
        onPress={() => open(smsUrl(Platform.OS, picked.map((c) => c.phoneE164), message))} />
      {picked.map((c) => (
        <Button key={`wa-${c._id}`} variant="secondary" title={`WhatsApp: ${c.displayName}`} onPress={() => open(whatsappUrl(c.phoneE164, message))} />
      ))}
      {picked.length > MAX_SMS_RECIPIENTS && <Notice kind="warn">Maximaal {MAX_SMS_RECIPIENTS} ontvangers per sms.</Notice>}
      {err && <Notice kind="danger">{err}</Notice>}
    </Card>
  );
}
