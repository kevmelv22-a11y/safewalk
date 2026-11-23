import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../lib/theme';
import { LANGUAGE_CHOICES, type LangPref } from '../i18n/languages';
import { useLocale } from '../i18n/provider';

/** Language list: automatic plus each language in its own name. Applies immediately. */
export function LanguagePicker() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { preference, setLanguage } = useLocale();
  const options: { id: LangPref; label: string }[] = [
    { id: 'system', label: t('language.system') },
    ...LANGUAGE_CHOICES.map((l) => ({ id: l.id as LangPref, label: l.nativeName })),
  ];
  return (
    <View testID="language-picker" accessibilityRole="radiogroup" accessibilityLabel={t('language.title')} style={{ gap: 8 }}>
      <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800', textAlign: 'left' }}>{t('language.title')}</Text>
      <Text style={{ color: theme.muted, fontSize: 14, lineHeight: 20, textAlign: 'left' }}>{t('language.hint')}</Text>
      {options.map((o) => {
        const on = preference === o.id;
        return (
          <Pressable
            key={o.id}
            testID={`language-option-${o.id}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            onPress={() => { void setLanguage(o.id); }}
            style={{
              minHeight: 48,
              borderRadius: 12,
              borderWidth: 1.5,
              borderColor: on ? theme.purple : theme.border,
              backgroundColor: on ? theme.purple : theme.field,
              paddingHorizontal: 14,
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: on ? '#FFFFFF' : theme.text, fontWeight: '700', fontSize: 16, textAlign: 'left' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
