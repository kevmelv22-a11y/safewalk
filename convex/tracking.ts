import { httpAction, internalQuery, mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { internal } from './_generated/api';
import { audit, fail, randomToken, rateLimit, requireUser, sha256Hex } from './lib';

const DEFAULT_TTL_MS = 2 * 60 * 60_000;
const MAX_TTL_MS = 24 * 60 * 60_000;

export const createShareLink = mutation({
  args: {
    sessionId: v.optional(v.id('sessions')),
    incidentId: v.optional(v.id('incidents')),
    label: v.optional(v.string()),
    ttlMs: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    const uid = await requireUser(ctx);
    await rateLimit(ctx, `share-create:${uid}`, 20, 60 * 60_000);
    if (a.sessionId) {
      const s = await ctx.db.get(a.sessionId);
      if (!s || s.userId !== uid) fail('FORBIDDEN');
    }
    if (a.incidentId) {
      const i = await ctx.db.get(a.incidentId);
      if (!i || i.userId !== uid) fail('FORBIDDEN');
    }
    const ttl = Math.min(Math.max(a.ttlMs ?? DEFAULT_TTL_MS, 5 * 60_000), MAX_TTL_MS);
    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = Date.now() + ttl;
    const id = await ctx.db.insert('shareLinks', {
      userId: uid, tokenHash, sessionId: a.sessionId, incidentId: a.incidentId,
      label: a.label?.slice(0, 80), expiresAt, createdAt: Date.now(),
    });
    await audit(ctx, uid, 'share.create', id, { ttl });
    return { id, token, expiresAt, path: `/track/live?token=${token}` };
  },
});

export const revokeShareLink = mutation({
  args: { id: v.id('shareLinks') },
  handler: async (ctx, { id }) => {
    const uid = await requireUser(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.userId !== uid) fail('NOT_FOUND');
    await ctx.db.patch(id, { revokedAt: Date.now() });
    await audit(ctx, uid, 'share.revoke', id);
  },
});

export const myShareLinks = query({
  args: {},
  handler: async (ctx) => {
    const uid = await getAuthUserId(ctx);
    if (!uid) return [];
    const rows = await ctx.db.query('shareLinks').withIndex('by_user', (q) => q.eq('userId', uid)).collect();
    const now = Date.now();
    return rows.filter((r) => !r.revokedAt).map((r) => ({
      id: r._id, label: r.label ?? null, expiresAt: r.expiresAt, expired: r.expiresAt < now,
      sessionId: r.sessionId ?? null, incidentId: r.incidentId ?? null, createdAt: r.createdAt,
    }));
  },
});

export const resolvePublic = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    if (!/^[0-9a-f]{64}$/.test(token)) return null;
    const tokenHash = await sha256Hex(token);
    const row = await ctx.db.query('shareLinks').withIndex('by_hash', (q) => q.eq('tokenHash', tokenHash)).first();
    if (!row || row.revokedAt || row.expiresAt < Date.now()) return null;
    const now = Date.now();
    let location: null | { lat: number; lng: number; accuracyM: number | null; recordedAt: number; stale: boolean; source: string } = null;
    if (row.sessionId) {
      const locs = await ctx.db.query('locations').withIndex('by_session', (q) => q.eq('sessionId', row.sessionId!)).order('desc').take(1);
      if (locs[0]) {
        const age = now - locs[0].recordedAt;
        location = { lat: locs[0].lat, lng: locs[0].lng, accuracyM: locs[0].accuracyM ?? null, recordedAt: locs[0].recordedAt, stale: age > 2 * 60_000, source: 'session' };
      }
    }
    if (!location && row.incidentId) {
      const inc = await ctx.db.get(row.incidentId);
      if (inc?.alertId) {
        const al = await ctx.db.get(inc.alertId);
        if (al?.lat !== undefined && al?.lng !== undefined) {
          const recordedAt = al.locationAt ?? al._creationTime;
          location = { lat: al.lat, lng: al.lng, accuracyM: al.accuracyM ?? null, recordedAt, stale: now - recordedAt > 2 * 60_000, source: 'incident' };
        }
      }
    }
    if (!location) {
      const alerts = await ctx.db.query('alerts').withIndex('by_user', (q) => q.eq('userId', row.userId)).order('desc').take(8);
      for (const al of alerts) {
        if (al.status === 'open' && al.lat !== undefined && al.lng !== undefined) {
          const recordedAt = al.locationAt ?? al._creationTime;
          location = { lat: al.lat, lng: al.lng, accuracyM: al.accuracyM ?? null, recordedAt, stale: now - recordedAt > 2 * 60_000, source: 'alert' };
          break;
        }
      }
    }
    return { expiresAt: row.expiresAt, label: row.label ?? null, location };
  },
});

