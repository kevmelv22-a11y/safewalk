import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking, Platform, View } from 'react-native';
import { useMutation, useQuery } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { api } from '../convex/_generated/api';
import { useTranslation } from 'react-i18next';
import { Screen, H1, P, Button, Card, Notice } from '../src/components/ui';
import { LanguagePicker } from '../src/components/LanguagePicker';
import { countryName } from '../src/i18n/countries';
import { useLocale } from '../src/i18n/provider';
import { SafetySettingsForm } from '../src/components/SafetySettingsForm';
import { errorNl } from '../src/lib/convex';
import { confirmAction } from '../src/lib/confirm';
import { stopSharing } from '../src/lib/location';
import { resetPurchases } from '../src/lib/purchases';
import { ThemePicker } from '../src/components/ThemePicker';
import { applyThemeSkinFromQuery } from '../src/store/theme';
import { maybePromptQsTile } from '../src/lib/nativeEntryPoints';
import { QUICK_LOCATION } from '../src/content/quickLocation';
import { pushResultNl, tileResultNl } from '../src/lib/settingsCopy';
import { registerPush } from '../src/lib/notifications';
import { Toggle } from '../src/components/Choice';
import { getShakeOptIn, setShakeOptIn } from '../src/lib/shake';
import { getFallOptIn, setFallOptIn } from '../src/lib/fallDetect';
import { BATTERY_HINT_NL, openBatteryOptimizationSettings } from '../src/lib/batteryOptimization';

