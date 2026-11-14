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
  /** 'timer' = sessie zonder bestemming. */
  kind: 'trip' | 'timer';
  /** Privacy-check-in: alleen status tot een gemiste check-in of SOS. */
  privacyMode: boolean;
  /** Privacymodus, maar details zijn vrijgegeven door gemiste check-in of SOS. */
  revealed: boolean;
  destinationPoint: { lat: number; lng: number } | null;
  /** Telefoon gaf de laatste 2 minuten iets door (zonder plek of tijdstip). */
  deviceLive: boolean;
  signals: { sosAt: number | null; lowBattery: boolean; notLiveSince: number | null };
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

export function liveTrackHtml(o: { api: string; player: string; token: string; downloadUrl: string; leafletJsSri: string; leafletCssSri: string; unlock?: string; subscribe?: string }) {
  const j = (x: unknown) => JSON.stringify(x).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="nl"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<meta name="robots" content="noindex,nofollow"/>
<meta name="referrer" content="no-referrer"/>
<meta name="theme-color" content="#0f172a"/>
<title>SafeWalk – meekijken</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="${o.leafletCssSri}" crossorigin="anonymous"/>
<style>
*{box-sizing:border-box}
[hidden]{display:none!important}
html,body{height:100%;margin:0}
body{font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;background:#0f172a}
#map{position:fixed;inset:0;z-index:1}
.bar{position:fixed;z-index:1000;left:0;right:0;top:0;background:#0f172a;color:#fff;padding:10px 14px calc(10px) 14px}
.bar b{font-size:16px}
.bar small{opacity:.9;display:block;margin-top:2px}
.stale{color:#fbbf24;font-weight:700}
.live{color:#4ade80;font-weight:700}
#sheet{position:fixed;z-index:1000;left:0;right:0;bottom:0;max-height:58vh;overflow:auto;background:#fff;border-radius:18px 18px 0 0;box-shadow:0 -8px 30px rgba(0,0,0,.3);padding:8px 14px calc(14px + env(safe-area-inset-bottom))}
#sheet .grip{width:42px;height:5px;border-radius:9px;background:#cbd5e1;margin:2px auto 8px}
h2{margin:0 0 4px;font-size:18px}
h3{margin:14px 0 6px;font-size:15px}
.badge{display:inline-block;border-radius:999px;padding:2px 10px;font-weight:700;font-size:13px;margin-bottom:6px}
.b-underway{background:#dbeafe;color:#1e3a8a}.b-grace{background:#fef3c7;color:#92400e}.b-missed,.b-sos{background:#fee2e2;color:#991b1b}.b-arrived{background:#dcfce7;color:#166534}.b-ended{background:#e2e8f0;color:#334155}
.big{font-size:24px;font-weight:800;font-variant-numeric:tabular-nums}
.muted{color:#475569;font-size:13px}
.warn{background:#fee2e2;color:#7f1d1d;border-radius:10px;padding:9px 11px;margin-top:8px;font-weight:600}
.info{background:#eef2ff;color:#312e81;border-radius:10px;padding:9px 11px;margin-top:8px}
.amber{background:#fef3c7;color:#78350f;border-radius:10px;padding:9px 11px;margin-top:8px;font-weight:600}
.row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.btn{display:inline-block;border:0;border-radius:10px;padding:10px 14px;font:inherit;font-weight:700;text-decoration:none;cursor:pointer;text-align:center}
.btn-p{background:#7856ff;color:#fff}.btn-s{background:#e2e8f0;color:#0f172a}.btn-d{background:#dc2626;color:#fff}
.btn[disabled]{opacity:.6}
input[type=email],input[type=text]{font:inherit;width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;margin-top:6px}
label.chk{display:flex;gap:8px;align-items:flex-start;margin-top:8px;font-size:13px;color:#334155}
#invite{background:#7856ff;color:#fff;border-radius:14px;padding:12px 14px;margin-top:14px}
#invite strong{display:block;font-size:16px}
#invite a{display:inline-block;margin-top:8px;background:#fff;color:#4c1d95;font-weight:800;text-decoration:none;border-radius:10px;padding:8px 14px}
.attr{position:fixed;top:64px;right:8px;z-index:900;background:rgba(255,255,255,.92);padding:3px 7px;font:11px system-ui;border-radius:6px}
#recs{margin-top:10px;background:#0f172a;color:#fff;padding:8px;font:13px system-ui;border-radius:8px}
#recs a{color:#93c5fd}
#gate{position:fixed;inset:0;z-index:2000;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;padding:20px}
#gate .card{background:#fff;color:#0f172a;border-radius:16px;padding:18px;max-width:380px;width:100%}
#gate input{font-size:24px;letter-spacing:6px;text-align:center}
</style></head><body>
<div class="bar" id="bar"><b>SafeWalk – meekijken</b><small id="meta">Laden…</small></div>
<div id="map"></div>
<div class="attr" id="attr">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a></div>
<div id="gate" hidden><div class="card">
  <h2>Toegangscode nodig</h2>
  <p class="muted">Deze meekijklink is extra beveiligd. Vraag de code aan de persoon die de link stuurde (bij voorkeur apart, bijvoorbeeld telefonisch).</p>
  <input id="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" aria-label="Toegangscode van 6 cijfers"/>
  <div class="row"><button id="codeBtn" class="btn btn-p" type="button">Openen</button></div>
  <p id="codeMsg" class="muted" role="status"></p>
</div></div>
<div id="sheet"><div class="grip"></div>
  <div id="trip"></div>
  <div id="nav" class="row" hidden></div>
  <div id="recs" hidden></div>
  <div id="alerts" hidden>
    <h3>Meldingen bij SOS, gemiste check-in of aankomst</h3>
    <div class="row"><button id="notifBtn" class="btn btn-s" type="button">Meldingen in deze browser aanzetten</button></div>
    <p id="notifMsg" class="muted">Werkt alleen zolang deze pagina open is; een telefoon kan een tabblad op de achtergrond pauzeren. Op iPhone alleen als je de pagina aan je beginscherm toevoegt. Voor meldingen als de pagina dicht is: gebruik e-mail hieronder.</p>
    <input id="email" type="email" autocomplete="email" placeholder="jouw@e-mailadres.nl" aria-label="E-mailadres voor meldingen"/>
    <label class="chk"><input id="consent" type="checkbox"/> <span>Stuur mij een e-mail bij SOS, een gemiste check-in, aankomst, een bijna lege batterij of als de locatie niet meer live is, alleen voor deze link. Je krijgt eerst een bevestigingsmail. Afmelden kan in elke e-mail; na afloop van de link wissen we je adres.</span></label>
    <div class="row"><button id="subBtn" class="btn btn-p" type="button">E-mailmeldingen aanvragen</button></div>
    <p id="subMsg" class="muted" role="status"></p>
  </div>
  <p class="muted" style="margin-top:12px">🔑 Deze link werkt als een sleutel: stuur hem niet door. SafeWalk is geen hulpdienst en belt zelf geen 112.</p>
  <div id="invite"><strong>Ook veilig thuiskomen?</strong>Laat vrienden meekijken tot je er bent, met check-in en alarm.<br/><a id="dl" href="#" target="_blank" rel="noopener noreferrer">Download SafeWalk</a></div>
</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="${o.leafletJsSri}" crossorigin="anonymous"></script>
<script>
const API=${j(o.api)};
const PLAY=${j(o.player)};
const TOKEN=${j(o.token)};
const UNLOCK=${j(o.unlock ?? '')};
const SUBSCRIBE=${j(o.subscribe ?? '')};
document.getElementById('dl').href=${j(o.downloadUrl)};
const $=function(id){return document.getElementById(id);};
const GK='sw-grant-'+TOKEN.slice(0,12);
let grant=null; try{grant=sessionStorage.getItem(GK);}catch(e){}
// Geen zoomknoppen (overlappen de balk; knijpen werkt) en eigen OSM-vermelding.
const map=L.map('map',{zoomControl:false,attributionControl:false}).setView([52.37,4.9],13);
map.on('dragstart',function(){follow=false; if(last&&last.location) renderNav(last.location);});
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
let me=null, acc=null, line=null, destM=null, follow=true, trip=null, skew=0, last=null, seen=null;
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function hm(t){return new Date(t).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'});}
function cd(ms){ms=Math.max(0,ms);const s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return (h?h+':'+String(m).padStart(2,'0'):m)+':'+String(x).padStart(2,'0');}
const LABEL={underway:'Onderweg',grace:'Aankomsttijd verstreken',missed:'Check-in gemist',arrived:'Veilig aangekomen',ended:'Reis gestopt'};
function title(t){return t.kind==='timer'?'Timer: '+esc(t.destination):'Reis naar '+esc(t.destination);}
function renderTrip(){
  const el=$('trip');
  if(!trip){el.innerHTML='';return;}
  const now=Date.now()+skew; const sig=trip.signals||{};
  const open=trip.state!=='arrived'&&trip.state!=='ended';
  let h='';
  if(open&&sig.sosAt) h+='<span class="badge b-sos">SOS</span> ';
  h+='<span class="badge b-'+trip.state+'">'+LABEL[trip.state]+'</span><h2>'+title(trip)+'</h2>';
  if(open&&sig.sosAt) h+='<div class="warn">🆘 SOS geactiveerd om '+hm(sig.sosAt)+'. Probeer direct contact op te nemen. Bij direct gevaar: bel 112.</div>';
  if(trip.state==='underway') h+='<div class="big">'+cd(trip.expectedArrival-now)+'</div><div class="muted">tot '+(trip.kind==='timer'?'de timer afloopt':'verwachte aankomst')+' ('+hm(trip.expectedArrival)+')</div>';
  if(trip.state==='grace') h+='<div class="big">'+cd((trip.graceEndsAt||now)-now)+'</div><div class="muted">om te bevestigen dat alles goed is. Daarna volgt een waarschuwing.</div>';
  if(trip.state==='missed') h+='<div class="warn">Er is niet op tijd bevestigd dat alles goed is. Probeer contact op te nemen. Bij direct gevaar: bel 112.</div>';
  if(trip.state==='arrived') h+='<div class="muted">Bevestigd'+(trip.endedAt?' om '+hm(trip.endedAt):'')+'. De locatie wordt niet meer gedeeld.</div>';
  if(trip.state==='ended') h+='<div class="muted">Gestopt of verlopen, zonder bevestiging van aankomst. De locatie wordt niet meer gedeeld.</div>';
  if(open&&trip.privacyMode&&!trip.revealed) h+='<div class="info">🔒 Privacymodus: je ziet alleen de status. Locatie, batterij en route worden pas zichtbaar bij een gemiste check-in of SOS.</div>';
  if(open&&trip.privacyMode&&trip.revealed) h+='<div class="amber">De privacymodus is opgeheven door een gemiste check-in of SOS: je ziet nu locatie en batterij.</div>';
  if(open&&sig.lowBattery) h+='<div class="amber">🔋 Batterij bijna leeg'+(typeof trip.batteryPct==='number'?' ('+trip.batteryPct+'%)':'')+'. Valt de telefoon uit, dan stopt de live locatie.</div>';
  if(open&&sig.notLiveSince) h+='<div class="amber">📡 Niet meer live sinds '+hm(sig.notLiveSince)+'. Geen bereik, lege batterij of telefoon uit? Neem bij twijfel contact op.</div>';
  const dev=[];
  if(typeof trip.batteryPct==='number') dev.push('Batterij '+trip.batteryPct+'%');
  if(typeof trip.lastSeenAt==='number') dev.push('laatst online '+hm(trip.lastSeenAt));
  if(open&&trip.privacyMode&&!trip.revealed) dev.push(trip.deviceLive?'telefoon geeft status door':'telefoon geeft niets meer door');
  if(dev.length&&open) h+='<div class="muted" style="margin-top:6px">📱 '+esc(dev.join(' · '))+'</div>';
  if(open&&(trip.state==='missed'||sig.sosAt)) h+='<div class="row"><a class="btn btn-d" href="tel:112">Bel 112</a></div>';
  el.innerHTML=h;
}
function headers(){const h={};if(grant)h['x-safewalk-grant']=grant;return h;}
function notify(t,b){
  try{ if('Notification' in window && Notification.permission==='granted'){ new Notification(t,{body:b,tag:'safewalk-'+t,requireInteraction:true}); } }catch(e){}
  try{ if(navigator.vibrate) navigator.vibrate([300,150,300]); }catch(e){}
  document.title='⚠ '+t+' – SafeWalk';
}
function events(j){
  const t=j.trip; if(!t) return {};
  const s=t.signals||{};
  return {missed:t.state==='missed',arrived:t.state==='arrived',ended:t.state==='ended',sos:s.sosAt||0,battery:!!s.lowBattery,notlive:s.notLiveSince||0};
}
function diff(j){
  const e=events(j);
  if(seen===null){seen=e;return;}
  if(e.sos&&e.sos!==seen.sos) notify('SOS','Er is SOS geactiveerd. Bel bij direct gevaar 112.');
  if(e.missed&&!seen.missed) notify('Check-in gemist','Er is niet op tijd bevestigd dat alles goed is.');
  if(e.arrived&&!seen.arrived) notify('Veilig aangekomen','Aankomst is bevestigd.');
  if(e.ended&&!seen.ended&&!e.arrived) notify('Delen gestopt','Het delen is gestopt zonder bevestiging van aankomst.');
  if(e.battery&&!seen.battery) notify('Batterij bijna leeg','De telefoon heeft weinig batterij.');
  if(e.notlive&&e.notlive!==seen.notlive) notify('Niet meer live','Er komt geen nieuwe locatie meer binnen.');
  seen=e;
}
function renderNav(loc){
  const el=$('nav');
  if(!loc){el.hidden=true;el.innerHTML='';return;}
  const ll=loc.lat.toFixed(6)+','+loc.lng.toFixed(6);
  el.hidden=false;
  el.innerHTML='<a class="btn btn-p" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/dir/?api=1&destination='+ll+'&travelmode=walking">Navigeer naar mij (Google Maps)</a>'
    +'<a class="btn btn-s" target="_blank" rel="noopener noreferrer" href="https://maps.apple.com/?daddr='+ll+'&dirflg=w">Apple Kaarten</a>'
    +(follow?'':'<button type="button" class="btn btn-s" id="recenter">Kaart weer laten volgen</button>');
  const rc=$('recenter'); if(rc) rc.onclick=function(){follow=true; if(last) renderMap(last); renderNav(loc);};
}
function renderMap(j){
  const loc=j.location;
  const pts=(j.trail||[]).map(function(p){return [p[0],p[1]];});
  if(pts.length>1){ if(!line) line=L.polyline(pts,{color:'#7856ff',weight:5,opacity:.75}).addTo(map); else line.setLatLngs(pts); }
  else if(line){ map.removeLayer(line); line=null; }
  const d=j.trip&&j.trip.destinationPoint;
  if(d){ if(!destM) destM=L.circleMarker([d.lat,d.lng],{radius:9,color:'#166534',weight:3,fillColor:'#22c55e',fillOpacity:.9}).addTo(map).bindTooltip('Bestemming'); }
  else if(destM){ map.removeLayer(destM); destM=null; }
  if(!loc){ if(me){map.removeLayer(me);me=null;} if(acc){map.removeLayer(acc);acc=null;} if(d&&follow) map.setView([d.lat,d.lng],15,{animate:false}); return; }
  const p=[loc.lat,loc.lng];
  const col=loc.stale?'#f59e0b':'#2563eb';
  if(!me){ me=L.circleMarker(p,{radius:10,color:'#fff',weight:3,fillColor:col,fillOpacity:1}).addTo(map); }
  else { me.setLatLng(p); me.setStyle({fillColor:col}); }
  if(loc.accuracyM!=null&&loc.accuracyM<500){ if(!acc) acc=L.circle(p,{radius:loc.accuracyM,color:col,weight:1,fillOpacity:.12}).addTo(map); else { acc.setLatLng(p); acc.setRadius(loc.accuracyM); } }
  // Volgt de persoon tot de kijker zelf de kaart versleept; houdt rekening met de balk boven en het paneel onder.
  if(follow){
    const pts2=[p].concat(d?[[d.lat,d.lng]]:[]).concat(pts.slice(-20));
    // Na de opmaak meten: het paneel kan net groter zijn geworden (meldingen, knoppen).
    requestAnimationFrame(function(){
      const top=$('bar').getBoundingClientRect().bottom+16;
      const bottom=Math.max(0, window.innerHeight-$('sheet').getBoundingClientRect().top)+16;
      map.invalidateSize();
      map.fitBounds(L.latLngBounds(pts2),{paddingTopLeft:[24,top],paddingBottomRight:[24,bottom],maxZoom:16,animate:false});
    });
  }
}
async function tick(){
  try{
    const r=await fetch(API,{cache:'no-store',referrerPolicy:'no-referrer',headers:headers()});
    const j=await r.json();
    const m=$('meta');
    if(!j.ok){ m.textContent='Deze link is ongeldig, verlopen of ingetrokken.'; trip=null; renderTrip(); renderNav(null); renderMap({}); $('alerts').hidden=true; return; }
    if(typeof j.serverNow==='number') skew=j.serverNow-Date.now();
    if(j.locked){
      $('gate').hidden=false;
      if(j.codeLocked){ $('codeMsg').textContent='Deze link is geblokkeerd na te veel foute codes. Vraag om een nieuwe link.'; $('codeBtn').disabled=true; }
      if(grant){ grant=null; try{sessionStorage.removeItem(GK);}catch(e){} }
      m.textContent='Code nodig'; return;
    }
    $('gate').hidden=true;
    last=j; trip=j.trip||null; renderTrip(); diff(j);
    const hidden=trip&&trip.privacyMode&&!trip.revealed;
    const liveLabel=j.live?'<span class="live">LIVE</span>':(hidden&&trip.deviceLive?'<span class="live">Telefoon actief</span>':'<span class="stale">Niet live</span>');
    // Geen locatie en geen bestemming: geen kaart tonen (een standaardkaart zou een plek suggereren).
    const over=trip&&(trip.state==='arrived'||trip.state==='ended');
    const showMap=!!(j.location||(trip&&trip.destinationPoint&&!over));
    $('map').style.visibility=showMap?'visible':'hidden'; $('attr').style.visibility=showMap?'visible':'hidden';
    const until=' · link tot '+new Date(j.expiresAt).toLocaleString('nl-NL',{weekday:'short',hour:'2-digit',minute:'2-digit'});
    if(!j.location){
      const why=trip&&(trip.state==='arrived'||trip.state==='ended')?' (reis niet meer actief)':(trip&&trip.privacyMode&&!trip.revealed?' (privacymodus)':'');
      m.innerHTML=liveLabel+' · Geen locatie'+why+until;
    } else {
      const l=j.location;
      const when=new Date(l.recordedAt).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      m.innerHTML=liveLabel+(l.stale?' · <span class="stale">verouderd</span>':'')+' · '+when+(l.accuracyM!=null?' · ±'+Math.round(l.accuracyM)+' m':'')+until;
    }
    renderMap(j); renderNav(j.location);
    $('alerts').hidden=!(j.canSubscribe&&SUBSCRIBE);
    const box=$('recs');
    if(j.recordings && j.recordings.length){
      box.hidden=false;
      box.innerHTML='<strong>Opnames</strong> (E2E: fragment-sleutel nodig op aparte player; geen 3rd-party scripts)<br/>'+j.recordings.map(function(x){
        return '<a href="'+PLAY+'?token='+encodeURIComponent(TOKEN)+'&id='+encodeURIComponent(x.id)+'" rel="noreferrer">Opname '+new Date(x.createdAt).toLocaleString('nl-NL')+' ('+Math.round(x.byteSize/1024)+' KB)</a>';
      }).join('<br/>');
    } else { box.hidden=true; }
  }catch(e){ $('meta').textContent='Kon de gegevens niet laden. Opnieuw proberen…'; }
}
$('codeBtn').onclick=async function(){
  const code=$('code').value.replace(/\\D/g,'');
  if(code.length!==6){ $('codeMsg').textContent='Vul de 6 cijfers in.'; return; }
  $('codeBtn').disabled=true; $('codeMsg').textContent='Controleren…';
  try{
    const r=await fetch(UNLOCK,{method:'POST',cache:'no-store',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:TOKEN,code:code})});
    const j=await r.json();
    if(j.ok){ grant=j.grant; try{sessionStorage.setItem(GK,grant);}catch(e){} $('codeMsg').textContent=''; await tick(); }
    else $('codeMsg').textContent={wrong:'Onjuiste code.',rate_limited:'Te veel pogingen. Wacht een kwartier.',locked:'Deze link is geblokkeerd na te veel foute codes. Vraag om een nieuwe link.',invalid:'Deze link is ongeldig, verlopen of ingetrokken.'}[j.reason]||'Openen lukte niet.';
  }catch(e){ $('codeMsg').textContent='Geen verbinding. Probeer opnieuw.'; }
  finally{ if(!$('codeMsg').textContent.includes('geblokkeerd')) $('codeBtn').disabled=false; }
};
$('notifBtn').onclick=async function(){
  if(!('Notification' in window)){ $('notifMsg').textContent='Deze browser ondersteunt geen meldingen. Gebruik e-mail hieronder.'; return; }
  try{ const p=await Notification.requestPermission(); $('notifMsg').textContent=p==='granted'?'Aan. Laat deze pagina open staan; je krijgt een melding bij SOS, gemiste check-in, aankomst, lage batterij of als het niet meer live is.':'Meldingen zijn geweigerd in deze browser. Gebruik e-mail hieronder.'; }
  catch(e){ $('notifMsg').textContent='Meldingen aanzetten lukte niet. Gebruik e-mail hieronder.'; }
};
$('subBtn').onclick=async function(){
  const email=$('email').value.trim();
  if(!$('consent').checked){ $('subMsg').textContent='Vink eerst aan dat je deze e-mails wilt ontvangen.'; return; }
  $('subBtn').disabled=true; $('subMsg').textContent='Aanvragen…';
  try{
    const h=headers(); h['Content-Type']='application/json';
    const r=await fetch(SUBSCRIBE,{method:'POST',cache:'no-store',referrerPolicy:'no-referrer',headers:h,body:JSON.stringify({token:TOKEN,email:email,consent:true})});
    const j=await r.json();
    $('subMsg').textContent={pending:'Check je inbox (en spam) en bevestig via de knop in de e-mail. Pas daarna krijg je meldingen.',already:'Dit adres krijgt al meldingen voor deze link.',bad_email:'Dit e-mailadres klopt niet.',full:'Voor deze link zijn al genoeg e-mailadressen aangemeld.',rate_limited:'Te veel aanvragen. Probeer het later opnieuw.',no_trip:'Deze link hoort niet (meer) bij een lopende reis.',locked:'Vul eerst de toegangscode in.',invalid:'Deze link is ongeldig, verlopen of ingetrokken.'}[j.status]||'Aanvragen lukte niet.';
  }catch(e){ $('subMsg').textContent='Geen verbinding. Probeer opnieuw.'; }
  finally{ $('subBtn').disabled=false; }
};
tick(); setInterval(tick,10000); setInterval(renderTrip,1000);
document.addEventListener('visibilitychange',function(){ if(!document.hidden){ document.title='SafeWalk – meekijken'; tick(); } });
</script></body></html>`;
}
