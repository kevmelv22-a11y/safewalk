import { useEffect, useState } from 'react';
import { useQuery } from 'convex/react';
import type { PurchasesPackage } from 'react-native-purchases';
import { api } from '../convex/_generated/api';
import { Screen, H1, P, Button, Card, Notice } from '../src/components/ui';
import type { PremiumOfferingResult } from '../src/lib/purchases';
import { buy, loadPremiumOffering, purchaseBlockReason, purchasesEnabled, restore, testStoreActive } from '../src/lib/purchases';

const FREE = ['SOS-knop', '2 vertrouwde contacten', 'Tijdelijke locatiedeling', 'Basis-check-ins (+10/+20 min)'];
const PREMIUM = ['Tot 20 vertrouwde contacten', 'Sessiegeschiedenis 90 dagen (i.p.v. 7)', 'Aanpasbare check-ins en respijtperiode', 'Extra veiligheidsinstellingen (bewegingsdetectie)', 'Optionele AI-veiligheidsassistent'];

function blockReasonCopy(reason: 'web' | 'no_key' | 'test_opt_in_without_key' | 'test_key_rejected'): string {
  if (reason === 'web') return 'Aankopen werken niet in de webversie. Er is geen prijs beschikbaar.';
  if (reason === 'test_opt_in_without_key') return 'Testabonnement is aangezet, maar er is geen testsleutel. Er wordt niets geladen en er is geen betaling.';
  if (reason === 'test_key_rejected') return 'Een testsleutel is hier geweigerd. Productie gebruikt alleen de winkelsleutel. Er is geen abonnement geladen.';
  return 'Aankopen zijn in deze build niet geconfigureerd (geen winkelsleutel). Er is geen prijs beschikbaar.';
}

function offeringCopy(result: PremiumOfferingResult | { state: 'loading' } | { state: 'signed_out' } | null): { k: 'info' | 'warn' | 'danger'; t: string } | null {
  if (!result || result.state === 'ready') return null;
  if (result.state === 'loading') return { k: 'info', t: 'Abonnementen laden…' };
  if (result.state === 'signed_out') return { k: 'info', t: 'Log in om abonnementen te laden. Er is nog geen prijs.' };
  if (result.state === 'disabled') {
    return { k: result.reason === 'test_key_rejected' ? 'danger' : 'warn', t: blockReasonCopy(result.reason) };
  }
  if (result.state === 'empty' && result.reason === 'no_packages') {
    return { k: 'warn', t: 'Het huidige aanbod bevat geen pakket. Er is geen prijs om te tonen. Dit bevestigt niet of een winkelproduct bestaat.' };
  }
  if (result.state === 'empty') {
    return { k: 'warn', t: 'Er is geen huidig aanbod binnengekomen. Er is geen prijs om te tonen. Opnieuw proberen kan; dit zegt niet dat een winkelproduct ontbreekt.' };
  }
  if (result.reason === 'timeout') return { k: 'warn', t: 'Abonnementen laden stopte na 12 seconden. Probeer opnieuw.' };
  if (result.reason === 'not_configured') return { k: 'warn', t: 'De winkelmodule was nog niet gestart. Probeer opnieuw.' };
  return { k: 'danger', t: result.detail ? `Abonnementen konden niet worden geladen. ${result.detail}` : 'Abonnementen konden niet worden geladen.' };
}

export default function Premium() {
  const status = useQuery(api.billing.status);
  const [attempt, setAttempt] = useState(0);
  const [msg, setMsg] = useState<{ k: 'ok' | 'warn' | 'danger'; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);

  const userId = status?.userId;
  const accountKnown = status !== undefined;
  const requestKey = userId ? `${userId}:${attempt}` : '';
  const [fetched, setFetched] = useState<{ key: string; result: PremiumOfferingResult } | null>(null);
  useEffect(() => {
    if (!purchasesEnabled || !userId) return;
    let cancel = false;
    loadPremiumOffering(userId).then((result) => {
      if (!cancel) setFetched({ key: `${userId}:${attempt}`, result });
    });
    return () => { cancel = true; };
  }, [userId, attempt]);
  const load = purchaseBlockReason
    ? { state: 'disabled' as const, reason: purchaseBlockReason }
    : !accountKnown
      ? null
      : !userId
        ? { state: 'signed_out' as const }
        : !fetched || fetched.key !== requestKey
          ? { state: 'loading' as const }
          : fetched.result;

  const pkg: PurchasesPackage | null = load?.state === 'ready' ? load.pkg : null;
  const loadCopy = offeringCopy(load);
  const shown = pending && status?.premium ? { k: 'ok' as const, t: 'Premium is actief. Bedankt!' } : msg ?? loadCopy;
  const canRetry = load?.state === 'empty' || load?.state === 'error';

  const run = async (fn: () => Promise<boolean>) => {
    setBusy(true); setMsg(null);
    try {
      const active = await fn();
      if (active) { setPending(true); setMsg({ k: 'ok', t: 'Aankoop gelukt. Je Premium wordt op de server geactiveerd…' }); }
      else setMsg({ k: 'warn', t: 'Geen actief Premium-abonnement gevonden.' });
    } catch (e) {
      if (!(e as { userCancelled?: boolean }).userCancelled) setMsg({ k: 'danger', t: 'Aankoop mislukt. Er is niets afgeschreven als de betaling niet is voltooid.' });
    } finally { setBusy(false); }
  };

  return (
    <Screen>
      <H1>SafeWalk Premium</H1>
      {testStoreActive && <Notice kind="warn">Testabonnement — geen echte betaling.</Notice>}
      {status?.premium && <Notice kind="ok">Premium is actief{status.expiresAt ? ` tot ${new Date(status.expiresAt).toLocaleDateString('nl-NL')}` : ''}.</Notice>}
      <Card><P>Altijd gratis</P>{FREE.map((f) => <P key={f} muted>✓ {f}</P>)}<P muted style={{ fontSize: 13 }}>Essentiële veiligheidsfuncties blijven gratis.</P></Card>
      <Card>
        <P>Premium{pkg ? ` – ${pkg.product.priceString} per maand` : ''}</P>
        {PREMIUM.map((f) => <P key={f} muted>★ {f}</P>)}
        {!pkg && <P muted style={{ fontSize: 13 }}>De prijs komt alleen uit de winkel als een abonnement geladen is.</P>}
      </Card>
      {shown && <Notice kind={shown.k}>{shown.t}</Notice>}
      {canRetry && <Button title="Abonnementen opnieuw laden" variant="secondary" onPress={() => setAttempt((n) => n + 1)} />}
      {!status?.premium && (
        <Button title={pkg ? `Word Premium – ${pkg.product.priceString}/maand` : 'Word Premium'} disabled={!pkg} loading={busy || load?.state === 'loading'} onPress={() => run(() => buy(pkg!))} />
      )}
      <Button title="Aankopen herstellen" variant="secondary" disabled={!purchasesEnabled || !status?.userId} onPress={() => run(restore)} />
      <P muted style={{ fontSize: 13 }}>Een echt abonnement verlengt per maand en zeg je op via de App Store of Google Play. Zonder geladen pakket wordt er niets gekocht.</P>
    </Screen>
  );
}
