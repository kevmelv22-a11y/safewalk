import { useTranslation } from 'react-i18next';
import { Button } from './ui';
import { onPressOpenEmergency } from '../lib/dial112';
import { useLocale } from '../i18n/provider';

/** Opens the phone dialer with the regional emergency number. Never calls by itself. */
export function EmergencyButton() {
  const { t } = useTranslation();
  const { emergencyDigits } = useLocale();
  return (
    <Button
      title={t('dial.title', { number: emergencyDigits })}
      hint={t('dial.hint')}
      variant="danger"
      onPress={() => { void onPressOpenEmergency(emergencyDigits); }}
    />
  );
}
