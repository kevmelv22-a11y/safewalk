import NetInfo from '@react-native-community/netinfo';
import { startSosRetry } from './sos';
import { flushLocationQueue } from './location';
import { flushIncidentQueue } from './incidentQueue';

/** Start herverzenden van SOS, locatiepunten en incident-pings zodra er weer internet is. */
export function startOfflineRetry() {
  const stopSos = startSosRetry();
  const flush = () => {
    void flushLocationQueue().catch(() => {});
    void flushIncidentQueue().catch(() => {});
  };
  const unsub = NetInfo.addEventListener((s) => { if (s.isConnected) flush(); });
  const iv = setInterval(flush, 15_000);
  flush();
  return () => { stopSos(); unsub(); clearInterval(iv); };
}
