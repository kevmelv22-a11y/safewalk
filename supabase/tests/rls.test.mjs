// RLS-tests tegen echte Postgres (PGlite, in-process). Run: npm run test:sql
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const db = new PGlite();
// Minimale Supabase-omgeving: auth-schema, rollen, auth.uid()
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
`);
const migDir = join(here, '..', 'migrations');
for (const f of readdirSync(migDir).sort()) await db.exec(readFileSync(join(migDir, f), 'utf8'));
await db.exec(`grant usage on schema public to authenticated, anon;
  grant select, insert, update, delete on all tables in schema public to authenticated, anon;`);
// kolom-revokes opnieuw toepassen na de brede grant (zoals Supabase default privileges + migratie)
await db.exec(readFileSync(join(migDir, readdirSync(migDir).sort()[0]), 'utf8').split('-- Kolom-niveau')[1].replace(/^[^\n]*\n/, ''));

const U = { owner: '11111111-1111-1111-1111-111111111111', friend: '22222222-2222-2222-2222-222222222222',
  stranger: '33333333-3333-3333-3333-333333333333', c3: '44444444-4444-4444-4444-444444444444',
  c4: '55555555-5555-5555-5555-555555555555', admin: '66666666-6666-6666-6666-666666666666' };
for (const id of Object.values(U)) await db.query('insert into auth.users(id) values ($1)', [id]);
await db.query('insert into admins values ($1)', [U.admin]);

async function as(uid, sql, params = []) {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  await db.exec(uid ? 'set role authenticated' : 'set role anon');
  try { return (await db.query(sql, params)).rows; } finally { await db.exec('reset role'); }
}
async function rejects(p, re) { await assert.rejects(p, re); }
let passed = 0; const t = async (name, fn) => { await fn(); passed++; console.log('✓', name); };

const invite = async (from, to) => {
  const [{ create_invitation: tok }] = await as(from, 'select create_invitation()');
  await as(to, 'select respond_invitation($1, true)', [tok]);
};

await t('uitnodiging opslaan als hash, niet als token', async () => {
  const [{ create_invitation: tok }] = await as(U.owner, 'select create_invitation()');
  const rows = await db.query('select token_hash from contact_invitations');
  assert.ok(!rows.rows.some(r => r.token_hash === tok));
  await as(U.friend, 'select respond_invitation($1, true)', [tok]);
  await rejects(as(U.stranger, 'select respond_invitation($1, true)', [tok]), /INVITATION_INVALID/);
});

let sid;
await t('sessie starten met geaccepteerd contact; vreemde kan niet als kijker', async () => {
  await rejects(as(U.owner, `select start_session('Thuis',null,null,now()+interval '30 min',array[$1]::uuid[])`, [U.stranger]), /VIEWER_NOT_TRUSTED/);
  [{ start_session: sid }] = await as(U.owner, `select start_session('Thuis',52.1,5.1,now()+interval '30 min',array[$1]::uuid[])`, [U.friend]);
  await as(U.owner, `insert into location_updates(session_id,user_id,lat,lng,accuracy_m,recorded_at) values ($1,$2,52.1,5.1,12,now())`, [sid, U.owner]);
});

await t('toegestane kijker ziet locatie', async () => {
  assert.equal((await as(U.friend, 'select * from location_updates where session_id=$1', [sid])).length, 1);
});
await t('ongeautoriseerde gebruiker, anon en admin zien GEEN locatie', async () => {
  assert.equal((await as(U.stranger, 'select * from location_updates')).length, 0);
  assert.equal((await as(U.admin, 'select * from location_updates')).length, 0);
  assert.equal((await as(null, 'select * from location_updates')).length, 0);
  assert.equal((await as(U.stranger, 'select * from safety_sessions')).length, 0);
});
await t('vreemde kan geen locatie in andermans sessie schrijven', async () => {
  await rejects(as(U.stranger, `insert into location_updates(session_id,user_id,lat,lng,recorded_at) values ($1,$2,1,1,now())`, [sid, U.stranger]), /row-level security/);
});
await t('kijker intrekken → direct geen toegang', async () => {
  await as(U.owner, 'select revoke_viewer($1,$2)', [sid, U.friend]);
  assert.equal((await as(U.friend, 'select * from location_updates')).length, 0);
});
await t('contact verwijderen → toegang ingetrokken', async () => {
  const [{ start_session: s2 }] = await as(U.owner, `select start_session('Werk',null,null,now()+interval '30 min',array[$1]::uuid[])`, [U.friend]);
  await as(U.owner, `insert into location_updates(session_id,user_id,lat,lng,recorded_at) values ($1,$2,1,1,now())`, [s2, U.owner]);
  assert.equal((await as(U.friend, 'select * from location_updates where session_id=$1', [s2])).length, 1);
  await as(U.owner, `update trusted_contacts set status='removed' where contact_id=$1`, [U.friend]);
  assert.equal((await as(U.friend, 'select * from location_updates')).length, 0);
  await rejects(as(U.owner, `update trusted_contacts set status='accepted' where contact_id=$1`, [U.friend]), /row-level security/);
  sid = s2;
});
await t('verlopen sessie → geen toegang en geen nieuwe locaties', async () => {
  await invite(U.owner, U.c3);
  const [{ start_session: s3 }] = await as(U.owner, `select start_session('X',null,null,now()+interval '30 min',array[$1]::uuid[])`, [U.c3]);
  await as(U.owner, `insert into location_updates(session_id,user_id,lat,lng,recorded_at) values ($1,$2,1,1,now())`, [s3, U.owner]);
  await db.query(`update safety_sessions set expires_at = now() - interval '1 min' where id=$1`, [s3]);
  assert.equal((await as(U.c3, 'select * from location_updates where session_id=$1', [s3])).length, 0);
  await rejects(as(U.owner, `insert into location_updates(session_id,user_id,lat,lng,recorded_at) values ($1,$2,1,1,now())`, [s3, U.owner]), /row-level security/);
});
await t('beëindigde sessie → geen toegang', async () => {
  const [{ start_session: s4 }] = await as(U.owner, `select start_session('Y',null,null,now()+interval '30 min',array[$1]::uuid[])`, [U.c3]);
  await as(U.owner, `insert into location_updates(session_id,user_id,lat,lng,recorded_at) values ($1,$2,1,1,now())`, [s4, U.owner]);
  await as(U.owner, 'select end_session($1)', [s4]);
  assert.equal((await as(U.c3, 'select * from location_updates where session_id=$1', [s4])).length, 0);
});
await t('gratis limiet: max 2 contacten (server-side)', async () => {
  await invite(U.owner, U.friend); // opnieuw → 2 actief (friend, c3)
  const [{ create_invitation: tok }] = await as(U.owner, 'select create_invitation()');
  await rejects(as(U.c4, 'select respond_invitation($1,true)', [tok]), /CONTACT_LIMIT/);
});
await t('blokkeren verwijdert relatie en uitnodiging kan niet meer', async () => {
  await as(U.c3, 'insert into blocks(blocker_id, blocked_id) values ($1,$2)', [U.c3, U.owner]);
  const rows = await db.query(`select status from trusted_contacts where owner_id=$1 and contact_id=$2`, [U.owner, U.c3]);
  assert.equal(rows.rows[0].status, 'removed');
  const [{ create_invitation: tok }] = await as(U.owner, 'select create_invitation()');
  await rejects(as(U.c3, 'select respond_invitation($1,true)', [tok]), /INVITATION_INVALID/);
});
await t('gemiste check-in escaleert server-side met laatste locatie', async () => {
  const [{ start_session: s5 }] = await as(U.owner, `select start_session('Z',null,null,now()+interval '1 min',array[$1]::uuid[])`, [U.friend]);
  await as(U.owner, `insert into location_updates(session_id,user_id,lat,lng,recorded_at) values ($1,$2,52.3,4.9,now())`, [s5, U.owner]);
  await db.query(`update check_ins set due_at = now() - interval '10 min' where session_id=$1`, [s5]);
  const r = await db.query('select * from escalate_missed_check_ins()');
  assert.equal(r.rows.length, 1);
  const a = await db.query('select * from safety_alerts where session_id=$1', [s5]);
  assert.equal(a.rows[0].lat, 52.3);
  await rejects(as(U.owner, 'select escalate_missed_check_ins()'), /permission denied/);
});
await t('retentie verwijdert locaties 24u na einde', async () => {
  await db.query(`update safety_sessions set ended_at = now() - interval '25 hours' where ended_at is not null`);
  await db.query('select purge_old_locations()');
  const r = await db.query(`select count(*)::int n from location_updates lu join safety_sessions s on s.id=lu.session_id where s.ended_at is not null`);
  assert.equal(r.rows[0].n, 0);
});
await t('audit_logs niet leesbaar voor gewone gebruiker, wel admin', async () => {
  assert.equal((await as(U.owner, 'select * from audit_logs')).length, 0);
  assert.ok((await as(U.admin, 'select * from audit_logs')).length > 0);
});
await t('rate limiter', async () => {
  for (let i = 0; i < 3; i++) assert.equal((await db.query(`select check_rate_limit('k',3,60) ok`)).rows[0].ok, true);
  assert.equal((await db.query(`select check_rate_limit('k',3,60) ok`)).rows[0].ok, false);
});
console.log(`\n${passed} SQL/RLS-tests geslaagd`);
