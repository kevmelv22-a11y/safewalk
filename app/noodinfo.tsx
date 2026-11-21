import { useEffect, useState } from 'react';
import { Screen, H1, P, Button, Field, Notice, Card } from '../src/components/ui';
import {
  EMERGENCY_INFO_HINT_NL, EMPTY_EMERGENCY_INFO, loadEmergencyInfo, saveEmergencyInfo, clearEmergencyInfo,
  type EmergencyInfo,
} from '../src/lib/emergencyInfo';
import { confirmAction } from '../src/lib/confirm';

export default function Noodinfo() {
  const [info, setInfo] = useState<EmergencyInfo>(EMPTY_EMERGENCY_INFO);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void loadEmergencyInfo().then(setInfo); }, []);
  const set = (k: keyof EmergencyInfo) => (v: string) => setInfo((s) => ({ ...s, [k]: v }));
  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      setInfo(await saveEmergencyInfo(info));
      setMsg('Opgeslagen op dit toestel. Niets is naar SafeWalk gestuurd.');
    } catch { setMsg('Opslaan lukte niet.'); }
    finally { setBusy(false); }
  };
  const clear = () => confirmAction('Noodinfo wissen', 'De gegevens worden alleen van dit toestel verwijderd.', 'Wissen', async () => {
    await clearEmergencyInfo();
    setInfo({ ...EMPTY_EMERGENCY_INFO });
    setMsg('Noodinfo is van dit toestel gewist.');
  });
  return (
    <Screen>
      <H1>Noodinfo</H1>
      <Notice kind="info">{EMERGENCY_INFO_HINT_NL}</Notice>
      <Field label="Medische notities (optioneel)" value={info.medicalNotes} onChangeText={set('medicalNotes')} multiline placeholder="Bijvoorbeeld medicatie of een aandoening" />
      <Field label="Allergieën (optioneel)" value={info.allergies} onChangeText={set('allergies')} placeholder="Bijvoorbeeld penicilline" />
      <Field label="Bloedgroep (optioneel)" value={info.bloodType} onChangeText={set('bloodType')} placeholder="Alleen als je die zeker weet" />
      <Card>
        <P>ICE-contact (in case of emergency)</P>
        <P muted>Een persoon die hulpdiensten mogen bellen. Dit nummer wordt niet automatisch gebeld.</P>
        <Field label="Naam" value={info.iceName} onChangeText={set('iceName')} />
        <Field label="Telefoonnummer" value={info.icePhone} onChangeText={set('icePhone')} keyboardType="phone-pad" />
      </Card>
      <Button title="Opslaan op dit toestel" variant="success" loading={busy} onPress={save} />
      <Button title="Alles wissen" variant="secondary" onPress={clear} />
      {msg && <Notice kind="ok">{msg}</Notice>}
    </Screen>
  );
}
