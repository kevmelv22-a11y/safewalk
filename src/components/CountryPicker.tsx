import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../lib/theme';
import { COUNTRY_CODES, countryName } from '../i18n/countries';
import { useLocale } from '../i18n/provider';
import { currentLang } from '../i18n';
import type { RegionPref } from '../i18n/languages';

type Row = { id: RegionPref; label: string };

/** Searchable list of every ISO country, plus automatic device region. */
export function CountryPicker() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { regionPreference, setRegion, language } = useLocale();
  const [query, setQuery] = useState('');
  const lang = language || currentLang();
  const rows = useMemo(() => {
    const named = COUNTRY_CODES.map((code) => ({ id: code as RegionPref, label: countryName(code, lang) }));
    named.sort((a, b) => a.label.localeCompare(b.label, lang));
    const all: Row[] = [{ id: 'system', label: t('region.system') }, ...named];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((r) => r.label.toLowerCase().includes(q) || String(r.id).toLowerCase().includes(q));
  }, [lang, query, t]);

  return (
    <View testID="country-picker" style={{ flex: 1, gap: 10 }}>
      <Text style={{ color: theme.muted, fontSize: 14, lineHeight: 20, textAlign: 'left' }}>{t('region.hint')}</Text>
      <TextInput
        testID="country-search"
        value={query}
        onChangeText={setQuery}
        placeholder={t('region.search')}
        placeholderTextColor={theme.placeholder}
        accessibilityLabel={t('region.search')}
        style={{
          color: theme.text, borderColor: theme.border, borderWidth: 1.5, borderRadius: 12,
          padding: 12, fontSize: 16, backgroundColor: theme.field, textAlign: 'left',
        }}
      />
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const on = regionPreference === item.id;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={item.label}
              onPress={() => { void setRegion(item.id); }}
              style={{
                minHeight: 48, justifyContent: 'center', paddingHorizontal: 12,
                borderBottomWidth: 1, borderBottomColor: theme.border,
                backgroundColor: on ? theme.blobA : 'transparent',
              }}
            >
              <Text style={{ color: theme.text, fontWeight: on ? '800' : '600', fontSize: 16, textAlign: 'left' }}>{item.label}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
