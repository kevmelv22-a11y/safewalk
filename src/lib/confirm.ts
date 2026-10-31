import { Alert, Platform } from 'react-native';

/** Bevestigingsdialoog die ook op web werkt (Alert.alert met knoppen doet daar niets). */
export function confirmAction(title: string, message: string, confirmText: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [{ text: 'Annuleren', style: 'cancel' }, { text: confirmText, style: 'destructive', onPress: onConfirm }]);
}

export function showError(message: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(message);
  else Alert.alert('Fout', message);
}
