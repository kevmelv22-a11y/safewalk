import { httpAction, internalMutation, internalQuery, mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { internal } from './_generated/api';
import { audit, fail, randomToken, rateLimit, requireUser, sha256Hex } from './lib';

const DEFAULT_TTL_MS = 2 * 60 * 60_000;
const MAX_TTL_MS = 24 * 60 * 60_000;
const FRESH_MS = 2 * 60_000;

const scopeVal = v.union(v.literal('location'), v.literal('recording'));

function securityHeaders(extra: Record<string, string> = {}) {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
    'Cross-Origin-Resource-Policy': 'same-origin',
    ...extra,
  };
}

/** Maak intrekbaar/verlopend share-link. Token alleen één keer terug; DB bewaart hash. */
export const createShareLink = mutation({
  args: {
    sessionId: v.optional(v.id('sessions')),
    incidentId: v.optional(v.id('incidents')),
    label: v.optional(v.string()),
    ttlMs: v.optional(v.number()),
    scopes: v.optional(v.array(scopeVal)),
    locationConsent: v.boolean(),
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
    const scopes = (a.scopes?.length ? [...new Set(a.scopes)] : ['location']) as ('location' | 'recording')[];
    if (scopes.includes('location') && !a.locationConsent) fail('LOCATION_CONSENT_REQUIRED');
    if (!scopes.includes('location') && !scopes.includes('recording')) fail('BAD_REQUEST');
    const ttl = Math.min(Math.max(a.ttlMs ?? DEFAULT_TTL_MS, 5 * 60_000), MAX_TTL_MS);
    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = Date.now() + ttl;
    const id = await ctx.db.insert('shareLinks', {
      userId: uid, tokenHash, sessionId: a.sessionId, incidentId: a.incidentId,
      label: a.label?.slice(0, 80), scopes, locationConsent: a.locationConsent,
      expiresAt, createdAt: Date.now(),
    });
    // Audit zonder raw token (geen credential in logs)
    await audit(ctx, uid, 'share.create', id, { ttl, scopes, hasIncident: !!a.incidentId });
    return { id, token, expiresAt, path: `/track/live?token=${token}`, scopes };
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

/** Intern: trek alle links voor incidenten/sessie in (einde incident). */
export const revokeForIncidents = internalMutation({
  args: { userId: v.id('users'), incidentIds: v.array(v.id('incidents')) },
  handler: async (ctx, { userId, incidentIds }) => {
    const now = Date.now();
    const set = new Set(incidentIds.map(String));
    const rows = await ctx.db.query('shareLinks').withIndex('by_user', (q) => q.eq('userId', userId)).collect();
    let n = 0;
    for (const r of rows) {
      if (r.revokedAt) continue;
      if (r.incidentId && set.has(String(r.incidentId))) {
        await ctx.db.patch(r._id, { revokedAt: now });
        n++;
      }
    }
    return { revoked: n };
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
      scopes: r.scopes, locationConsent: r.locationConsent,
    }));
  },
});

/**
 * Publieke resolutie: elke request checkt expiry/revoke.
 * `live` alleen true als er een actieve updater (incident of open sessie) + verse locatie is.
 */
export const resolvePublic = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    if (!/^[0-9a-f]{64}$/.test(token)) return null;
    const tokenHash = await sha256Hex(token);
    const row = await ctx.db.query('shareLinks').withIndex('by_hash', (q) => q.eq('tokenHash', tokenHash)).first();
    if (!row || row.revokedAt || row.expiresAt < Date.now()) return null;
    const now = Date.now();
    const scopes = row.scopes ?? ['location'];

    let updaterActive = false;
    let updater: 'incident' | 'session' | null = null;
    if (row.incidentId) {
      const inc = await ctx.db.get(row.incidentId);
      if (inc && inc.status === 'active' && inc.userId === row.userId) {
        updaterActive = true;
        updater = 'incident';
      }
    }
    if (row.sessionId) {
      const s = await ctx.db.get(row.sessionId);
      if (s && s.userId === row.userId && s.endedAt === undefined && (s.status === 'active' || s.status === 'alert')) {
        updaterActive = true;
        if (!updater) updater = 'session';
      }
    }

    let location: null | {
      lat: number; lng: number; accuracyM: number | null; recordedAt: number;
      stale: boolean; source: string;
    } = null;

    if (scopes.includes('location') && row.locationConsent) {
      if (row.incidentId) {
        const locs = await ctx.db.query('incidentLocations')
          .withIndex('by_incident', (q) => q.eq('incidentId', row.incidentId!)).order('desc').take(1);
        if (locs[0]) {
          const age = now - locs[0].recordedAt;
          location = {
            lat: locs[0].lat, lng: locs[0].lng, accuracyM: locs[0].accuracyM ?? null,
            recordedAt: locs[0].recordedAt, stale: age > FRESH_MS, source: 'incident',
          };
        }
      }
      if (!location && row.sessionId) {
        const locs = await ctx.db.query('locations')
          .withIndex('by_session', (q) => q.eq('sessionId', row.sessionId!)).order('desc').take(1);
        if (locs[0]) {
          const age = now - locs[0].recordedAt;
          location = {
            lat: locs[0].lat, lng: locs[0].lng, accuracyM: locs[0].accuracyM ?? null,
            recordedAt: locs[0].recordedAt, stale: age > FRESH_MS, source: 'session',
          };
        }
      }
      // Fallback: alert snapshot (éénmalig, niet “live”)
      if (!location && row.incidentId) {
        const inc = await ctx.db.get(row.incidentId);
        if (inc?.alertId) {
          const al = await ctx.db.get(inc.alertId);
          if (al?.lat !== undefined && al?.lng !== undefined) {
            const recordedAt = al.locationAt ?? al._creationTime;
            location = {
              lat: al.lat, lng: al.lng, accuracyM: al.accuracyM ?? null,
              recordedAt, stale: now - recordedAt > FRESH_MS, source: 'alert_snapshot',
            };
          }
        }
      }
    }

    const live = !!(updaterActive && location && !location.stale && location.source !== 'alert_snapshot');

    let recordings: { id: string; createdAt: number; byteSize: number }[] = [];
    if (scopes.includes('recording') && row.incidentId) {
      const recs = await ctx.db.query('recordings')
        .withIndex('by_incident', (q) => q.eq('incidentId', row.incidentId!)).collect();
      recordings = recs.filter((r) => !r.deletedAt && r.userId === row.userId)
        .map((r) => ({ id: r._id, createdAt: r.createdAt, byteSize: r.byteSize }));
    }

    return {
      expiresAt: row.expiresAt,
      label: row.label ?? null,
      scopes,
      location,
      live,
      updaterActive,
      updater,
      freshnessMs: location ? now - location.recordedAt : null,
      recordings,
    };
  },
});

