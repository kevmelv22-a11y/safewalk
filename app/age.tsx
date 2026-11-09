import { useState } from 'react';
import { Redirect } from 'expo-router';
import { useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Screen, H1, P, Button, Field, Notice } from '../src/components/ui';
import { useProfile } from '../src/lib/queries';
import { errorNl } from '../src/lib/convex';

/** Geboortejaar en -maand. Geen ouderverificatie en geen volledige geboortedatum. */
export default function AgeGate() {
  const profile = useProfile();
  const declareBirth = useMutation(api.ageGate.declareBirth);
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (profile?.ageStatus === 'adult') return <Redirect href={profile.onboardingDone ? '/dashboard' : '/onboarding/location'} />;

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
      <Notice kind="info">Dit is een eigen opgave, geen controle. Van 13 tot en met 15 jaar blijven locatie delen, contacten, opnames, aankopen en de AI-assistent uit. Ouderlijke machtiging is nog niet ingebouwd. Een vinkje of e-mail telt niet als ouder.</Notice>
      {profile?.ageStatus === 'under13' && <Notice kind="danger">Onder 13 jaar kun je SafeWalk niet gebruiken. Je kunt het account verwijderen via Instellingen.</Notice>}
      {profile?.ageStatus === 'minor' && <Notice kind="warn">Je bent 13 tot en met 15. Delen van locatie, contacten, opnames, aankopen en de assistent blijven dicht tot er een echte oudercontrole is. Die is er nu niet.</Notice>}
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
