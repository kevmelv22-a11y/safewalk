import { Screen } from '../src/components/ui';
import { Markdown } from '../src/components/Markdown';
import { TERMS_MD } from '../src/content/legal';

/** Gebruiksvoorwaarden (in-app, zelfde tekst als docs/). */
export default function Page() {
  return <Screen><Markdown source={TERMS_MD} /></Screen>;
}
