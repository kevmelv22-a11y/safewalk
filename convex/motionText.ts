/** Pure teksten (geen server-imports), zodat de app dit veilig kan bundelen. */
export type SignalKind = 'stationary' | 'deviation' | 'no_data';
export const signalText: Record<SignalKind, string> = {
  stationary: 'Je staat al een tijdje stil. Alles goed?',
  deviation: 'Je lijkt verder van je bestemming te gaan. Alles goed?',
  no_data: 'We ontvangen al even geen locatie meer. Alles goed? (Controleer GPS en internet.)',
};
