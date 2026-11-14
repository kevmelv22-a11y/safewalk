// Toegangscodes komen één keer van de server terug. Alleen in het geheugen (niet opgeslagen), zodat de eigenaar
// de code nog kan aflezen zolang de app open is. Na herstart: nieuwe link maken als je de code kwijt bent.
import { create } from 'zustand';
type S = { codes: Record<string, string>; put: (linkId: string, code: string) => void };
export const useLinkCodes = create<S>((set) => ({ codes: {}, put: (linkId, code) => set((s) => ({ codes: { ...s.codes, [linkId]: code } })) }));
