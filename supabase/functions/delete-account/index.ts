// Verwijdert het account en (via ON DELETE CASCADE) alle gekoppelde data, incl. locatiegeschiedenis.
import { admin, audit, cors, json, rateLimit, requireUser } from '../_shared/common.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'METHOD' }, 405);
  const db = admin();
  const uid = await requireUser(req, db);
  if (!uid) return json({ error: 'UNAUTHORIZED' }, 401);
  if (!(await rateLimit(db, `delete:${uid}`, 3, 3600))) return json({ error: 'RATE_LIMITED' }, 429);
  const b = await req.json().catch(() => ({}));
  if (b.confirm !== 'VERWIJDER') return json({ error: 'CONFIRMATION_REQUIRED' }, 400);
  await db.from('location_updates').delete().eq('user_id', uid);
  await audit(db, null, 'account.deleted', null, {}); // geen PII in log
  const { error } = await db.auth.admin.deleteUser(uid);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
});
