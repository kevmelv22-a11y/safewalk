import { useTranslation } from 'react-i18next';
import { Screen, Notice, H1, P } from '../src/components/ui';
import { Markdown } from '../src/components/Markdown';
import { PRIVACY_MD } from '../src/content/legal';

/** Privacybeleid. Dutch text is the official version; other languages get a reading translation above it. */
export default function Page() {
  const { t, i18n } = useTranslation();
  const dutch = !i18n.language || i18n.language === 'nl';
  return (
    <Screen>
      {!dutch && <Notice kind="info">{t('legal.banner')}</Notice>}
      {!dutch && (
        <>
          <H1>{t('screens.privacy')}</H1>
          <P>{t('legal.t1')}</P>
          <P>{t('legal.t7')}</P>
          <P>{t('legal.t8')}</P>
        </>
      )}
      <Markdown source={PRIVACY_MD} />
    </Screen>
  );
}
