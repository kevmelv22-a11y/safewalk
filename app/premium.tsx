import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from 'convex/react';
import type { PurchasesPackage } from 'react-native-purchases';
import { api } from '../convex/_generated/api';
import { Screen, H1, P, Button, Card, Notice } from '../src/components/ui';
import { useTheme } from '../src/lib/theme';
import { useProfile } from '../src/lib/queries';
import type { PremiumOfferingResult } from '../src/lib/purchases';
import { buy, loadPremiumOffering, purchaseBlockReason, purchasesEnabled, restore, testStoreActive } from '../src/lib/purchases';
import { annualSavingsPct, ctaLabel, defaultPlan, freeTrialDays, renewalNote, trialLabel, type Plan } from '../src/lib/paywall';
import { REFERRAL_COPY } from '../src/lib/referralCopy';

const FREE = ['SOS-knop en "Ik voel me niet veilig"', '2 vertrouwde contacten', 'Reis delen met check-in (+10/+20 min)', 'Meekijklink voor iemand zonder app', 'Nep-oproep: meteen laten bellen'];
const PREMIUM: [string, string][] = [
  ['📞', 'Nep-oproep inplannen, met eigen naam en een stem in het gesprek'],
  ['👥', 'Tot 20 vertrouwde contacten (gratis: 2)'],
  ['⏱️', 'Eigen check-in-tijden en respijtperiode'],
  ['🚶', 'Bewegingsdetectie: extra check-in als je lang stilstaat of afwijkt'],
  ['🗂️', 'Reisgeschiedenis 90 dagen (gratis: 7)'],
  ['💬', 'Optionele AI-veiligheidsassistent'],
];

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
  const t = useTheme();
  const status = useQuery(api.billing.status);
  const referral = useQuery(api.referrals.mine);
  const profile = useProfile();
  const adult = profile?.ageStatus === 'adult';
  const [attempt, setAttempt] = useState(0);
  const [msg, setMsg] = useState<{ k: 'ok' | 'warn' | 'danger'; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);

  const userId = status?.userId;
  const accountKnown = status !== undefined;
  const requestKey = userId ? `${userId}:${attempt}` : '';
  const [fetched, setFetched] = useState<{ key: string; result: PremiumOfferingResult } | null>(null);
  useEffect(() => {
    // Onder 16 geen winkelmodule en geen aanbod laden.
    if (!purchasesEnabled || !userId || !adult) return;
    let cancel = false;
    loadPremiumOffering(userId).then((result) => {
      if (!cancel) setFetched({ key: `${userId}:${attempt}`, result });
    });
    return () => { cancel = true; };
  }, [userId, attempt, adult]);
  const load = purchaseBlockReason
    ? { state: 'disabled' as const, reason: purchaseBlockReason }
    : !accountKnown
      ? null
      : !userId
        ? { state: 'signed_out' as const }
        : !fetched || fetched.key !== requestKey
          ? { state: 'loading' as const }
          : fetched.result;

  const ready = load?.state === 'ready' ? load : null;
  // Zonder maandpakket-veld valt het oude gedrag terug op het eerste pakket (pkg).
  const monthly: PurchasesPackage | null = ready ? ready.monthly ?? (ready.annual ? null : ready.pkg) : null;
  const annual: PurchasesPackage | null = ready?.annual ?? null;
  const chosen = plan ?? defaultPlan(!!annual, !!monthly);
  const pkg = chosen === 'annual' ? annual : chosen === 'monthly' ? monthly : null;
  const savings = annualSavingsPct(monthly?.product, annual?.product);
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

  const planCard = (kind: Plan, p: PurchasesPackage) => {
    const on = chosen === kind;
    const trial = trialLabel(freeTrialDays(p.product));
    return (
      <Pressable key={kind} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setPlan(kind)}
        style={{ borderWidth: 2, borderColor: on ? t.purple : t.border, backgroundColor: t.card, borderRadius: 16, padding: 14, gap: 4 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: t.text, fontSize: 18, fontWeight: '800' }}>{kind === 'annual' ? 'Jaar' : 'Maand'}</Text>
          {kind === 'annual' && savings ? <Text style={{ backgroundColor: t.purple, color: '#fff', fontWeight: '800', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2, overflow: 'hidden' }}>Bespaar {savings}%</Text> : null}
        </View>
        <Text style={{ color: t.text, fontSize: 16 }}>{p.product.priceString} per {kind === 'annual' ? 'jaar' : 'maand'}{kind === 'annual' && p.product.pricePerMonthString ? ` · ${p.product.pricePerMonthString} per maand` : ''}</Text>
        {trial ? <Text style={{ color: t.green, fontWeight: '700' }}>{trial}</Text> : null}
      </Pressable>
    );
  };

  return (
    <Screen>
      <H1>SafeWalk Premium</H1>
      <P muted>Meer mensen die over je waken, meer controle over je check-ins, en een nep-oproep die je vooraf kunt inplannen.</P>
      {testStoreActive && <Notice kind="warn">Testabonnement — geen echte betaling.</Notice>}
      {status?.storePremium && <Notice kind="ok">Premium is actief{status.expiresAt ? ` tot ${new Date(status.expiresAt).toLocaleDateString('nl-NL')}` : ''}.</Notice>}
      {!status?.storePremium && status?.grantUntil ? <Notice kind="ok">Je hebt gratis Premium via een uitnodiging, tot {new Date(status.grantUntil).toLocaleDateString('nl-NL')}. Daarna ga je vanzelf terug naar gratis; er wordt niets afgeschreven.</Notice> : null}

      <Card>
        {PREMIUM.map(([icon, f]) => <P key={f}>{icon}  {f}</P>)}
      </Card>

      {!adult ? (
        <Notice kind="info">Premium kopen kan pas vanaf 16 jaar. Alle gratis veiligheidsfuncties blijven gewoon werken, ook de nep-oproep.</Notice>
      ) : (
        <>
          {(annual || monthly) && <View style={{ gap: 10 }}>{annual && planCard('annual', annual)}{monthly && planCard('monthly', monthly)}</View>}
          {!pkg && <P muted style={{ fontSize: 13 }}>De prijs komt alleen uit de winkel als een abonnement geladen is.</P>}
          {shown && <Notice kind={shown.k}>{shown.t}</Notice>}
          {canRetry && <Button title="Abonnementen opnieuw laden" variant="secondary" onPress={() => setAttempt((n) => n + 1)} />}
          {!status?.storePremium && (
            <Button title={pkg && chosen ? ctaLabel(chosen, pkg.product) : 'Word Premium'} disabled={!pkg} loading={busy || load?.state === 'loading'} onPress={() => run(() => buy(pkg!))} />
          )}
          {pkg && chosen && <P muted style={{ fontSize: 13 }}>{renewalNote(chosen, pkg.product)}</P>}
          <Button title="Aankopen herstellen" variant="secondary" disabled={!purchasesEnabled || !status?.userId} onPress={() => run(restore)} />

          <Card style={{ borderColor: t.purple, borderWidth: 2 }}>
            <P style={{ fontWeight: '800' }}>🎁 {REFERRAL_COPY.title}</P>
            <P muted style={{ fontSize: 14 }}>{REFERRAL_COPY.explain}</P>
            {referral && <P muted style={{ fontSize: 13 }}>{referral.remaining > 0 ? `Je kunt dit jaar nog ${referral.remaining} keer een maand verdienen.` : 'Je hebt dit jaar het maximum van 3 beloningen bereikt. Uitnodigen kan nog steeds.'}</P>}
            <Button title="Vriend(in) uitnodigen" variant="secondary" onPress={() => router.push('/contacts')} />
          </Card>
        </>
      )}

      <Card>
        <P>Altijd gratis</P>
        {FREE.map((f) => <P key={f} muted>✓ {f}</P>)}
        <P muted style={{ fontSize: 13 }}>Essentiële veiligheidsfuncties blijven gratis.</P>
      </Card>
    </Screen>
  );
}
