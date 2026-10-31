import { Screen } from '../src/components/ui';
import { Markdown } from '../src/components/Markdown';
import { PRIVACY_MD } from '../src/content/legal';

/** Privacybeleid (in-app, zelfde tekst als docs/). */
export default function Page() {
  return <Screen><Markdown source={PRIVACY_MD} /></Screen>;
}
