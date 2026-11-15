import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { classifyConnection, CONNECTION_COPY, type ConnectionKind, type NetSnapshot } from '../lib/connectionStatus';

function snap(s: NetInfoState): NetSnapshot {
  return { isConnected: s.isConnected, isInternetReachable: s.isInternetReachable, type: s.type };
}

/** Eerlijke verbindingsstatus: Verbonden / Alleen SMS / Geen bereik. */
export function ConnectionBanner() {
  const [kind, setKind] = useState<ConnectionKind>('online');
  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => setKind(classifyConnection(snap(s))));
    void NetInfo.fetch().then((s) => setKind(classifyConnection(snap(s)))).catch(() => {});
    return () => unsub();
  }, []);
  const copy = CONNECTION_COPY[kind];
  const bg = kind === 'online' ? '#14532d' : kind === 'sms_only' ? '#7c2d12' : '#7f1d1d';
  return (
    <View accessibilityRole="text" style={{ backgroundColor: bg, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 }}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{copy.title}</Text>
      <Text style={{ color: 'rgba(255,255,255,0.92)', fontSize: 12, lineHeight: 16, marginTop: 2 }}>{copy.body}</Text>
    </View>
  );
}
