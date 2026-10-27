import { useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useMutation, useQuery } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { api } from '../convex/_generated/api';
import { Screen, H1, P, Button, Card, Notice } from '../src/components/ui';
import { SafetySettingsForm } from '../src/components/SafetySettingsForm';
import { errorNl } from '../src/lib/convex';
import { stopSharing } from '../src/lib/location';
import { resetPurchases } from '../src/lib/purchases';
import { useThemePref, ThemePref } from '../src/store/theme';

export default function Settings() {
  const { signOut } = useAuthActions();
  const deleteHistory = useMutation(api.sessions.deleteMyHistory);
  const deleteAccount = useMutation(api.account.deleteAccount);
  const [msg, setMsg] = useState<string | null>(null);
  const { pref, setPref } = useThemePref();
  const blocked = useQuery(api.contacts.blocked) ?? [];
  const unblock = useMutation(api.contacts.unblock);
  const confirmDelete = () => Alert.alert('Account verwijderen', 'Dit verwijdert je account, contacten, reizen en locatiegegevens definitief.', [
    { text: 'Annuleren', style: 'cancel' },
    { text: 'Definitief verwijderen', style: 'destructive', onPress: async () => {
      try { await stopSharing(); await deleteAccount({ confirm: 'VERWIJDER' }); await signOut().catch(() => {}); router.replace('/welcome'); }
      catch (e) { setMsg('Verwijderen mislukt: ' + errorNl(e)); }
    } },
  ]);
  return (
    <Screen>
      <H1>Instellingen</H1>
      <Card>
        <P>Weergave</P>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {([['system', 'Systeem'], ['dark', 'Donker'], ['light', 'Licht']] as [ThemePref, string][]).map(([k, l]) =>
            <View key={k} style={{ flex: 1 }}><Button title={l} variant={pref === k ? 'primary' : 'secondary'} onPress={() => setPref(k)} /></View>)}
        </View>
      </Card>
      <SafetySettingsForm />
      <Card>
        <P>Geblokkeerde personen</P>
        {blocked.length === 0 && <P muted>Niemand geblokkeerd.</P>}
        {blocked.map((b) => <View key={b.userId} style={{ gap: 6 }}><P muted>{b.name}</P>
          <Button title={`Deblokkeren: ${b.name}`} variant="secondary" onPress={() => unblock({ userId: b.userId }).catch((e) => setMsg(errorNl(e)))} /></View>)}
        <P muted style={{ fontSize: 13 }}>Deblokkeren herstelt geen contactrelatie; daarvoor is een nieuwe uitnodiging nodig.</P>
      </Card>
      <Button title="Reisgeschiedenis" variant="secondary" onPress={() => router.push('/history')} />
      <Card>
        <P>Privacy</P>
        <P muted>Locaties worden uiterlijk 24 uur na het einde van een reis automatisch verwijderd (en nooit langer dan 3 dagen bewaard). Beheerders kunnen je locatie niet inzien.</P>
        <Button title="Mijn locatiegeschiedenis nu verwijderen" variant="secondary" onPress={() => deleteHistory().then((n) => setMsg(`${n} locatiepunten verwijderd.`)).catch((e) => setMsg(errorNl(e)))} />
        <Button title="Uitloggen" variant="secondary" onPress={async () => { await stopSharing(); await resetPurchases(); await signOut(); router.replace('/welcome'); }} />
        <Button title="Account verwijderen" variant="danger" onPress={confirmDelete} />
      </Card>
      <Card><P>Premium (binnenkort)</P><P muted>SOS, 2 contacten, tijdelijk delen en basis-check-ins blijven altijd gratis.</P></Card>
      {msg && <Notice kind="info">{msg}</Notice>}
    </Screen>
  );
}
