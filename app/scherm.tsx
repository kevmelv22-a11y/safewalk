import { Redirect, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { screenshotMode } from '../src/lib/screenshotMode';
import { LanguagePicker } from '../src/components/LanguagePicker';
import { DashboardShell } from '../src/components/dashboard/DashboardShell';
import { DashboardHeader } from '../src/components/dashboard/DashboardHeader';
import { StatusPanel } from '../src/components/dashboard/StatusPanel';
import { ActionButtons } from '../src/components/ActionButtons';
import { NavGrid } from '../src/components/dashboard/NavGrid';
import { HelplinesBody } from './hulplijnen';
import { Card } from '../src/components/ui';

/** Static screens for language screenshots. Only rendered when EXPO_PUBLIC_SCREENSHOTS=1. */
export default function Scherm() {
  const params = useLocalSearchParams<{ view?: string; region?: string }>();
  if (!screenshotMode) return <Redirect href="/" />;
  const view = params.view ?? 'taal';
  if (view === 'nood') {
    const region = typeof params.region === 'string' ? params.region : 'NL';
    return <HelplinesBody region={region} />;
  }
  if (view === 'dashboard') {
    const noop = () => undefined;
    return (
      <View testID="dashboard-preview" style={{ flex: 1 }}>
        <DashboardShell>
          <DashboardHeader />
          <StatusPanel sharing={false} contactCount={2} />
          <ActionButtons onUnsafe={noop} onComeQuick={noop} onSafe={noop} />
          <NavGrid
            onLiveNow={noop} onCall112={noop} onContacts={noop} onHistory={noop} onSos={noop}
            onAssistant={noop} onPremium={noop} onSettings={noop} onFakeCall={noop} onCheckIn={noop}
            onHulplijnen={noop} onSafePlaces={noop}
          />
        </DashboardShell>
      </View>
    );
  }
  return (
    <View testID="language-preview" style={{ flex: 1 }}>
      <DashboardShell>
        <Card>
          <LanguagePicker />
        </Card>
      </DashboardShell>
    </View>
  );
}
