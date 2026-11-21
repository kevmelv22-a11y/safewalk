import { useState } from 'react';
import { Redirect, router } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Screen, H1, P, Button, Field, Notice } from '../src/components/ui';
import { useProfile } from '../src/lib/queries';
import { errorNl } from '../src/lib/convex';

/** Geboortejaar en -maand. Geen ouderverificatie en geen volledige geboortedatum. */
export default function AgeGate() {
  const profile = useProfile();
  const childLink = useQuery(api.childLinks.myLink);
  const declareBirth = useMutation(api.ageGate.declareBirth);
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (profile?.ageStatus === 'adult') return <Redirect href={profile.onboardingDone ? '/dashboard' : '/onboarding/location'} />;
  if (profile?.ageStatus === 'minor' && childLink?.linkId) return <Redirect href="/kind" />;

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await declareBirth({ year: Number(year), month: Number(month) });
    } catch (e) { setErr(errorNl(e)); }
    finally { setBusy(false); }
  };

  return (
    <Screen>
      <H1>Leeftijd</H1>
      <P>SafeWalk is bedoeld vanaf 13 jaar. Vul je geboortejaar en geboortemaand in. We vragen geen volledige geboortedatum en geen identiteitsbewijs.</P>
      <Notice kind="info">Dit is een eigen opgave, geen identiteitscontrole. Van 13 tot en met 15 jaar blijven opnames, aankopen, contactenbeheer en de AI-assistent uit. Locatie en SOS kunnen alleen via kindermodus, nadat een ouder of voogd in een eigen account van 16+ toestemming geeft en jullie koppelen. Een vinkje of e-mail van jou telt niet als ouder.</Notice>
      {profile?.ageStatus === 'under13' && <Notice kind="danger">Onder 13 jaar kun je SafeWalk niet gebruiken. Je kunt het account verwijderen via Instellingen.</Notice>}
      {profile?.ageStatus === 'minor' && <Notice kind="warn">Je bent 13 tot en met 15. Zonder ouder-koppeling blijven locatie, SOS, contacten, opnames, aankopen en de assistent dicht.</Notice>}
      {profile?.ageStatus === 'minor' && (
        <Button title="Koppelen aan een ouder" onPress={() => router.push('/kind/koppelen')}
          hint="Je ouder maakt een code in de eigen app en geeft daar toestemming." />
      )}
      {profile?.ageStatus === 'minor' && (
        <Button title="📞 Nep-oproep (werkt ook onder 16)" variant="success" onPress={() => router.push('/fake-call')}
          hint="Laat je telefoon overgaan om weg te komen uit een vervelende situatie. Er gaan geen gegevens naar anderen." />
      )}
      {profile?.ageStatus !== 'under13' && (
        <>
          <Field label="Geboortejaar" value={year} onChangeText={setYear} keyboardType="number-pad" maxLength={4} />
          <Field label="Geboortemaand (1-12)" value={month} onChangeText={setMonth} keyboardType="number-pad" maxLength={2} />
          <Button title="Leeftijd opslaan" onPress={submit} loading={busy} disabled={year.length !== 4 || month.length < 1} />
        </>
      )}
      {err && <Notice kind="danger">{err}</Notice>}
      <P muted>Vanaf 16 jaar, gerekend met jaar en maand, gaan de bestaande functies open. Een eerdere geboortedatum kun je daarna niet meer invullen.</P>
    </Screen>
  );
}
