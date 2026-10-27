import { useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { Screen, H1, P, Button, Card, Notice } from '../src/components/ui';
import { SafetySettingsForm } from '../src/components/SafetySettingsForm';
import { supabase, callFunction } from '../src/lib/supabase';
import { stopSharing } from '../src/lib/location';
import { useUserId } from '../src/lib/queries';

export default function Settings() {
  const uid = useUserId(); const [msg, setMsg] = useState<string | null>(null);
  const deleteHistory = async () => {
    const { error } = await supabase.from('location_updates').delete().eq('user_id', uid!);
    setMsg(error ? error.message : 'Je locatiegeschiedenis is verwijderd.');
  };
  const deleteAccount = () => Alert.alert('Account verwijderen', 'Dit verwijdert je account, contacten, reizen en locatiegegevens definitief.', [
    { text: 'Annuleren', style: 'cancel' },
    { text: 'Definitief verwijderen', style: 'destructive', onPress: async () => {
      try { await stopSharing(); await callFunction('delete-account', { confirm: 'VERWIJDER' }); await supabase.auth.signOut(); router.replace('/welcome'); }
      catch (e) { setMsg('Verwijderen mislukt: ' + String((e as Error).message)); }
    } },
  ]);
  return (
    <Screen>
      <H1>Instellingen</H1>
      <SafetySettingsForm />
      <Card>
        <P>Privacy</P>
        <P muted>Locaties worden uiterlijk 24 uur na het einde van een reis automatisch verwijderd (en nooit langer dan 3 dagen bewaard). Beheerders kunnen je locatie niet inzien.</P>
        <Button title="Mijn locatiegeschiedenis nu verwijderen" variant="secondary" onPress={deleteHistory} />
        <Button title="Uitloggen" variant="secondary" onPress={async () => { await stopSharing(); await supabase.auth.signOut(); router.replace('/welcome'); }} />
        <Button title="Account verwijderen" variant="danger" onPress={deleteAccount} />
      </Card>
      <Card><P>Premium (binnenkort)</P><P muted>SOS, 2 contacten, tijdelijk delen en basis-check-ins blijven altijd gratis.</P></Card>
      {msg && <Notice kind="info">{msg}</Notice>}
    </Screen>
  );
}
