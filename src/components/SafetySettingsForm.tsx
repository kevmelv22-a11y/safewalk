import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Button, Card, Notice, P } from './ui';
import { errorNl } from '../lib/convex';
import { useProfile } from '../lib/queries';
import { palette } from '../lib/theme';

const Choice = ({ options, value, onChange, unit, locked }: { options: number[]; value: number; onChange: (n: number) => void; unit: string; locked?: (n: number) => boolean }) => (
  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
    {options.map((o) => <View key={o} style={{ flexGrow: 1 }}><Button title={`${o} ${unit}${locked?.(o) ? ' 🔒' : ''}`} variant={o === value ? 'primary' : 'secondary'} disabled={locked?.(o)} onPress={() => onChange(o)} /></View>)}
  </View>
);

export function SafetySettingsForm() {
  const data = useProfile(); const update = useMutation(api.profiles.update);
  const [grace, setGrace] = useState(5); const [countdown, setCountdown] = useState(5); const [motion, setMotion] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const premium = !!data?.premium;
  // eslint-disable-next-line react-hooks/set-state-in-effect -- formulier vullen zodra het profiel van de server binnen is
  useEffect(() => { if (data) { setGrace(data.defaultGraceMinutes); setCountdown(data.sosCountdownSeconds); setMotion(!!data.motionDetection); } }, [data]);
  const save = async () => {
    try { await update({ defaultGraceMinutes: grace, sosCountdownSeconds: countdown, ...(premium ? { motionDetection: motion } : {}) }); setSaved('Opgeslagen'); }
    catch (e) { setSaved(errorNl(e)); }
  };
  return (
    <Card>
      <P>Respijtperiode na verwachte aankomst</P>
      <P muted>Zoveel minuten na je verwachte aankomst waarschuwt de server je contacten als je niet hebt bevestigd dat alles goed is. Gratis: 5 minuten; aanpassen met Premium.</P>
      <Choice options={[2, 5, 10, 15]} value={grace} onChange={setGrace} unit="min" locked={(o) => !premium && o !== 5} />
      <P>SOS-aftelling</P>
      <P muted>Tijd om een per ongeluk ingedrukte SOS te annuleren.</P>
      <Choice options={[3, 5, 10]} value={countdown} onChange={setCountdown} unit="s" />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <P>Bewegingsdetectie {premium ? '' : '🔒'}</P>
          <P muted>Bij lang stilstaan, afwijken van je bestemming of geen nieuwe locatie vragen we je extra of alles goed is. Dit waarschuwt nooit automatisch je contacten.</P>
        </View>
        <Switch accessibilityLabel="Bewegingsdetectie" value={motion} disabled={!premium} onValueChange={setMotion} trackColor={{ true: palette.purple, false: '#555' }} />
      </View>
      {!premium && <Button title="Bekijk Premium" variant="secondary" onPress={() => router.push('/premium')} />}
      <Button title="Opslaan" variant="success" onPress={save} disabled={!data} />
      {saved && <Notice kind="ok">{saved}</Notice>}
    </Card>
  );
}
