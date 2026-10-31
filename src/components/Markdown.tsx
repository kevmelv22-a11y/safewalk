import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../lib/theme';

import { parseMarkdown } from '../lib/markdown';

function Inline({ text, style }: { text: string; style: object }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return <Text style={style}>{parts.map((p, i) => (p.startsWith('**') ? <Text key={i} style={{ fontWeight: '700' }}>{p.slice(2, -2)}</Text> : p))}</Text>;
}

export function Markdown({ source }: { source: string }) {
  const t = useTheme();
  const base = { color: t.text, fontSize: 15, lineHeight: 22 };
  const blocks = parseMarkdown(source);
  const header = blocks.findIndex((b) => b.type === 'row');
  return (
    <View style={{ gap: 10 }}>
      {blocks.map((b, i) => {
        if (b.type === 'h1') return <Inline key={i} text={b.text} style={{ ...base, fontSize: 24, fontWeight: '800' }} />;
        if (b.type === 'h2') return <Inline key={i} text={b.text} style={{ ...base, fontSize: 18, fontWeight: '700', marginTop: 8 }} />;
        if (b.type === 'quote') return <View key={i} style={{ borderLeftWidth: 4, borderLeftColor: t.amber, paddingLeft: 10 }}><Inline text={b.text} style={{ ...base, color: t.muted }} /></View>;
        if (b.type === 'li') return <Inline key={i} text={`•  ${b.text}`} style={{ ...base, paddingLeft: 6 }} />;
        if (b.type === 'row') return (
          <View key={i} style={{ borderWidth: 1, borderColor: t.border, borderRadius: 10, padding: 10, backgroundColor: i === header ? t.card : undefined }}>
            <Inline text={b.text} style={{ ...base, fontSize: 14, fontWeight: i === header ? '700' : '400' }} />
          </View>);
        return <Inline key={i} text={b.text} style={base} />;
      })}
    </View>
  );
}
