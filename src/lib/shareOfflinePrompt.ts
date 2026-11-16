/** Beslis wanneer de vooringevulde sms-herinnering (alle platformen, geen automatische verzending) getoond mag worden. */
import type { ConnectionKind } from './connectionStatus';

export const OFFLINE_PROMPT_INTERVAL_MS = 15 * 60_000;

export function shouldShowOfflineSmsPrompt(o: {
  active: boolean;
  connection: ConnectionKind;
  lastPromptAt?: number;
  now: number;
  /** Android + opt-in + toestemming + ontvangers: de automatische sms neemt het over. */
  autoSmsActive?: boolean;
}): boolean {
  if (!o.active) return false;
  if (o.connection === 'online') return false;
  if (o.autoSmsActive) return false;
  if (o.lastPromptAt !== undefined && o.now - o.lastPromptAt < OFFLINE_PROMPT_INTERVAL_MS) return false;
  return true;
}
