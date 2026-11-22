import { CountryPicker } from '../../src/components/CountryPicker';
import { Screen, H1 } from '../../src/components/ui';
import { useTranslation } from 'react-i18next';

export default function CountryScreen() {
  const { t } = useTranslation();
  return (
    <Screen scroll={false}>
      <H1>{t('region.title')}</H1>
      <CountryPicker />
    </Screen>
  );
}
