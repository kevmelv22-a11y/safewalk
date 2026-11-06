import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { SAFETY_CODE_HINT_NL, SAFETY_CODE_MAX, safetyCodeIssue } from '../../convex/safetyCode';
import { useTheme } from '../lib/theme';
import { Notice } from './ui';

type Props = {
  title: string;
  hint?: string;
  error?: string | null;
  busy?: boolean;
  onSubmit: (pin: string) => void;
  onCancel?: () => void;
};

function issueNl(issue: ReturnType<typeof safetyCodeIssue>): string | null {
  if (issue === null || issue === 'empty') return null;
  if (issue === 'short') return 'Minstens 4 tekens. ' + SAFETY_CODE_HINT_NL;
  if (issue === 'long') return 'Maximaal 8 tekens. ' + SAFETY_CODE_HINT_NL;
  return SAFETY_CODE_HINT_NL;
}

/**
 * Veiligheidscode: cijfers én letters, exact zoals getypt (geen trim, geen lowercase).
 * De code gaat alleen naar onSubmit als hij geldig is; hij wordt nergens gelogd.
 */
export function PinPad({ title, hint = SAFETY_CODE_HINT_NL, error, busy, onSubmit, onCancel }: Props) {
  const t = useTheme();
  const [value, setValue] = useState('');
  const [shown, setShown] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  const onChange = (next: string) => {
    if (busy) return;
    if (next.length > SAFETY_CODE_MAX) {
      setLocalErr('Maximaal 8 tekens. ' + SAFETY_CODE_HINT_NL);
      return;
    }
    setLocalErr(null);
    setValue(next);
  };

  const submit = () => {
    if (busy) return;
    const issue = safetyCodeIssue(value);
    if (issue) {
      setLocalErr(issueNl(issue) ?? SAFETY_CODE_HINT_NL);
      return;
    }
    onSubmit(value);
  };

  const shownError = localErr || error;

  return (
    <View style={{ gap: 14 }}>
      <Text accessibilityRole="header" style={{ color: t.text, fontSize: 24, fontWeight: '800' }}>{title}</Text>
      {hint ? <Text style={{ color: t.muted, fontSize: 15, lineHeight: 21 }}>{hint}</Text> : null}
      <TextInput
        accessibilityLabel="Veiligheidscode"
        value={value}
        onChangeText={onChange}
        editable={!busy}
        secureTextEntry={!shown}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        autoComplete="off"
        textContentType="none"
        importantForAutofill="no"
        keyboardType="default"
        maxLength={SAFETY_CODE_MAX + 1}
        placeholder="Cijfers en letters"
        placeholderTextColor={t.placeholder}
        onSubmitEditing={submit}
        style={{
          color: t.text,
          backgroundColor: t.field,
          borderColor: t.border,
          borderWidth: 1.5,
          borderRadius: 14,
          paddingHorizontal: 16,
          paddingVertical: 14,
          fontSize: 22,
          fontWeight: '700',
          letterSpacing: shown ? 1 : 4,
        }}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: t.muted, fontSize: 13 }}>{value.length}/{SAFETY_CODE_MAX}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={shown ? 'Verberg code' : 'Toon code'} onPress={() => setShown((s) => !s)}>
          <Text style={{ color: t.purple, fontSize: 15, fontWeight: '700' }}>{shown ? 'Verberg code' : 'Toon code'}</Text>
        </Pressable>
      </View>
      {shownError ? <Notice kind="danger">{shownError}</Notice> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Bevestigen"
        disabled={busy}
        onPress={submit}
        style={({ pressed }) => ({
          minHeight: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
          backgroundColor: t.purple, opacity: pressed || busy ? 0.75 : 1,
        })}>
        <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>Bevestigen</Text>
      </Pressable>
      {onCancel ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Annuleren" onPress={onCancel}>
          <Text style={{ color: t.muted, textAlign: 'center', fontSize: 16, padding: 8 }}>Annuleren</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