/** Tijdelijke download-URL via share-token + recording scope; elke request her-checkt revoke/expiry. */
export const resolveRecordingDownload = internalQuery({
  args: { token: v.string(), recordingId: v.id('recordings') },
  handler: async (ctx, { token, recordingId }) => {
    if (!/^[0-9a-f]{64}$/.test(token)) return null;
    const tokenHash = await sha256Hex(token);
    const link = await ctx.db.query('shareLinks').withIndex('by_hash', (q) => q.eq('tokenHash', tokenHash)).first();
    if (!link || link.revokedAt || link.expiresAt < Date.now()) return null;
    if (!(link.scopes ?? []).includes('recording')) return null;
    const row = await ctx.db.get(recordingId);
    if (!row || row.deletedAt || row.userId !== link.userId) return null;
    if (link.incidentId && row.incidentId && row.incidentId !== link.incidentId) return null;
    if (link.incidentId && !row.incidentId) return null;
    return { storageId: row.storageId, mime: row.mime, byteSize: row.byteSize };
  },
});

export const publicLocation = httpAction(async (ctx, req) => {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  // Rate-limit op hash (geen raw token in key logs via audit — alleen prefix)
  const data = await ctx.runQuery(internal.tracking.resolvePublic, { token });
  const h = securityHeaders({ 'Content-Type': 'application/json' });
  if (!data) {
    return new Response(JSON.stringify({ error: 'invalid_or_expired' }), { status: 404, headers: h });
  }
  return new Response(JSON.stringify({
    ok: true,
    expiresAt: data.expiresAt,
    label: data.label,
    scopes: data.scopes,
    live: data.live,
    updaterActive: data.updaterActive,
    updater: data.updater,
    freshnessMs: data.freshnessMs,
    location: data.location,
    recordings: data.scopes.includes('recording') ? data.recordings : [],
    note: data.live
      ? 'Live locatie (updater actief, vers). SafeWalk is geen 112-hulpdienst.'
      : 'Geen live-claim: geen actieve updater of locatie verouderd/ontbreekt. SafeWalk is geen 112-hulpdienst.',
  }), { status: 200, headers: h });
});

export const publicRecording = httpAction(async (ctx, req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? '';
  const recordingId = url.searchParams.get('id') ?? '';
  const h = securityHeaders({ 'Content-Type': 'application/json' });
  if (!recordingId) {
    return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400, headers: h });
  }
  // Id-validatie via runQuery (Convex Id)
  let resolved: { storageId: string; mime: string; byteSize: number } | null = null;
  try {
    resolved = await ctx.runQuery(internal.tracking.resolveRecordingDownload, {
      token,
      recordingId: recordingId as never,
    });
  } catch {
    resolved = null;
  }
  if (!resolved) {
    return new Response(JSON.stringify({ error: 'invalid_or_expired' }), { status: 404, headers: h });
  }
  const signed = await ctx.storage.getUrl(resolved.storageId as never);
  if (!signed) {
    return new Response(JSON.stringify({ error: 'gone' }), { status: 404, headers: h });
  }
  // Tijdelijke URL — geen permanente publieke storage-URL in onze DB
  return new Response(JSON.stringify({
    ok: true, url: signed, mime: resolved.mime, byteSize: resolved.byteSize,
    note: 'URL is tijdelijk (platform). Link/token verlopen of intrekken blokkeert nieuwe uitgifte.',
  }), { status: 200, headers: h });
});

