import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking, Platform, View } from 'react-native';
import { useMutation, useQuery } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { api } from '../convex/_generated/api';
import { Screen, H1, P, Button, Card, Notice } from '../src/components/ui';
import { SafetySettingsForm } from '../src/components/SafetySettingsForm';
import { errorNl } from '../src/lib/convex';
import { confirmAction } from '../src/lib/confirm';
import { stopSharing } from '../src/lib/location';
import { resetPurchases } from '../src/lib/purchases';
import { ThemePicker } from '../src/components/ThemePicker';
import { applyThemeSkinFromQuery } from '../src/store/theme';
import { maybePromptQsTile, getNativeCapabilitiesSafe } from '../src/lib/nativeEntryPoints';
import { registerPush } from '../src/lib/notifications';

export default function Settings() {
  const params = useLocalSearchParams<{ theme?: string | string[] }>();
  useEffect(() => {
    void applyThemeSkinFromQuery(params.theme);
  }, [params.theme]);
  const { signOut } = useAuthActions();
  const deleteHistory = useMutation(api.sessions.deleteMyHistory);
  const deleteAccount = useMutation(api.account.deleteAccount);
  const [msg, setMsg] = useState<string | null>(null);
  const blocked = useQuery(api.contacts.blocked) ?? [];
  const unblock = useMutation(api.contacts.unblock);
  const confirmDelete = () => confirmAction('Account verwijderen', 'Dit verwijdert je account, contacten, reizen en locatiegegevens definitief.', 'Definitief verwijderen', async () => {
    try { await stopSharing(); await deleteAccount({ confirm: 'VERWIJDER' }); await signOut().catch(() => {}); router.replace('/welcome'); }
    catch (e) { setMsg('Verwijderen mislukt: ' + errorNl(e)); }
  });
  return (
    <Screen>
      <H1>Instellingen</H1>
      <Card>
        <ThemePicker />
      </Card>
      <SafetySettingsForm />
      <Card>
        <P>Delen & opnames</P>
        <Button title="Tracking-link (zonder app)" variant="secondary" onPress={() => router.push('/share-link')} />
        <Button title="Telefooncontacten kiezen" variant="secondary" onPress={() => router.push('/device-contacts')} />
        <Button title="Audio-opnames" variant="secondary" onPress={() => router.push('/recordings')} />
      </Card>
      <Card><P>Veiligheidscode</P><P muted>Nodig om het gevaar-alarm te stoppen en “veilig aangekomen” te bevestigen. Cijfers en letters, 4–8 tekens. Hoofdletters tellen mee.</P>
        <Button title="Code instellen of wijzigen" variant="secondary" onPress={() => router.push('/settings/pin')} /></Card>
      <Card>
        <P>Snelkoppelingen (native)</P>
        <P muted>Android Quick Settings-tegel en iOS Home Screen Quick Actions openen “Stuur live locatie”. Volume×2 alleen Android-foreground na development build. Geen background torch. Power-off/force-stop stopt alles.</P>
        <Button title="Open live-locatie scherm" variant="secondary" onPress={() => router.push('/quick-ping')} />
        {Platform.OS === 'android' && (
          <Button title="Android: tegel toevoegen (prompt)" variant="secondary" onPress={async () => setMsg('Tegel: ' + await maybePromptQsTile())} />
        )}
        <Button title="Push opnieuw registreren" variant="secondary" onPress={async () => {
          const r = await registerPush();
          setMsg(r.ok ? 'Push-token opgeslagen.' : `Push niet gereed: ${r.reason}${r.detail ? ' — ' + r.detail : ''}`);
        }} />
        <P muted style={{ fontSize: 12 }}>{getNativeCapabilitiesSafe()}</P>
      </Card>
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
        <Button title="Privacybeleid" variant="secondary" onPress={() => router.push('/privacy')} />
        <Button title="Gebruiksvoorwaarden" variant="secondary" onPress={() => router.push('/terms')} />
        <Button title="Contact: support@vonkbyte.nl" variant="secondary" hint="Opent je e-mailapp" onPress={() => Linking.openURL('mailto:support@vonkbyte.nl?subject=SafeWalk')} />
        <Button title="Uitloggen" variant="secondary" onPress={async () => { await stopSharing(); await resetPurchases(); await signOut(); router.replace('/welcome'); }} />
        <Button title="Account verwijderen" variant="danger" onPress={confirmDelete} />
      </Card>
      <Card><P>Premium</P><P muted>SOS, 2 contacten, tijdelijk delen en basis-check-ins blijven altijd gratis.</P>
        <Button title="Bekijk Premium" variant="secondary" onPress={() => router.push('/premium')} /></Card>
      {msg && <Notice kind="info">{msg}</Notice>}
    </Screen>
  );
}
