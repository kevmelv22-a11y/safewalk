// Elke minuut aangeroepen door pg_cron (header x-cron-secret). Escaleert gemiste check-ins
// server-side, onafhankelijk van of de app nog draait, en pusht naar de sessiekijkers.
import { admin, audit, json, mapsLink, pushToRecipients } from '../_shared/common.ts';

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'UNAUTHORIZED' }, 401);
  const db = admin();
  const { data: escalated, error } = await db.rpc('escalate_missed_check_ins');
  if (error) return json({ error: error.message }, 500);

  const out = [];
  for (const e of escalated ?? []) {
    const { data: alert } = await db.from('safety_alerts').select('*').eq('id', e.alert_id).single();
    const { data: viewers } = await db.from('session_viewers').select('viewer_id').eq('session_id', e.session_id).is('revoked_at', null);
    const { data: prof } = await db.from('profiles').select('display_name').eq('id', e.user_id).single();
    const name = prof?.display_name || 'Je contact';
    const link = mapsLink(alert?.lat, alert?.lng);
    const res = await pushToRecipients(db, e.alert_id, (viewers ?? []).map((v) => v.viewer_id), {
      title: `⚠️ ${name} heeft niet ingecheckt`,
      body: `${name} is niet op tijd bevestigd aangekomen. ${link ? `Laatst bekende locatie: ${link}` : 'Geen recente locatie.'} Probeer contact op te nemen.`,
      data: { type: 'missed_check_in', alert_id: e.alert_id, session_id: e.session_id },
    });
    // ook de gebruiker zelf nog een melding sturen
    await pushToRecipients(db, e.alert_id, [e.user_id], { title: 'Alles goed?', body: 'Je check-in is gemist. Je contacten zijn gewaarschuwd. Open SafeWalk.', data: { type: 'check_in', session_id: e.session_id } });
    await audit(db, null, 'check_in.escalated', e.session_id, { deliveries: res });
    out.push({ session_id: e.session_id, deliveries: res });
  }
  return json({ escalated: out.length, out });
});
