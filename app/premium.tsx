import { useEffect, useState } from 'react';
import { useQuery } from 'convex/react';
import type { PurchasesPackage } from 'react-native-purchases';
import { api } from '../convex/_generated/api';
import { Screen, H1, P, Button, Card, Notice } from '../src/components/ui';
import { buy, getPremiumPackage, purchasesEnabled, restore } from '../src/lib/purchases';

const FREE = ['SOS-knop', '2 vertrouwde contacten', 'Tijdelijke locatiedeling', 'Basis-check-ins (+10/+20 min)'];
const PREMIUM = ['Tot 20 vertrouwde contacten', 'Sessiegeschiedenis 90 dagen (i.p.v. 7)', 'Aanpasbare check-ins en respijtperiode', 'Extra veiligheidsinstellingen (bewegingsdetectie)', 'Optionele AI-veiligheidsassistent'];

export default function Premium() {
  const status = useQuery(api.billing.status);
  const [pkg, setPkg] = useState<PurchasesPackage | null>(null);
  const [msg, setMsg] = useState<{ k: 'ok' | 'warn' | 'danger'; t: string } | null>(null);
  const [busy, setBusy] = useState(false); const [pending, setPending] = useState(false);
  useEffect(() => { getPremiumPackage().then(setPkg).catch(() => setMsg({ k: 'warn', t: 'Abonnementen konden niet worden geladen.' })); }, []);
  useEffect(() => { if (pending && status?.premium) { setPending(false); setMsg({ k: 'ok', t: 'Premium is actief. Bedankt!' }); } }, [pending, status?.premium]);
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
      {status?.premium && <Notice kind="ok">Premium is actief{status.expiresAt ? ` tot ${new Date(status.expiresAt).toLocaleDateString('nl-NL')}` : ''}.</Notice>}
      <Card><P>Altijd gratis</P>{FREE.map((f) => <P key={f} muted>✓ {f}</P>)}<P muted style={{ fontSize: 13 }}>Essentiële veiligheidsfuncties blijven gratis.</P></Card>
      <Card><P>Premium – {pkg?.product.priceString ?? '€2,99'} per maand</P>{PREMIUM.map((f) => <P key={f} muted>★ {f}</P>)}</Card>
      {!purchasesEnabled && <Notice kind="warn">Aankopen zijn in deze build nog niet geconfigureerd (RevenueCat-sleutel ontbreekt).</Notice>}
      {msg && <Notice kind={msg.k}>{msg.t}</Notice>}
      {!status?.premium && <Button title={`Word Premium${pkg ? ` – ${pkg.product.priceString}/maand` : ''}`} disabled={!pkg} loading={busy} onPress={() => run(() => buy(pkg!))} />}
      <Button title="Aankopen herstellen" variant="secondary" disabled={!purchasesEnabled} onPress={() => run(restore)} />
      <P muted style={{ fontSize: 13 }}>Het abonnement verlengt automatisch per maand en is op elk moment op te zeggen via de App Store of Google Play.</P>
    </Screen>
  );
}
