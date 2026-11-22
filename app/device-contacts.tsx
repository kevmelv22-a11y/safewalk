import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Screen, H1, P, Button, Card, Notice } from '../src/components/ui';
import { errorNl } from '../src/lib/convex';
import { useTheme } from '../src/lib/theme';

type Row = { id: string; name: string; phone: string; selected: boolean };

/** Telefooncontacten: expliciete toestemming, alleen aangevinkte nummers bewaren. */
export default function DeviceContactsScreen() {
  const t = useTheme();
  const saved = useQuery(api.deviceContacts.list) ?? [];
  const replace = useMutation(api.deviceContacts.replaceSelection);
  const remove = useMutation(api.deviceContacts.remove);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setErr(null); setMsg(null);
    if (Platform.OS === 'web') {
      setErr('Telefooncontacten zijn op web niet beschikbaar. Gebruik iOS/Android.');
      return;
    }
    try {
      const { Contact, ContactField, ContactsSortOrder, requestPermissionsAsync } = await import('expo-contacts');
      const perm = await requestPermissionsAsync();
      if (!perm.granted) {
        setErr('Geen toestemming voor contacten. Zonder toestemming laden we niets.');
        return;
      }
      const list = await Contact.getAllDetails(
        [ContactField.FULL_NAME, ContactField.PHONES],
        { limit: 200, sortOrder: ContactsSortOrder.GivenName },
      );
      const mapped: Row[] = [];
      for (const c of list) {
        const phone = c.phones?.find((p: { number?: string | null }) => p.number)?.number;
        if (!phone) continue;
        mapped.push({
          id: `${c.fullName ?? ''}-${phone}`,
          name: (c.fullName as string | undefined)?.trim() || phone,
          phone,
          selected: false,
        });
      }
      setRows(mapped);
      setMsg(`${mapped.length} contacten met telefoonnummer geladen. Vink aan wie je wilt bewaren.`);
    } catch (e) {
      setErr('Contacten konden niet worden geladen: ' + errorNl(e));
    }
  };

  const save = async () => {
    if (!rows) return;
    setBusy(true); setErr(null);
    try {
      const selected = rows.filter((r) => r.selected).map((r) => ({ displayName: r.name, phone: r.phone }));
      const r = await replace({ contacts: selected });
      setMsg(`${r.saved} contacten opgeslagen (alleen aangevinkte).`);
      setRows(null);
    } catch (e) { setErr(errorNl(e)); }
    finally { setBusy(false); }
  };

  return (
    <Screen>
      <H1>Telefooncontacten</H1>
      <P muted>Alleen als jij dit adresboek opent, vragen we toestemming. Handmatig toevoegen (naam, nummer of e-mail) doe je bij Vertrouwde contacten, zonder adresboek. We bewaren alleen wat jij aanvinkt of zelf invult.</P>
      <Notice kind="warn">Volume 2× voor live locatie is op iOS/Android in de achtergrond niet betrouwbaar in Expo managed. Alternatieven: in-app knop, OS-shortcuts/Quick Settings (zie docs/engineering.md).</Notice>
      <Button title="Contacten laden (toestemming)" onPress={load} />
      {msg && <Notice kind="ok">{msg}</Notice>}
      {err && <Notice kind="danger">{err}</Notice>}
      {rows && (
        <>
          {rows.slice(0, 80).map((r) => (
            <Pressable key={r.id} accessibilityRole="checkbox" accessibilityState={{ checked: r.selected }}
              onPress={() => setRows((all) => all!.map((x) => x.id === r.id ? { ...x, selected: !x.selected } : x))}
              style={{ flexDirection: 'row', gap: 12, padding: 12, backgroundColor: t.card, borderRadius: 12, borderWidth: 1, borderColor: t.border }}>
              <Text style={{ fontSize: 20 }}>{r.selected ? '☑' : '☐'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontWeight: '700' }}>{r.name}</Text>
                <Text style={{ color: t.muted }}>{r.phone}</Text>
              </View>
            </Pressable>
          ))}
          <Button title="Selectie opslaan" onPress={save} loading={busy} />
        </>
      )}
      <H1>Opgeslagen</H1>
      {saved.length === 0 && <P muted>Nog geen opgeslagen telefooncontacten.</P>}
      {saved.map((s) => (
        <Card key={s._id}>
          <P>{s.displayName}</P>
          {s.phoneE164 ? <P muted>{s.phoneE164}</P> : null}
          {s.email ? <P muted>{s.email}</P> : null}
          <Button title="Verwijderen" variant="secondary" onPress={() => remove({ id: s._id })} />
        </Card>
      ))}
    </Screen>
  );
}
