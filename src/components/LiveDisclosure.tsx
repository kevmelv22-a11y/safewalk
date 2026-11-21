import { Modal, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../lib/theme';
import { Button } from './ui';
import { DISCLOSURE } from '../content/liveSharing';

/**
 * Duidelijke uitleg vóór de locatievraag van het systeem (Play "prominent disclosure"):
 * wat, met wie, wanneer, hoe lang, en hoe je het stopt. Geen toestemming = niets starten.
 */
export function LiveDisclosure({ visible, privacyMode, onAccept, onCancel }: { visible: boolean; privacyMode: boolean; onAccept: () => void; onCancel: () => void }) {
  const t = useTheme();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel} presentationStyle="fullScreen">
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <ScrollView contentContainerStyle={{ padding: 22, gap: 14 }}>
          <Text accessibilityRole="header" style={{ color: t.text, fontSize: 26, fontWeight: '800' }}>📍 {DISCLOSURE.title}</Text>
          {DISCLOSURE.points.map((p) => (
            <View key={p} style={{ flexDirection: 'row', gap: 10 }}>
              <Text style={{ color: t.purple, fontSize: 18, fontWeight: '800' }}>•</Text>
              <Text style={{ color: t.text, fontSize: 16, lineHeight: 23, flex: 1 }}>{p}</Text>
            </View>
          ))}
          {privacyMode && <Text style={{ color: t.text, fontSize: 16, lineHeight: 23, backgroundColor: t.field, padding: 12, borderRadius: 12 }}>🔒 {DISCLOSURE.privacyPoint}</Text>}
          <Text style={{ color: t.muted, fontSize: 14, lineHeight: 20 }}>Hierna vraagt je telefoon om locatietoestemming. Kies “Tijdens gebruik van de app” (en op iPhone “Nauwkeurige locatie” aan).</Text>
          <Button title={DISCLOSURE.accept} variant="success" onPress={onAccept} />
          <Button title={DISCLOSURE.cancel} variant="secondary" onPress={onCancel} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
