/** Pure classificatie van de verbindingsstatus (testbaar, zonder NetInfo). */
export type ConnectionKind = 'online' | 'sms_only' | 'offline';

export type NetSnapshot = {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  type?: string | null;
};

export function classifyConnection(s: NetSnapshot): ConnectionKind {
  const type = (s.type ?? 'unknown').toLowerCase();
  if (s.isConnected === false || type === 'none') return 'offline';
  if (s.isInternetReachable === true) return 'online';
  if (s.isInternetReachable === false) {
    // Alleen op mobiel netwerk kán een sms nog werken; wifi zonder internet is geen sms.
    return type === 'cellular' ? 'sms_only' : 'offline';
  }
  // Bereikbaarheid nog onbekend, maar er is een link: toon "Verbonden" zonder te claimen dat iets is aangekomen.
  return s.isConnected ? 'online' : 'offline';
}

export const CONNECTION_COPY: Record<ConnectionKind, { title: string; body: string }> = {
  online: {
    title: 'Verbonden',
    body: 'Meldingen gaan via internet. Of ze aankomen op de telefoon van je contacten is niet gegarandeerd.',
  },
  sms_only: {
    title: 'Alleen SMS',
    body: 'Geen internet. SafeWalk kan niets automatisch versturen: Google Play en iPhone staan automatische sms niet toe. Locatie wordt bewaard en later verstuurd. Je kunt zelf een vooringevulde sms versturen als het mobiele netwerk dat toelaat.',
  },
  offline: {
    title: 'Geen bereik – locatie wordt bewaard en verstuurd zodra mogelijk',
    body: 'Zonder enig netwerkbereik (ook geen sms) kan niets verstuurd worden. Punten blijven op dit toestel tot er weer verbinding is.',
  },
};
