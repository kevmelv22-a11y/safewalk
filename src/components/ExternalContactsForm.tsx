import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { Button, Card, Field, Notice, P } from './ui';
import { errorNl } from '../lib/convex';

/**
 * Handmatige contacten. Geen adresboek-permissie en geen account van de ontvanger.
 * Opslaan stuurt geen bericht.
 */
export function ExternalContactsForm() {
  const rows = useQuery(api.deviceContacts.list);
  const save = useMutation(api.deviceContacts.saveManual);
  const remove = useMutation(api.deviceContacts.remove);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [editing, setEditing] = useState<Id<'deviceContacts'> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const manual = (rows ?? []).filter((r) => r.manual);

  const reset = () => { setName(''); setPhone(''); setEmail(''); setEditing(null); };

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await save({
        id: editing ?? undefined,
        displayName: name,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
      });
      reset();
    } catch (e) { setErr(errorNl(e)); }
    finally { setBusy(false); }
  };

  return (
    <Card>
      <P>Contact zonder app</P>
      <P muted>Vul zelf een naam en een telefoonnummer of e-mailadres in. Die persoon heeft geen SafeWalk-account nodig. Dit scherm vraagt geen toegang tot je adresboek en verstuurt niets.</P>
      <Notice kind="info">Sms, WhatsApp en e-mail gaan pas weg als jij later zelf op Verstuur tikt in je berichten-app. Automatische pushes en meekijken in de app gelden alleen voor mensen die een uitnodiging accepteren. Een live kaart zonder app is alleen de tijdelijke tracking-link die jij deelt.</Notice>
      <Field label="Naam" value={name} onChangeText={setName} autoCapitalize="words" />
      <Field label="Telefoon (optioneel als je e-mail invult)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoCapitalize="none" />
      <Field label="E-mail (optioneel als je een nummer invult)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
      <Button title={editing ? 'Wijziging opslaan' : 'Contact opslaan'} onPress={submit} loading={busy} disabled={!name.trim() || (!phone.trim() && !email.trim())} />
      {editing && <Button title="Annuleren" variant="secondary" onPress={reset} />}
      {err && <Notice kind="danger">{err}</Notice>}
      {manual.map((c) => (
        <Card key={c._id}>
          <P>{c.displayName}</P>
          {c.phoneE164 ? <P muted>{c.phoneE164}</P> : null}
          {c.email ? <P muted>{c.email}</P> : null}
          <P muted>Geen account. Nog niets verstuurd.</P>
          <Button title="Wijzigen" variant="secondary" onPress={() => { setEditing(c._id); setName(c.displayName); setPhone(c.phoneE164 ?? ''); setEmail(c.email ?? ''); setErr(null); }} />
          <Button title="Verwijderen" variant="secondary" onPress={() => remove({ id: c._id }).catch((e) => setErr(errorNl(e)))} />
        </Card>
      ))}
    </Card>
  );
}