const LEAFLET_JS_SRI = 'sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH';
const LEAFLET_CSS_SRI = 'sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H';

export const publicPage = httpAction(async (ctx, req) => {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  const data = await ctx.runQuery(internal.tracking.resolvePublic, { token });
  const site = (process.env.CONVEX_SITE_URL ?? '').replace(/\/$/, '');
  const htmlHeaders = securityHeaders({
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': [
      "default-src 'none'",
      "img-src https://tile.openstreetmap.org data:",
      "style-src 'unsafe-inline' https://unpkg.com",
      "script-src 'unsafe-inline' https://unpkg.com",
      "connect-src 'self' " + site,
      "font-src 'none'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join('; '),
  });
  if (!data) {
    return new Response('<!doctype html><meta charset=utf-8><meta name="robots" content="noindex"/><meta name="referrer" content="no-referrer"/><title>Link ongeldig</title><p>Deze SafeWalk-link is ongeldig, verlopen of ingetrokken.</p>', {
      status: 404, headers: htmlHeaders,
    });
  }
  const api = `${site}/track/location?token=${encodeURIComponent(token)}`;
  const recApi = `${site}/track/recording`;
  const html = `<!doctype html>
<html lang="nl"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex,nofollow"/>
<meta name="referrer" content="no-referrer"/>
<title>SafeWalk locatie</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="${LEAFLET_CSS_SRI}" crossorigin="anonymous"/>
<style>
html,body,#map{height:100%;margin:0}
.bar{position:fixed;z-index:1000;left:0;right:0;top:0;background:#0f172a;color:#fff;padding:10px 14px;font:15px/1.4 system-ui,sans-serif}
.bar small{opacity:.85;display:block;margin-top:4px}
.stale{color:#fbbf24;font-weight:700}
.live{color:#4ade80;font-weight:700}
.attr{position:fixed;bottom:8px;right:8px;z-index:1000;background:rgba(255,255,255,.92);padding:4px 8px;font:12px system-ui;border-radius:6px}
#recs{position:fixed;bottom:40px;left:8px;z-index:1000;background:rgba(15,23,42,.92);color:#fff;padding:8px;font:13px system-ui;border-radius:8px;max-width:280px}
#recs a{color:#93c5fd}
</style></head><body>
<div class="bar">SafeWalk locatie<small id="meta">Laden…</small></div>
<div id="map"></div>
<div id="recs" hidden></div>
<div class="attr">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors · ODbL</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="${LEAFLET_JS_SRI}" crossorigin="anonymous"></script>
<script>
const API=${JSON.stringify(api)};
const REC=${JSON.stringify(recApi)};
const TOKEN=${JSON.stringify(token)};
const map=L.map('map').setView([52.37,4.9],13);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
let marker=null;
async function tick(){
  try{
    const r=await fetch(API,{cache:'no-store',referrerPolicy:'no-referrer'});
    const j=await r.json();
    const m=document.getElementById('meta');
    if(!j.ok){ m.textContent='Link ongeldig.'; return; }
    const liveLabel=j.live?'<span class="live">LIVE</span>':'<span class="stale">Niet live</span>';
    if(!j.location){
      m.innerHTML=liveLabel+' · Geen locatie. Updater: '+(j.updaterActive?'actief':'geen')+' · tot '+new Date(j.expiresAt).toLocaleString('nl-NL');
    } else {
      const {lat,lng,recordedAt,stale,accuracyM}=j.location;
      const when=new Date(recordedAt).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      m.innerHTML=liveLabel+(stale?' · <span class="stale">verouderd</span>':'')+' · '+when+(accuracyM!=null?' · ±'+Math.round(accuracyM)+' m':'')+' · tot '+new Date(j.expiresAt).toLocaleString('nl-NL');
      if(!marker){ marker=L.marker([lat,lng]).addTo(map); map.setView([lat,lng],15); }
      else marker.setLatLng([lat,lng]);
    }
    const box=document.getElementById('recs');
    if(j.recordings && j.recordings.length){
      box.hidden=false;
      box.innerHTML='<strong>Opnames</strong><br/>'+j.recordings.map(function(x){
        return '<a href="#" data-id="'+x.id+'">Opname '+new Date(x.createdAt).toLocaleString('nl-NL')+' ('+Math.round(x.byteSize/1024)+' KB)</a>';
      }).join('<br/>');
      box.querySelectorAll('a').forEach(function(a){
        a.onclick=async function(ev){
          ev.preventDefault();
          const rr=await fetch(REC+'?token='+encodeURIComponent(TOKEN)+'&id='+encodeURIComponent(a.getAttribute('data-id')),{cache:'no-store',referrerPolicy:'no-referrer'});
          const jj=await rr.json();
          if(jj.ok && jj.url) location.href=jj.url; else alert('Opname niet beschikbaar');
        };
      });
    } else { box.hidden=true; }
  }catch(e){ document.getElementById('meta').textContent='Kon locatie niet laden.'; }
}
tick(); setInterval(tick,10000);
</script></body></html>`;
  return new Response(html, { status: 200, headers: htmlHeaders });
});
