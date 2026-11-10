import { useState } from 'react';
import { router } from 'expo-router';
import { Screen, H1, P, Button, Notice } from '../../src/components/ui';
import { foregroundPermission } from '../../src/lib/location';
import { useProfile } from '../../src/lib/queries';

export default function LocationPermission() {
  const profile = useProfile();
  const [denied, setDenied] = useState(false);
  const adult = profile?.ageStatus === 'adult';
  return (
    <Screen>
      <H1>Locatietoestemming</H1>
      <P>SafeWalk gebruikt je locatie alleen tijdens een veiligheidssessie die jij zelf start, of als je op SOS drukt.</P>
      <P muted>• Alleen contacten die jij per reis kiest, zien je locatie{'\n'}• Na afloop wordt het delen gestopt en wordt locatiegeschiedenis binnen 24 uur verwijderd{'\n'}• We vragen pas om locatie “altijd/op de achtergrond” wanneer je een sessie start, zodat delen doorgaat als je scherm uit staat</P>
      <Notice kind="info">iOS en Android kunnen achtergrondlocatie vertragen of pauzeren (batterijbesparing). Updates zijn daarom niet gegarandeerd realtime.</Notice>
      {denied && <Notice kind="warn">Zonder locatietoestemming kun je je reis niet delen. Je kunt dit later wijzigen in de instellingen van je telefoon. SOS werkt dan zonder locatie.</Notice>}
      {!adult && <Notice kind="warn">Locatie wordt pas gevraagd vanaf 16 jaar. Onder 16 of zonder ingevulde leeftijd vragen we geen locatie toestemming.</Notice>}
      <Button title="Locatie toestaan tijdens gebruik" disabled={!adult} onPress={async () => { if (!adult) return; if (await foregroundPermission()) router.push('/onboarding/notifications'); else setDenied(true); }} />
      <Button title="Later" variant="secondary" onPress={() => router.push('/onboarding/notifications')} />
    </Screen>
  );
}
