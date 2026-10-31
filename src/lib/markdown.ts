/** Kleine, veilige markdown-weergave (koppen, alinea's, lijsten, citaten, tabellen, **vet**) voor juridische teksten. */
export type Block = { type: 'h1' | 'h2' | 'p' | 'li' | 'quote' | 'row'; text: string; cells?: string[] };

export function parseMarkdown(md: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    if (/^\|[-\s|:]+\|$/.test(line)) continue;
    if (line.startsWith('# ')) blocks.push({ type: 'h1', text: line.slice(2) });
    else if (line.startsWith('## ') || line.startsWith('### ')) blocks.push({ type: 'h2', text: line.replace(/^#+\s/, '') });
    else if (line.startsWith('> ')) blocks.push({ type: 'quote', text: line.slice(2) });
    else if (/^\s*([-*]|\d+\.)\s/.test(line)) blocks.push({ type: 'li', text: line.replace(/^\s*([-*]|\d+\.)\s/, (m) => (/\d/.test(m) ? m.trim() + ' ' : '')) });
    else if (line.startsWith('|')) { const cells = line.split('|').slice(1, -1).map((c) => c.trim()); blocks.push({ type: 'row', text: cells.join(' · '), cells }); }
    else blocks.push({ type: 'p', text: line });
  }
  return blocks;
}

