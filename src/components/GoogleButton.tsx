import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { makeRedirectUri } from 'expo-auth-session';
import { openAuthSessionAsync } from 'expo-web-browser';
import { useAuthActions } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { api } from '../../convex/_generated/api';
import { useTheme } from '../lib/theme';
import { Notice } from './ui';

const GoogleG = () => (
  <Svg width={20} height={20} viewBox="0 0 48 48">
    <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </Svg>
);

/** Renders Google CTA only when server reports google=true. Otherwise null (AuthCapabilityNotice covers copy). */
export function GoogleButton() {
  const { t } = useTranslation();
  const { signIn } = useAuthActions();
  const providers = useQuery(api.auth.providers);
  const { isDark: dark } = useTheme();
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);

  if (providers === undefined || !providers.google) return null;

  const press = async () => {
    setMsg(null); setBusy(true);
    try {
      const redirectTo = makeRedirectUri();
      const { redirect } = await signIn('google', { redirectTo });
      if (Platform.OS === 'web') return;
      const result = await openAuthSessionAsync(redirect!.toString(), redirectTo);
      if (result.type === 'success') {
        const code = new URL(result.url).searchParams.get('code');
        if (!code) throw new Error('Geen code');
        await signIn('google', { code });
        router.replace('/');
      }
    } catch { setMsg(t('flow.auth.googleFail')); }
    finally { setBusy(false); }
  };

  return (
    <View style={{ gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('flow.auth.google')} accessibilityState={{ busy }} disabled={busy} onPress={press}
        style={({ pressed }) => ({ minHeight: 54, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
          backgroundColor: dark ? '#131314' : '#FFFFFF', borderColor: dark ? '#8E918F' : '#747775', opacity: pressed || busy ? 0.75 : 1, paddingHorizontal: 16 })}>
        <GoogleG />
        <Text style={{ color: dark ? '#E3E3E3' : '#1F1F1F', fontSize: 16, fontWeight: '500', fontFamily: Platform.select({ android: 'sans-serif-medium', default: undefined }) }}>
          {busy ? t('common.busy') : t('flow.auth.google')}
        </Text>
      </Pressable>
      {msg && <Notice kind="info">{msg}</Notice>}
    </View>
  );
}
