import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, Notice, P } from './ui';
import { supabase } from '../lib/supabase';
import { useProfile } from '../lib/queries';

const Choice = ({ options, value, onChange, unit }: { options: number[]; value: number; onChange: (n: number) => void; unit: string }) => (
  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
    {options.map((o) => <View key={o} style={{ flexGrow: 1 }}><Button title={`${o} ${unit}`} variant={o === value ? 'primary' : 'secondary'} onPress={() => onChange(o)} /></View>)}
  </View>
);

export function SafetySettingsForm() {
  const { data } = useProfile(); const qc = useQueryClient();
  const [grace, setGrace] = useState(5); const [countdown, setCountdown] = useState(5); const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => { if (data) { setGrace(data.default_grace_minutes); setCountdown(data.sos_countdown_seconds); } }, [data]);
  const save = async () => {
    const { error } = await supabase.from('profiles').update({ default_grace_minutes: grace, sos_countdown_seconds: countdown }).eq('id', data!.id);
    setSaved(error ? error.message : 'Opgeslagen'); qc.invalidateQueries({ queryKey: ['profile'] });
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
