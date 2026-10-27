// Gedeelde helpers voor SafeWalk Edge Functions (Deno)
import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export const admin = (): SupabaseClient =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

/** Valideert de JWT van de aanroeper en geeft de user-id terug. */
export async function requireUser(req: Request, db: SupabaseClient): Promise<string | null> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

export async function rateLimit(db: SupabaseClient, key: string, max: number, windowSec: number) {
  const { data, error } = await db.rpc('check_rate_limit', { p_key: key, p_max: max, p_window_seconds: windowSec });
  if (error) throw error;
  return data === true;
}

export async function audit(db: SupabaseClient, actor: string | null, action: string, target: string | null, meta = {}) {
  await db.from('audit_logs').insert({ actor_id: actor, action, target_id: target, meta });
}

type PushMsg = { title: string; body: string; data?: Record<string, unknown> };

/**
 * Verstuurt Expo push naar ontvangers en registreert per ontvanger de status in alert_deliveries.
 * 'sent' betekent: geaccepteerd door de Expo push-service — NIET gegarandeerd afgeleverd op het toestel.
 */
export async function pushToRecipients(db: SupabaseClient, alertId: string, recipientIds: string[], msg: PushMsg) {
  const results: Record<string, string> = {};
  for (const rid of recipientIds) {
    await db.from('alert_deliveries').upsert({ alert_id: alertId, recipient_id: rid, status: 'queued' }, { onConflict: 'alert_id,recipient_id' });
    const { data: tokens } = await db.from('push_tokens').select('token').eq('user_id', rid);
    if (!tokens?.length) { await setStatus(db, alertId, rid, 'no_token', 'Geen pushtoken geregistreerd'); results[rid] = 'no_token'; continue; }
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(Deno.env.get('EXPO_ACCESS_TOKEN') ? { Authorization: `Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN')}` } : {}) },
        body: JSON.stringify(tokens.map((t) => ({ to: t.token, title: msg.title, body: msg.body, data: msg.data, sound: 'default', priority: 'high', channelId: 'safety-alerts' }))),
      });
      const body = await res.json();
      const tickets: { status: string; message?: string; details?: { error?: string } }[] = body.data ?? [];
      const ok = res.ok && tickets.some((t) => t.status === 'ok');
      // ongeldige tokens opruimen
      for (let i = 0; i < tickets.length; i++) if (tickets[i].details?.error === 'DeviceNotRegistered') await db.from('push_tokens').delete().eq('token', tokens[i].token);
      const detail = ok ? null : (tickets.find((t) => t.status !== 'ok')?.message ?? `HTTP ${res.status}`);
      await setStatus(db, alertId, rid, ok ? 'sent' : 'failed', detail);
      results[rid] = ok ? 'sent' : 'failed';
    } catch (e) {
      await setStatus(db, alertId, rid, 'failed', String(e).slice(0, 200));
      results[rid] = 'failed';
    }
  }
  return results;
}
async function setStatus(db: SupabaseClient, alertId: string, rid: string, status: string, detail: string | null) {
  await db.from('alert_deliveries').update({ status, detail, updated_at: new Date().toISOString() }).eq('alert_id', alertId).eq('recipient_id', rid);
}

export const mapsLink = (lat?: number | null, lng?: number | null) =>
  lat != null && lng != null ? `https://maps.google.com/?q=${lat},${lng}` : null;
