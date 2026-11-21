import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../lib/theme';

/** Rij met keuzechips (één keuze). Toegankelijk als radioknoppen. */
export function Choice<T extends string | number>({ options, value, onChange, label }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string;
}) {
  const t = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={String(o.value)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center', borderWidth: 1.5,
              borderColor: on ? t.purple : t.border, backgroundColor: on ? t.purple : t.field }}>
            <Text style={{ color: on ? '#FFFFFF' : t.text, fontWeight: '700', fontSize: 15 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Aan/uit-regel met uitleg; groot tikvlak. */
export function Toggle({ value, onChange, title, hint }: { value: boolean; onChange: (v: boolean) => void; title: string; hint?: string }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={title} accessibilityHint={hint}
      onPress={() => onChange(!value)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
      <View style={{ width: 50, height: 30, borderRadius: 15, padding: 3, backgroundColor: value ? t.green : t.border, justifyContent: 'center' }}>
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF', alignSelf: value ? 'flex-end' : 'flex-start' }} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>{title}</Text>
        {hint ? <Text style={{ color: t.muted, fontSize: 14, lineHeight: 20 }}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}
