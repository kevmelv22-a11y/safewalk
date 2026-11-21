import { router } from 'expo-router';
import { Linking } from 'react-native';
import { Screen, H1, P, Button, Card, Notice } from '../src/components/ui';
import { HELPLINES, telUri } from '../src/lib/helplines';
import { onPressOpenTel } from '../src/lib/dial112';

export default function Hulplijnen() {
  return (
    <Screen>
      <H1>Hulplijnen</H1>
      <Notice kind="info">SafeWalk is geen hulpdienst en belt nooit automatisch. Jij tikt op bellen in de telefoon-app. Nummers gecontroleerd via officiële bronnen op 15 november 2026.</Notice>
      {HELPLINES.map((h) => (
        <Card key={h.id}>
          <P>{h.title}</P>
          <P style={{ fontSize: 22, fontWeight: '800' }}>{h.number}</P>
          <P muted>{h.when}</P>
          <P muted>{h.cost} {h.hint}</P>
          <Button
            title={`Open ${h.number} in de telefoon-app`}
            variant={h.id === '112' ? 'danger' : 'secondary'}
            hint={h.hint}
            onPress={() => { void onPressOpenTel(telUri(h.digits), h.title); }}
          />
          <Button title={h.sourceLabel} variant="secondary" onPress={() => { void Linking.openURL(h.sourceUrl); }} />
        </Card>
      ))}
      <Card>
        <P>Noodinfo op dit toestel</P>
        <P muted>Medische notities en ICE-contacten blijven op je telefoon.</P>
        <Button title="Noodinfo bekijken of wijzigen" variant="secondary" onPress={() => router.push('/noodinfo')} />
      </Card>
      <Card>
        <P>Plekken in de buurt</P>
        <P muted>Politie, ziekenhuis en openbare plekken via OpenStreetMap. SafeWalk beoordeelt niet of een plek veilig is.</P>
        <Button title="Veilige plekken in de buurt" variant="secondary" onPress={() => router.push('/veilige-plekken')} />
      </Card>
    </Screen>
  );
}
