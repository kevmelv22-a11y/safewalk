/** Pure helpers for the keyless OpenStreetMap map (OpenFreeMap + MapLibre GL JS in a WebView). */
export const OSM_ATTRIBUTION = '© OpenStreetMap-bijdragers';
export const OSM_ATTRIBUTION_URL = 'https://www.openstreetmap.org/copyright';
export const OSM_STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/liberty';
export const OSM_STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark';
export const MAP_USER_AGENT = 'SafeWalk/0.1.0 (nl.safewalk.app; support@vonkbyte.nl)';

/** Pinned MapLibre GL JS CSP build (has a dedicated worker, which WebViews need). */
export const MAPLIBRE_VERSION = '4.7.1';
export const MAPLIBRE_JS_URL = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl-csp.js`;
export const MAPLIBRE_WORKER_URL = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl-csp-worker.js`;
export const MAPLIBRE_CSS_URL = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`;
export const MAPLIBRE_JS_SRI = 'sha384-wkz3bHd2XHn0zfBLsJfGiElUhnowWv/hdfV/QfPpaQXPrS1euKdOIZFHNVrbocON';
export const MAPLIBRE_WORKER_SRI = 'sha384-nihfgYxLAwZc2OGkDb9/UgCi7mzsDxEbeUKuYBlMywKVRZPdD1dNli4fql0bu19P';
export const MAPLIBRE_CSS_SRI = 'sha384-MinO0mNliZ3vwppuPOUnGa+iq619pfMhLVUXfC4LHwSCvF9H+6P/KO4Q7qBOYV5V';
export const OSM_MAP_BASE_URL = 'https://unpkg.com/';

export type MapLatLng = { lat: number; lng: number };
export type AppMapMarker = {
  id: string;
  lat: number;
  lng: number;
  title?: string;
  color?: string;
  draggable?: boolean;
};
export type AppMapLine = {
  id: string;
  points: MapLatLng[];
  color: string;
  width: number;
  dashed?: boolean;
};
export type AppMapCircle = {
  id: string;
  lat: number;
  lng: number;
  radiusM: number;
  fillColor: string;
  strokeColor: string;
};

export type OsmMapViewState = {
  center: MapLatLng;
  zoom: number;
  dark: boolean;
  markers: AppMapMarker[];
  lines: AppMapLine[];
  circles: AppMapCircle[];
  userLocation?: MapLatLng | null;
};

export type AppMapProps = {
  style?: object;
  center: MapLatLng;
  latitudeDelta?: number;
  markers?: AppMapMarker[];
  lines?: AppMapLine[];
  circles?: AppMapCircle[];
  /** Shown as a "you are here" marker on OSM; on iOS also enables the native user-location dot. */
  userLocation?: MapLatLng | null;
  dark?: boolean;
  onPress?: (coord: MapLatLng) => void;
  onMarkerDragEnd?: (id: string, coord: MapLatLng) => void;
  onError?: () => void;
  accessibilityLabel?: string;
};

export function deltaToZoom(latitudeDelta: number): number {
  const d = Math.max(latitudeDelta, 0.0005);
  return Math.min(18, Math.max(2, Math.round(Math.log2(360 / d))));
}

export function buildOsmMapState(props: {
  center: MapLatLng;
  latitudeDelta?: number;
  markers?: AppMapMarker[];
  lines?: AppMapLine[];
  circles?: AppMapCircle[];
  userLocation?: MapLatLng | null;
  dark?: boolean;
}): OsmMapViewState {
  return {
    center: props.center,
    zoom: deltaToZoom(props.latitudeDelta ?? 0.02),
    dark: Boolean(props.dark),
    markers: props.markers ?? [],
    lines: props.lines ?? [],
    circles: (props.circles ?? []).filter((c) => c.radiusM > 0),
    userLocation: props.userLocation ?? null,
  };
}

export function buildOsmUpdateScript(state: OsmMapViewState): string {
  return `try{window.__swUpdate&&window.__swUpdate(${JSON.stringify(state)});}catch(e){}true;`;
}

/** JSON that is safe to embed inside a <script> tag (so a marker title cannot close the script). */
export function jsonForHtmlScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function buildOsmMapHtml(initial: OsmMapViewState): string {
  const boot = jsonForHtmlScript(initial);
  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<link rel="stylesheet" href="${MAPLIBRE_CSS_URL}" integrity="${MAPLIBRE_CSS_SRI}" crossorigin="anonymous"/>
<style>
  html,body,#map{margin:0;padding:0;height:100%;width:100%;background:#0d1530;overflow:hidden}
  #attr{position:absolute;right:6px;bottom:6px;z-index:2;background:rgba(255,255,255,.88);color:#111;font:11px/1.3 system-ui,sans-serif;padding:3px 6px;border-radius:4px}
  #attr a{color:#111;text-decoration:underline}
  .maplibregl-ctrl-attrib{font-size:10px}
</style>
</head>
<body>
<div id="map" role="application"></div>
<div id="attr"><a href="${OSM_ATTRIBUTION_URL}" target="_blank" rel="noopener noreferrer">${OSM_ATTRIBUTION}</a></div>
<script src="${MAPLIBRE_JS_URL}" integrity="${MAPLIBRE_JS_SRI}" crossorigin="anonymous"></script>
<script>
(function(){
  var send=function(o){try{if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(o));}catch(e){}};
  var markers={};
  var map, following=true, userMarker=null;
  function circlePoly(lat,lng,radiusM){
    var coords=[], steps=64;
    var rx=radiusM/(111320*Math.cos(lat*Math.PI/180));
    var ry=radiusM/110540;
    for(var i=0;i<=steps;i++){
      var t=2*Math.PI*i/steps;
      coords.push([lng+rx*Math.cos(t), lat+ry*Math.sin(t)]);
    }
    return {type:'Feature',geometry:{type:'Polygon',coordinates:[coords]},properties:{}};
  }
  function fc(features){return {type:'FeatureCollection',features:features};}
  function lineFeat(l){
    return {type:'Feature',properties:{id:l.id,color:l.color,width:l.width,dashed:!!l.dashed},
      geometry:{type:'LineString',coordinates:l.points.map(function(p){return [p.lng,p.lat];})}};
  }
  function ensureSources(){
    if(!map.getSource('sw-lines')){
      map.addSource('sw-lines',{type:'geojson',data:fc([])});
      map.addLayer({id:'sw-lines-solid',type:'line',source:'sw-lines',
        filter:['!=',['get','dashed'],true],
        paint:{'line-color':['get','color'],'line-width':['get','width'],'line-opacity':0.95}});
      map.addLayer({id:'sw-lines-dash',type:'line',source:'sw-lines',
        filter:['==',['get','dashed'],true],
        paint:{'line-color':['get','color'],'line-width':['get','width'],'line-dasharray':[2,1],'line-opacity':0.9}});
    }
    if(!map.getSource('sw-circles')){
      map.addSource('sw-circles',{type:'geojson',data:fc([])});
      map.addLayer({id:'sw-circles-fill',type:'fill',source:'sw-circles',
        paint:{'fill-color':['get','fill'],'fill-opacity':0.25}});
      map.addLayer({id:'sw-circles-line',type:'line',source:'sw-circles',
        paint:{'line-color':['get','stroke'],'line-width':2}});
    }
  }
  function syncOverlays(s){
    ensureSources();
    map.getSource('sw-lines').setData(fc((s.lines||[]).filter(function(l){return l.points&&l.points.length>1;}).map(lineFeat)));
    map.getSource('sw-circles').setData(fc((s.circles||[]).filter(function(c){return c.radiusM>0;}).map(function(c){
      var f=circlePoly(c.lat,c.lng,c.radiusM); f.properties={fill:c.fillColor,stroke:c.strokeColor}; return f;
    })));
    var seen={};
    (s.markers||[]).forEach(function(m){
      seen[m.id]=1;
      var existing=markers[m.id];
      if(existing){ existing.setLngLat([m.lng,m.lat]); if(m.color) existing.getElement().style.backgroundColor=m.color; return; }
      var el=document.createElement('div');
      el.style.cssText='width:16px;height:16px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.35);background:'+(m.color||'#7856FF')+';cursor:pointer';
      el.title=m.title||'';
      var mk=new maplibregl.Marker({element:el,draggable:!!m.draggable,anchor:'center'}).setLngLat([m.lng,m.lat]);
      if(m.title) mk.setPopup(new maplibregl.Popup({closeButton:false,offset:12}).setText(m.title));
      if(m.draggable) mk.on('dragend',function(){ var ll=mk.getLngLat(); send({type:'dragend',id:m.id,lat:ll.lat,lng:ll.lng}); });
      mk.addTo(map);
      markers[m.id]=mk;
    });
    Object.keys(markers).forEach(function(id){ if(!seen[id]){ markers[id].remove(); delete markers[id]; } });
    if(s.userLocation){
      if(!userMarker){
        var uel=document.createElement('div');
        uel.style.cssText='width:14px;height:14px;border-radius:50%;background:#2563eb;border:2px solid #fff;box-shadow:0 0 0 6px rgba(37,99,235,.25)';
        uel.title='Jouw locatie';
        userMarker=new maplibregl.Marker({element:uel,anchor:'center'}).setLngLat([s.userLocation.lng,s.userLocation.lat]).addTo(map);
      } else userMarker.setLngLat([s.userLocation.lng,s.userLocation.lat]);
    } else if(userMarker){ userMarker.remove(); userMarker=null; }
  }
  window.__swUpdate=function(s){
    if(!map||!map.loaded()){ window.__swPending=s; return; }
    var styleUrl=s.dark?'${OSM_STYLE_DARK}':'${OSM_STYLE_LIGHT}';
    // Style URL itself is the source of truth; swap only when theme changes.
    if(window.__swStyle!==styleUrl){
      window.__swStyle=styleUrl;
      map.setStyle(styleUrl);
      map.once('style.load',function(){ syncOverlays(s); });
    } else syncOverlays(s);
    if(s.center && following){
      map.easeTo({center:[s.center.lng,s.center.lat],zoom:s.zoom||map.getZoom(),duration:400});
    }
  };
  try{
    if(typeof maplibregl==='undefined'){ send({type:'error',message:'maplibre-missing'}); return; }
    maplibregl.workerUrl='${MAPLIBRE_WORKER_URL}';
    var boot=${boot};
    window.__swStyle=boot.dark?'${OSM_STYLE_DARK}':'${OSM_STYLE_LIGHT}';
    map=new maplibregl.Map({
      container:'map',
      style:window.__swStyle,
      center:[boot.center.lng,boot.center.lat],
      zoom:boot.zoom||14,
      attributionControl:true,
      cooperativeGestures:false
    });
    map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
    map.on('dragstart',function(){ following=false; });
    map.on('click',function(e){ send({type:'press',lat:e.lngLat.lat,lng:e.lngLat.lng}); });
    map.on('error',function(e){ if(!window.__swHasLoaded) send({type:'error',message:String((e&&e.error&&e.error.message)||e||'map-error')}); });
    map.on('load',function(){
      window.__swHasLoaded=true;
      syncOverlays(boot);
      if(window.__swPending){ syncOverlays(window.__swPending); window.__swPending=null; }
      send({type:'ready'});
    });
  }catch(err){ send({type:'error',message:String(err&&err.message||err)}); }
})();
</script>
</body>
</html>`;
}
