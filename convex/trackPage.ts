// Publieke meekijkpagina (/track/live) voor contacten zonder app. Pure functies: geen database, makkelijk te testen.

export type TripStateKind = 'underway' | 'grace' | 'missed' | 'arrived' | 'ended';
export type PublicTrip = {
  destination: string;
  expectedArrival: number;
  state: TripStateKind;
  /** Einde van de respijttijd (alleen bij 'grace'). */
  graceEndsAt: number | null;
  endedAt: number | null;
  batteryPct: number | null;
  lastSeenAt: number | null;
};

export const DEFAULT_DOWNLOAD_URL = 'https://play.google.com/store/apps/details?id=nl.safewalk.app';
/** Store-link voor de uitnodiging op de pagina. Overschrijfbaar met env SAFEWALK_DOWNLOAD_URL (alleen https). */
export function downloadUrl(env: string | undefined = process.env.SAFEWALK_DOWNLOAD_URL): string {
  const v = (env ?? '').trim();
  return /^https:\/\/[^\s"'<>]+$/.test(v) ? v : DEFAULT_DOWNLOAD_URL;
}

/**
 * Status van een reis voor de meekijkpagina.
 * open + status alert → gemist; open + check-in verlopen → respijt; open → onderweg;
 * gesloten + check-in bevestigd → aangekomen; anders gestopt/verlopen.
 */
export function tripState(
  s: { status: string; endedAt?: number; expectedArrival: number; expiresAt: number },
  checkIn: { status: string; dueAt: number; graceMinutes: number } | null,
  now: number,
): { state: TripStateKind; graceEndsAt: number | null } {
  const open = s.endedAt === undefined && (s.status === 'active' || s.status === 'alert') && s.expiresAt > now;
  if (!open) return { state: checkIn?.status === 'confirmed' ? 'arrived' : 'ended', graceEndsAt: null };
  if (s.status === 'alert' || checkIn?.status === 'missed') return { state: 'missed', graceEndsAt: null };
  if (checkIn && checkIn.status === 'pending' && checkIn.dueAt <= now) return { state: 'grace', graceEndsAt: checkIn.dueAt + checkIn.graceMinutes * 60_000 };
  return { state: 'underway', graceEndsAt: null };
}

export function liveTrackHtml(o: { api: string; player: string; token: string; downloadUrl: string; leafletJsSri: string; leafletCssSri: string }) {
  const j = (x: unknown) => JSON.stringify(x).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="nl"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex,nofollow"/>
<meta name="referrer" content="no-referrer"/>
<title>SafeWalk – meekijken</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="${o.leafletCssSri}" crossorigin="anonymous"/>
<style>
html,body,#map{height:100%;margin:0}
body{font:15px/1.4 system-ui,sans-serif}
.bar{position:fixed;z-index:1000;left:0;right:0;top:0;background:#0f172a;color:#fff;padding:10px 14px}
.bar small{opacity:.85;display:block;margin-top:4px}
.stale{color:#fbbf24;font-weight:700}
.live{color:#4ade80;font-weight:700}
#trip{position:fixed;z-index:1000;left:8px;right:8px;top:84px;background:#fff;color:#0f172a;border-radius:14px;padding:12px 14px;box-shadow:0 6px 24px rgba(0,0,0,.25)}
#trip h2{margin:0 0 4px;font-size:17px}
.badge{display:inline-block;border-radius:999px;padding:2px 10px;font-weight:700;font-size:13px;margin-bottom:6px}
.b-underway{background:#dbeafe;color:#1e3a8a}.b-grace{background:#fef3c7;color:#92400e}.b-missed{background:#fee2e2;color:#991b1b}.b-arrived{background:#dcfce7;color:#166534}.b-ended{background:#e2e8f0;color:#334155}
.big{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums}
.muted{color:#475569;font-size:13px}
.warn{background:#fee2e2;color:#7f1d1d;border-radius:10px;padding:8px 10px;margin-top:8px;font-weight:600}
#invite{position:fixed;z-index:1000;left:8px;right:8px;bottom:36px;background:#7856ff;color:#fff;border-radius:14px;padding:12px 14px;box-shadow:0 6px 24px rgba(0,0,0,.25)}
#invite strong{display:block;font-size:16px}
#invite a{display:inline-block;margin-top:8px;background:#fff;color:#4c1d95;font-weight:800;text-decoration:none;border-radius:10px;padding:8px 14px}
.attr{position:fixed;bottom:8px;right:8px;z-index:1000;background:rgba(255,255,255,.92);padding:4px 8px;font:12px system-ui;border-radius:6px}
#recs{position:fixed;bottom:150px;left:8px;z-index:1000;background:rgba(15,23,42,.92);color:#fff;padding:8px;font:13px system-ui;border-radius:8px;max-width:280px}
#recs a{color:#93c5fd}
</style></head><body>
<div class="bar">SafeWalk – meekijken<small id="meta">Laden…</small></div>
<div id="trip" hidden></div>
<div id="map"></div>
<div id="recs" hidden></div>
<div id="invite"><strong>Ook veilig thuiskomen?</strong>Laat vrienden meekijken tot je er bent, met check-in en alarm.<br/><a id="dl" href="#" target="_blank" rel="noopener noreferrer">Download SafeWalk</a></div>
<div class="attr">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors · ODbL</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="${o.leafletJsSri}" crossorigin="anonymous"></script>
<script>
const API=${j(o.api)};
const PLAY=${j(o.player)};
const TOKEN=${j(o.token)};
document.getElementById('dl').href=${j(o.downloadUrl)};
// Geen zoomknoppen (overlappen de balk; knijpen werkt) en eigen OSM-vermelding rechtsonder.
const map=L.map('map',{zoomControl:false,attributionControl:false}).setView([52.37,4.9],13);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
let marker=null; let trip=null; let skew=0;
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function hm(t){return new Date(t).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'});}
function cd(ms){ms=Math.max(0,ms);const s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return (h?h+':'+String(m).padStart(2,'0'):m)+':'+String(x).padStart(2,'0');}
const LABEL={underway:'Onderweg',grace:'Aankomsttijd verstreken',missed:'Check-in gemist',arrived:'Veilig aangekomen',ended:'Reis gestopt'};
function renderTrip(){
  const el=document.getElementById('trip');
  if(!trip){el.hidden=true;return;}
  el.hidden=false;
  const now=Date.now()+skew;
  let h='<span class="badge b-'+trip.state+'">'+LABEL[trip.state]+'</span><h2>Reis naar '+esc(trip.destination)+'</h2>';
  if(trip.state==='underway') h+='<div class="big">'+cd(trip.expectedArrival-now)+'</div><div class="muted">tot verwachte aankomst ('+hm(trip.expectedArrival)+')</div>';
  if(trip.state==='grace') h+='<div class="big">'+cd((trip.graceEndsAt||now)-now)+'</div><div class="muted">om te bevestigen dat alles goed is. Daarna worden de vertrouwde contacten gewaarschuwd.</div>';
  if(trip.state==='missed') h+='<div class="warn">Er is niet op tijd bevestigd dat alles goed is. Probeer contact op te nemen. Bij direct gevaar: bel 112.</div>';
  if(trip.state==='arrived') h+='<div class="muted">Bevestigd'+(trip.endedAt?' om '+hm(trip.endedAt):'')+'. De locatie wordt niet meer gedeeld.</div>';
  if(trip.state==='ended') h+='<div class="muted">De reis is gestopt of verlopen. De locatie wordt niet meer gedeeld.</div>';
  const dev=[];
  if(typeof trip.batteryPct==='number') dev.push('Batterij '+trip.batteryPct+'%');
  if(typeof trip.lastSeenAt==='number') dev.push('laatst online '+hm(trip.lastSeenAt));
  if(dev.length && trip.state!=='arrived' && trip.state!=='ended') h+='<div class="muted">📱 '+esc(dev.join(' · '))+'</div>';
  el.innerHTML=h;
}
async function tick(){
  try{
    const r=await fetch(API,{cache:'no-store',referrerPolicy:'no-referrer'});
    const j=await r.json();
    const m=document.getElementById('meta');
    if(!j.ok){ m.textContent='Deze link is ongeldig, verlopen of ingetrokken.'; trip=null; renderTrip(); return; }
    if(typeof j.serverNow==='number') skew=j.serverNow-Date.now();
    trip=j.trip||null; renderTrip();
    const liveLabel=j.live?'<span class="live">LIVE</span>':'<span class="stale">Niet live</span>';
    if(!j.location){
      m.innerHTML=liveLabel+' · Geen locatie'+(trip&&(trip.state==='arrived'||trip.state==='ended')?' (reis niet meer actief)':'')+' · link tot '+new Date(j.expiresAt).toLocaleString('nl-NL');
      if(marker){ map.removeLayer(marker); marker=null; }
    } else {
      const {lat,lng,recordedAt,stale,accuracyM}=j.location;
      const when=new Date(recordedAt).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      m.innerHTML=liveLabel+(stale?' · <span class="stale">verouderd</span>':'')+' · '+when+(accuracyM!=null?' · ±'+Math.round(accuracyM)+' m':'')+' · link tot '+new Date(j.expiresAt).toLocaleString('nl-NL');
      if(!marker){ marker=L.marker([lat,lng]).addTo(map); map.setView([lat,lng],15); }
      else marker.setLatLng([lat,lng]);
    }
    const box=document.getElementById('recs');
    if(j.recordings && j.recordings.length){
      box.hidden=false;
      box.innerHTML='<strong>Opnames</strong> (E2E: fragment-sleutel nodig op aparte player; geen 3rd-party scripts)<br/>'+j.recordings.map(function(x){
        return '<a href="'+PLAY+'?token='+encodeURIComponent(TOKEN)+'&id='+encodeURIComponent(x.id)+'" rel="noreferrer">Opname '+new Date(x.createdAt).toLocaleString('nl-NL')+' ('+Math.round(x.byteSize/1024)+' KB)</a>';
      }).join('<br/>');
    } else { box.hidden=true; }
  }catch(e){ document.getElementById('meta').textContent='Kon de gegevens niet laden.'; }
}
tick(); setInterval(tick,10000); setInterval(renderTrip,1000);
</script></body></html>`;
}