export const publicLocation = httpAction(async (ctx, req) => {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  const data = await ctx.runQuery(internal.tracking.resolvePublic, { token });
  if (!data) {
    return new Response(JSON.stringify({ error: 'invalid_or_expired' }), {
      status: 404, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
    });
  }
  return new Response(JSON.stringify({
    ok: true, expiresAt: data.expiresAt, label: data.label, location: data.location,
    note: 'SafeWalk deelt alleen wat de gebruiker deelt. Dit is geen 112-hulpdienst.',
  }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
});

export const publicPage = httpAction(async (ctx, req) => {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  const data = await ctx.runQuery(internal.tracking.resolvePublic, { token });
  const site = (process.env.CONVEX_SITE_URL ?? '').replace(/\/$/, '');
  if (!data) {
    return new Response('<!doctype html><meta charset=utf-8><meta name="robots" content="noindex"/><title>Link ongeldig</title><p>Deze SafeWalk-link is ongeldig, verlopen of ingetrokken.</p>', {
      status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' },
    });
  }
  const api = `${site}/track/location?token=${encodeURIComponent(token)}`;
  const html = `<!doctype html>
<html lang="nl"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex,nofollow"/>
<title>SafeWalk live locatie</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin=""/>
<style>
html,body,#map{height:100%;margin:0}
.bar{position:fixed;z-index:1000;left:0;right:0;top:0;background:#0f172a;color:#fff;padding:10px 14px;font:15px/1.4 system-ui,sans-serif}
.bar small{opacity:.85;display:block;margin-top:4px}
.stale{color:#fbbf24;font-weight:700}
.attr{position:fixed;bottom:8px;right:8px;z-index:1000;background:rgba(255,255,255,.92);padding:4px 8px;font:12px system-ui;border-radius:6px}
</style></head><body>
<div class="bar">SafeWalk live locatie<small id="meta">Laden…</small></div>
<div id="map"></div>
<div class="attr">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors · data ODbL</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
<script>
const API=${JSON.stringify(api)};
const map=L.map('map').setView([52.37,4.9],13);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
let marker=null;
async function tick(){
  try{
    const r=await fetch(API,{cache:'no-store'});
    const j=await r.json();
    const m=document.getElementById('meta');
    if(!j.ok){ m.textContent='Link ongeldig.'; return; }
    if(!j.location){ m.textContent='Geen recente locatie. Link geldig tot '+new Date(j.expiresAt).toLocaleString('nl-NL'); return; }
    const {lat,lng,recordedAt,stale,accuracyM}=j.location;
    const when=new Date(recordedAt).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    m.innerHTML=(stale?'<span class="stale">Verouderd</span> · ':'Actueel · ')+when+(accuracyM!=null?' · ±'+Math.round(accuracyM)+' m':'')+' · verloopt '+new Date(j.expiresAt).toLocaleString('nl-NL');
    if(!marker){ marker=L.marker([lat,lng]).addTo(map); map.setView([lat,lng],15); }
    else marker.setLatLng([lat,lng]);
  }catch(e){ document.getElementById('meta').textContent='Kon locatie niet laden.'; }
}
tick(); setInterval(tick,10000);
</script></body></html>`;
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
});
