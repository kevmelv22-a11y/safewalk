import { router } from 'expo-router';
import { Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen, H1, P, Button, Card, Notice } from '../src/components/ui';
import { onPressOpenTel } from '../src/lib/dial112';
import { emergencyDirectory, type EmergencyLine } from '../src/i18n/emergency';
import { useLocale } from '../src/i18n/provider';

function lineDetail(line: EmergencyLine, t: (key: string) => string): string {
  if (line.id === 'politie') return t('emergency.nl.policeWhen');
  if (line.id === 'veilig-thuis') return t('emergency.nl.vtWhen');
  if (line.id === '113') return t('emergency.nl.mentalWhen');
  if (line.id === 'kindertelefoon') return t('emergency.nl.childWhen');
  if (line.id === '112' && line.sourceUrl.includes('rijksoverheid')) return t('emergency.nl.when112');
  return t('emergency.whenUnified');
}

function lineCost(line: EmergencyLine, t: (key: string) => string): string {
  if (line.id === 'politie') return t('emergency.nl.policeCost');
  if (line.digits === '112' && line.role === 'unified') return t('emergency.costFree');
  if (line.id === 'veilig-thuis' || line.id === '113' || line.id === 'kindertelefoon') return t('emergency.costFree');
  if (line.id === '112' && line.role === 'unified') return t('emergency.alsoWorks');
  return '';
}

export function HelplinesBody({ region }: { region: string | null }) {
  const { t } = useTranslation();
  const directory = emergencyDirectory(region);
  return (
    <Screen>
      <H1>{t('emergency.screenTitle')}</H1>
      <Notice kind="info">{t('emergency.intro')}</Notice>
      {directory.noteKey ? <Notice kind="warn">{t(directory.noteKey)}</Notice> : null}
      {directory.lines.map((h) => {
        const role = t(`emergency.roles.${h.role}`);
        const cost = lineCost(h, t);
        const canDial = /^\d{2,15}$/.test(h.digits);
        return (
          <Card key={h.id} testID={h.id === directory.primary.id ? 'emergency-primary' : `emergency-${h.id}`}>
            <P>{role}</P>
            <P style={{ fontSize: 22, fontWeight: '800' }}>{h.number}</P>
            <P muted>{lineDetail(h, t)}</P>
            {!!cost && <P muted>{cost} {t('emergency.youConfirm')}</P>}
            {canDial ? (
              <Button
                title={t('emergency.openInPhone', { number: h.number })}
                variant={h.id === directory.primary.id ? 'danger' : 'secondary'}
                hint={t('emergency.youConfirm')}
                onPress={() => { void onPressOpenTel(`tel:${h.digits}`, role); }}
              />
            ) : null}
            <Button title={h.sourceLabel} variant="secondary" onPress={() => { void Linking.openURL(h.sourceUrl); }} />
          </Card>
        );
      })}
      <Card>
        <P>{t('emergency.iceTitle')}</P>
        <P muted>{t('emergency.iceBody')}</P>
        <Button title={t('emergency.iceButton')} variant="secondary" onPress={() => router.push('/noodinfo')} />
      </Card>
      <Card>
        <P>{t('emergency.placesTitle')}</P>
        <P muted>{t('emergency.placesBody')}</P>
        <Button title={t('emergency.placesButton')} variant="secondary" onPress={() => router.push('/veilige-plekken')} />
      </Card>
    </Screen>
  );
}

export default function Hulplijnen() {
  const { region } = useLocale();
  return <HelplinesBody region={region} />;
}
