import { useState } from 'react';
import { Linking, Platform } from 'react-native';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Button, Card, Notice, P } from './ui';
import { mailtoUrl, MAX_SMS_RECIPIENTS, smsUrl, whatsappUrl } from '../lib/composer';

/**
 * Sends ONE prepared message to phone contacts the user ticks here. Opens the SMS/WhatsApp composer;
 * the user confirms Send in that app. SafeWalk never sends SMS/WhatsApp itself.
 */
export function ContactComposer({ message }: { message: string }) {
  const contacts = useQuery(api.deviceContacts.list) ?? [];
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<string | null>(null);
  const picked = contacts.filter((c) => chosen[c._id]);
  const pickedPhones = picked.filter((c) => c.phoneE164);
  const open = async (url: string) => {
    setErr(null);
    try {
      if (!(await Linking.canOpenURL(url)) && !url.startsWith('https://') && !url.startsWith('mailto:')) throw new Error('NO_APP');
      await Linking.openURL(url);
    } catch { setErr('Kon de berichten-app niet openen. Gebruik “Delen” of kopieer de link.'); }
  };
  if (contacts.length === 0) {
    return <P muted>Nog geen contacten om te kiezen. Voeg iemand handmatig toe bij Vertrouwde contacten, of kies telefooncontacten. SafeWalk verstuurt de link niet zelf.</P>;
  }
  return (
    <Card>
      <P>Kies wie de link krijgt. Jij tikt daarna zelf op Verstuur in sms, WhatsApp of mail. SafeWalk verstuurt niets automatisch.</P>
      <P muted>{message}</P>
      {contacts.map((c) => (
        <Button key={c._id} variant="secondary"
          title={`${chosen[c._id] ? '☑' : '☐'} ${c.displayName}${c.phoneE164 ? ` (${c.phoneE164})` : ''}${c.email ? ` (${c.email})` : ''}`}
          onPress={() => setChosen((s) => ({ ...s, [c._id]: !s[c._id] }))} />
      ))}
      <Button title={`SMS openen voor ${pickedPhones.length} nummer(s)`} disabled={pickedPhones.length === 0 || pickedPhones.length > MAX_SMS_RECIPIENTS}
        onPress={() => open(smsUrl(Platform.OS, pickedPhones.map((c) => c.phoneE164!), message))} />
      {pickedPhones.map((c) => (
        <Button key={`wa-${c._id}`} variant="secondary" title={`WhatsApp openen: ${c.displayName}`} onPress={() => open(whatsappUrl(c.phoneE164!, message))} />
      ))}
      {picked.filter((c) => c.email).map((c) => (
        <Button key={`mail-${c._id}`} variant="secondary" title={`E-mail openen: ${c.displayName}`} onPress={() => open(mailtoUrl(c.email!, message))} />
      ))}
      {pickedPhones.length > MAX_SMS_RECIPIENTS && <Notice kind="warn">Maximaal {MAX_SMS_RECIPIENTS} ontvangers per sms.</Notice>}
      {err && <Notice kind="danger">{err}</Notice>}
    </Card>
  );
}