export default function Settings() {
  const params = useLocalSearchParams<{ theme?: string | string[] }>();
  useEffect(() => {
    void applyThemeSkinFromQuery(params.theme);
  }, [params.theme]);
  const { t } = useTranslation();
  const locale = useLocale();
  const { signOut } = useAuthActions();
  const deleteHistory = useMutation(api.sessions.deleteMyHistory);
  const deleteAccount = useMutation(api.account.deleteAccount);
  const [msg, setMsg] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [fall, setFall] = useState(false);
  useEffect(() => { void getShakeOptIn().then(setShake); }, []);
  useEffect(() => { void getFallOptIn().then(setFall); }, []);
  const blocked = useQuery(api.contacts.blocked) ?? [];
  const unblock = useMutation(api.contacts.unblock);
  const confirmDelete = () => confirmAction(t('settings.deleteTitle'), t('settings.deleteBody'), t('settings.deleteConfirm'), async () => {
    try { await stopSharing(); await deleteAccount({ confirm: 'VERWIJDER' }); await signOut().catch(() => {}); router.replace('/welcome'); }
    catch (e) { setMsg(t('settings.deleteFailed', { error: errorNl(e) })); }
  });
  const regionLabel = locale.region ? countryName(locale.region, locale.language) : t('region.unknown');
  return (
    <Screen>
      <H1>{t('settings.title')}</H1>
      <Card>
        <LanguagePicker />
      </Card>
      <Card>
        <P>{t('region.title')}</P>
        <P muted>{t('region.hint')}</P>
        <P>{t('region.current', { name: locale.regionPreference === 'system' ? t('region.system') : regionLabel })}</P>
        <Button title={t('screens.country')} variant="secondary" onPress={() => router.push('/settings/land')} />
      </Card>
      <Card>
        <ThemePicker />
      </Card>
      <SafetySettingsForm />
      <Card>
        <P>{t('settings.sharing')}</P>
        <Button title={t('settings.shareLink')} variant="secondary" onPress={() => router.push('/share-link')} />
        <Button title={t('settings.autoSms')} variant="secondary" onPress={() => router.push('/settings/auto-sms')}
          hint={t('settings.autoSmsHint')} />
        <Button title={t('settings.deviceContacts')} variant="secondary" onPress={() => router.push('/device-contacts')} />
        <Button title={t('settings.recordings')} variant="secondary" onPress={() => router.push('/recordings')} />
      </Card>
      {Platform.OS !== 'web' && (
        <Card>
          <Toggle value={shake} onChange={(v) => { setShake(v); void setShakeOptIn(v); }} title={t('settings.shakeTitle')} hint={t('settings.shakeHint')} />
          <Toggle value={fall} onChange={(v) => { setFall(v); void setFallOptIn(v); }} title={t('settings.fallTitle')} hint={t('settings.fallHint')} />
        </Card>
      )}
      <Card><P>{t('settings.pinTitle')}</P><P muted>{t('settings.pinBody')}</P>
        <Button title={t('settings.pinButton')} variant="secondary" onPress={() => router.push('/settings/pin')} />
        <Button title={t('settings.duress')} variant="secondary" onPress={() => router.push('/settings/dwangcode')} />
        <Button title={t('settings.children')} variant="secondary" onPress={() => router.push('/settings/kinderen')}
          hint={t('settings.childrenHint')} /></Card>
      <Card>
        <P>{t('settings.helpTitle')}</P>
        <Button title={t('settings.helplines')} variant="secondary" onPress={() => router.push('/hulplijnen')} />
        <Button title={t('settings.ice')} variant="secondary" onPress={() => router.push('/noodinfo')} />
        <Button title={t('settings.places')} variant="secondary" onPress={() => router.push('/veilige-plekken')} />
      </Card>
      <Card>
        <P>{t('settings.shortcuts')}</P>
        <P muted>{QUICK_LOCATION.shortcuts}</P>
        {Platform.OS === 'android' && <P muted>{QUICK_LOCATION.volumeAndroid}</P>}
        <P muted>{t('settings.torchNote')}</P>
        <P muted>{BATTERY_HINT_NL}</P>
        {Platform.OS !== 'web' && <Button title={t('settings.openBattery')} variant="secondary" onPress={() => { void openBatteryOptimizationSettings(); }} />}
        <Button title={t('settings.openQuick', { title: t('nav.live') })} variant="secondary" onPress={() => router.push('/quick-ping')} />
        {Platform.OS === 'android' && (
          <Button title={t('settings.addTile')} variant="secondary" onPress={async () => setMsg(tileResultNl(await maybePromptQsTile()))} />
        )}
        <Button title={t('settings.pushAgain')} variant="secondary" onPress={async () => {
          const r = await registerPush();
          setMsg(r.ok ? t('settings.pushOn') : pushResultNl(r.reason, r.detail));
        }} />
      </Card>
      <Card>
        <P>{t('settings.blocked')}</P>
        {blocked.length === 0 && <P muted>{t('settings.nobodyBlocked')}</P>}
        {blocked.map((b) => <View key={b.userId} style={{ gap: 6 }}><P muted>{b.name}</P>
          <Button title={t('settings.unblock', { name: b.name })} variant="secondary" onPress={() => unblock({ userId: b.userId }).catch((e) => setMsg(errorNl(e)))} /></View>)}
        <P muted style={{ fontSize: 13 }}>{t('settings.unblockNote')}</P>
      </Card>
      <Button title={t('settings.history')} variant="secondary" onPress={() => router.push('/history')} />
      <Card>
        <P>{t('settings.privacyTitle')}</P>
        <P muted>{t('settings.privacyBody')}</P>
        <Button title={t('settings.deleteHistory')} variant="secondary" onPress={() => deleteHistory().then((n) => setMsg(t(n === 1 ? 'settings.removedOne' : 'settings.removedOther', { count: n }))).catch((e) => setMsg(errorNl(e)))} />
        <Button title={t('settings.privacyPolicy')} variant="secondary" onPress={() => router.push('/privacy')} />
        <Button title={t('settings.terms')} variant="secondary" onPress={() => router.push('/terms')} />
        <Button title={t('common.support')} variant="secondary" onPress={() => Linking.openURL('mailto:support@vonkbyte.nl?subject=SafeWalk')} />
        <Button title={t('settings.signOut')} variant="secondary" onPress={async () => { await stopSharing(); await resetPurchases(); await signOut(); router.replace('/welcome'); }} />
        <Button title={t('settings.deleteAccount')} variant="danger" onPress={confirmDelete} />
      </Card>
      <Card><P>{t('settings.premiumTitle')}</P><P muted>{t('settings.premiumBody')}</P>
        <Button title={t('settings.seePremium')} variant="secondary" onPress={() => router.push('/premium')} /></Card>
      {msg && <Notice kind="info">{msg}</Notice>}
    </Screen>
  );
}
