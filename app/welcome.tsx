import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen, H1, P, Button, Disclaimer } from '../src/components/ui';
import { Logo } from '../src/components/Logo';
import { AuthPanel } from '../src/components/AuthPanel';
import { Text, View } from 'react-native';
import { useTheme } from '../src/lib/theme';

export default function Welcome() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  return (
    <Screen>
      <Logo size="large" />
      <AuthPanel>
        <H1>{tr('welcome.title')}</H1>
        <P muted>{tr('welcome.body')}</P>
        <P muted>{tr('welcome.bullets')}</P>
        <Disclaimer />
        <Button title={tr('welcome.signup')} onPress={() => router.push('/signup')} />
        <Button title={tr('welcome.login')} variant="secondary" onPress={() => router.push('/login')} />
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 18 }}>
          <Text accessibilityRole="link" onPress={() => router.push('/privacy')} style={{ color: t.muted, textDecorationLine: 'underline', textAlign: 'left' }}>{tr('welcome.privacy')}</Text>
          <Text accessibilityRole="link" onPress={() => router.push('/terms')} style={{ color: t.muted, textDecorationLine: 'underline', textAlign: 'left' }}>{tr('welcome.terms')}</Text>
        </View>
      </AuthPanel>
    </Screen>
  );
}
