import { useState } from 'react';
import { Redirect, router } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { useTranslation } from 'react-i18next';
import { Screen, H1, P, Button, Field, Notice } from '../src/components/ui';
import { useProfile } from '../src/lib/queries';
import { errorNl } from '../src/lib/convex';

/** Geboortejaar en -maand. Geen ouderverificatie en geen volledige geboortedatum. */
export default function AgeGate() {
  const profile = useProfile();
  const childLink = useQuery(api.childLinks.myLink);
  const declareBirth = useMutation(api.ageGate.declareBirth);
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const { t } = useTranslation();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (profile?.ageStatus === 'adult') return <Redirect href={profile.onboardingDone ? '/dashboard' : '/onboarding/location'} />;
  if (profile?.ageStatus === 'minor' && childLink?.linkId) return <Redirect href="/kind" />;

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await declareBirth({ year: Number(year), month: Number(month) });
    } catch (e) { setErr(errorNl(e)); }
    finally { setBusy(false); }
  };

  return (
    <Screen>
      <H1>{t('age.title')}</H1>
      <P>{t('age.body')}</P>
      <Notice kind="info">{t('age.info')}</Notice>
      {profile?.ageStatus === 'under13' && <Notice kind="danger">{t('age.under13')}</Notice>}
      {profile?.ageStatus === 'minor' && <Notice kind="warn">{t('age.minor')}</Notice>}
      {profile?.ageStatus === 'minor' && (
        <Button title={t('age.linkParent')} onPress={() => router.push('/kind/koppelen')}
          hint={t('age.linkHint')} />
      )}
      {profile?.ageStatus === 'minor' && (
        <Button title={t('age.fake')} variant="success" onPress={() => router.push('/fake-call')}
          hint={t('age.fakeHint')} />
      )}
      {profile?.ageStatus !== 'under13' && (
        <>
          <Field label={t('age.year')} value={year} onChangeText={setYear} keyboardType="number-pad" maxLength={4} />
          <Field label={t('age.month')} value={month} onChangeText={setMonth} keyboardType="number-pad" maxLength={2} />
          <Button title={t('age.save')} onPress={submit} loading={busy} disabled={year.length !== 4 || month.length < 1} />
        </>
      )}
      {err && <Notice kind="danger">{err}</Notice>}
      <P muted>{t('age.later')}</P>
    </Screen>
  );
}
