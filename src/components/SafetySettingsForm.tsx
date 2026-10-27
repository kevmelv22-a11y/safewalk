import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Button, Card, Notice, P } from './ui';
import { errorNl } from '../lib/convex';
import { useProfile } from '../lib/queries';

const Choice = ({ options, value, onChange, unit }: { options: number[]; value: number; onChange: (n: number) => void; unit: string }) => (
  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
    {options.map((o) => <View key={o} style={{ flexGrow: 1 }}><Button title={`${o} ${unit}`} variant={o === value ? 'primary' : 'secondary'} onPress={() => onChange(o)} /></View>)}
  </View>
);

export function SafetySettingsForm() {
  const data = useProfile(); const update = useMutation(api.profiles.update);
  const [grace, setGrace] = useState(5); const [countdown, setCountdown] = useState(5); const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => { if (data) { setGrace(data.defaultGraceMinutes); setCountdown(data.sosCountdownSeconds); } }, [data]);
  const save = async () => {
    try { await update({ defaultGraceMinutes: grace, sosCountdownSeconds: countdown }); setSaved('Opgeslagen'); } catch (e) { setSaved(errorNl(e)); }
  };
  return (
    <Card>
      <P>Respijtperiode na verwachte aankomst</P>
      <P muted>Zoveel minuten na je verwachte aankomst waarschuwt de server je contacten als je niet hebt bevestigd dat alles goed is.</P>
      <Choice options={[2, 5, 10, 15]} value={grace} onChange={setGrace} unit="min" />
      <P>SOS-aftelling</P>
      <P muted>Tijd om een per ongeluk ingedrukte SOS te annuleren.</P>
      <Choice options={[3, 5, 10]} value={countdown} onChange={setCountdown} unit="s" />
      <Button title="Opslaan" variant="success" onPress={save} disabled={!data} />
      {saved && <Notice kind="ok">{saved}</Notice>}
    </Card>
  );
}
