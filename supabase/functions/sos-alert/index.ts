// POST { client_ref, session_id?, lat?, lng?, accuracy_m?, location_at?, recipient_ids? }
// Registreert een SOS-incident (idempotent via client_ref) en pusht naar vertrouwde contacten.
// Belt NOOIT 112.
import { admin, audit, cors, json, mapsLink, pushToRecipients, rateLimit, requireUser } from '../_shared/common.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'METHOD' }, 405);
  const db = admin();
  const uid = await requireUser(req, db);
  if (!uid) return json({ error: 'UNAUTHORIZED' }, 401);
  if (!(await rateLimit(db, `sos:${uid}`, 5, 600))) return json({ error: 'RATE_LIMITED' }, 429);

  const b = await req.json().catch(() => ({}));
  if (typeof b.client_ref !== 'string') return json({ error: 'BAD_REQUEST' }, 400);

  // Alleen geaccepteerde, niet-geblokkeerde contacten van de afzender
  const { data: contacts } = await db.from('trusted_contacts').select('contact_id').eq('owner_id', uid).eq('status', 'accepted');
  let recipients = (contacts ?? []).map((c) => c.contact_id as string);
  if (Array.isArray(b.recipient_ids) && b.recipient_ids.length) recipients = recipients.filter((r) => b.recipient_ids.includes(r));

  // Idempotent: dezelfde client_ref levert hetzelfde incident op (offline-wachtrij kan opnieuw proberen)
  const { data: existing } = await db.from('safety_alerts').select('*').eq('client_ref', b.client_ref).maybeSingle();
  let alert = existing;
  if (existing && existing.user_id !== uid) return json({ error: 'FORBIDDEN' }, 403);
  if (!alert) {
    const { data, error } = await db.from('safety_alerts').insert({
      user_id: uid, kind: 'sos', client_ref: b.client_ref, session_id: b.session_id ?? null,
      lat: b.lat ?? null, lng: b.lng ?? null, accuracy_m: b.accuracy_m ?? null, location_at: b.location_at ?? null,
    }).select().single();
    if (error) return json({ error: error.message }, 400);
    alert = data;
    await audit(db, uid, 'sos.triggered', alert.id, { recipients: recipients.length });
  }
  if (alert.status === 'cancelled') return json({ alert_id: alert.id, deliveries: {} });

  const { data: prof } = await db.from('profiles').select('display_name').eq('id', uid).single();
  const name = prof?.display_name || 'Je contact';
  const link = mapsLink(alert.lat, alert.lng);
  const deliveries = await pushToRecipients(db, alert.id, recipients, {
    title: `🆘 SOS van ${name}`,
    body: link ? `${name} heeft SOS geactiveerd. Laatst bekende locatie: ${link}` : `${name} heeft SOS geactiveerd. Geen recente locatie beschikbaar.`,
    data: { type: 'sos', alert_id: alert.id, session_id: alert.session_id },
  });
  return json({ alert_id: alert.id, deliveries });
});
