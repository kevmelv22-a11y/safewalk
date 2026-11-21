/**
 * Pure hulpfuncties voor het Premium-scherm. Alle prijzen komen uit de winkel (RevenueCat-product); hier wordt
 * nooit een prijs of proefperiode verzonnen. Geen gegevens → niets tonen.
 */
type Period = { unit: string; value: number };
export type ProductLike = {
  price: number;
  priceString: string;
  pricePerMonthString?: string | null;
  introPrice?: { price: number; periodUnit: string; periodNumberOfUnits: number; cycles: number } | null;
  defaultOption?: { freePhase?: { billingPeriod?: Period | null } | null } | null;
};

const DAYS: Record<string, number> = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 };

/** Gratis proefperiode in dagen zoals de winkel hem meldt (Android: freePhase, iOS: introPrice met prijs 0). */
export function freeTrialDays(p: ProductLike | null | undefined): number | null {
  if (!p) return null;
  const fp = p.defaultOption?.freePhase?.billingPeriod;
  if (fp && DAYS[fp.unit] && fp.value > 0) return fp.value * DAYS[fp.unit];
  const ip = p.introPrice;
  if (ip && ip.price === 0 && DAYS[ip.periodUnit] && ip.periodNumberOfUnits > 0) return ip.periodNumberOfUnits * Math.max(1, ip.cycles) * DAYS[ip.periodUnit];
  return null;
}

export function trialLabel(days: number | null): string | null {
  if (!days) return null;
  if (days === 7) return 'Eerste week gratis';
  if (days % 30 === 0) return days === 30 ? 'Eerste maand gratis' : `Eerste ${days / 30} maanden gratis`;
  return `Eerste ${days} dagen gratis`;
}

/** Besparing van jaar t.o.v. 12× maand, afgerond op hele procenten. Alleen als beide winkelprijzen bekend zijn. */
export function annualSavingsPct(monthly: ProductLike | null | undefined, annual: ProductLike | null | undefined): number | null {
  if (!monthly || !annual || !(monthly.price > 0) || !(annual.price > 0)) return null;
  const pct = Math.round((1 - annual.price / (monthly.price * 12)) * 100);
  return pct >= 1 && pct < 100 ? pct : null;
}

export type Plan = 'annual' | 'monthly';

/** Standaard het jaarpakket voorselecteren als het bestaat; anders maand. */
export function defaultPlan(hasAnnual: boolean, hasMonthly: boolean): Plan | null {
  if (hasAnnual) return 'annual';
  if (hasMonthly) return 'monthly';
  return null;
}

/** Knoptekst, bv. "Start 7 dagen gratis" of "Word Premium – €24,99/jaar". */
export function ctaLabel(plan: Plan, p: ProductLike): string {
  const days = freeTrialDays(p);
  if (days) return `Start ${days} dagen gratis`;
  return `Word Premium – ${p.priceString}/${plan === 'annual' ? 'jaar' : 'maand'}`;
}

/** Kleine lettertjes onder de knop: wat je na de proefperiode betaalt en hoe je opzegt. */
export function renewalNote(plan: Plan, p: ProductLike): string {
  const days = freeTrialDays(p);
  const per = plan === 'annual' ? 'jaar' : 'maand';
  const after = days ? `Na ${days} dagen gratis betaal je ${p.priceString} per ${per}, tenzij je vóór het einde van de proefperiode opzegt.` : `Je betaalt ${p.priceString} per ${per}.`;
  return `${after} Verlengt automatisch; opzeggen kan altijd via Google Play of de App Store.`;
}
