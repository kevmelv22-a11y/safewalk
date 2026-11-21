import { useState } from 'react';
import { Redirect, router } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Screen, H1, P, Button, Field, Notice } from '../../src/components/ui';
import { useProfile } from '../../src/lib/queries';
import { errorNl } from '../../src/lib/convex';

export default function KindKoppelen() {
  const profile = useProfile();
  const link = useQuery(api.childLinks.myLink);
  const accept = useMutation(api.childLinks.acceptInvite);
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (profile?.ageStatus === 'adult') return <Redirect href="/dashboard" />;
  if (link?.linkId) return <Redirect href="/kind" />;

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await accept({ code });
      router.replace('/kind');
    } catch (e) { setErr(errorNl(e)); }
    finally { setBusy(false); }
  };

  return (
    <Screen>
      <H1>Koppelen aan een ouder</H1>
      <P>Vraag je ouder of voogd om in de eigen SafeWalk-app (16+) bij Instellingen → Kinderen een koppelcode te maken en de toestemming te geven. Jij vult hier alleen die code in. Een zelfverzonnen code of vinkje telt niet als ouder.</P>
      <Notice kind="info">SafeWalk controleert niet of iemand echt je ouder is. Onder 13 jaar kun je niet koppelen. Opnames, aankopen en de assistent blijven uit.</Notice>
      <Field label="Koppelcode" value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" maxLength={12} />
      <Button title="Koppelen" onPress={submit} loading={busy} disabled={code.trim().length < 6} />
      {err && <Notice kind="danger">{err}</Notice>}
      <Button title="Terug" variant="secondary" onPress={() => router.replace('/age')} />
    </Screen>
  );
}
