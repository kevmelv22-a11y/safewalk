import { useEffect, useRef, useState, type ComponentType, type Ref } from 'react';
import { View } from 'react-native';
import WebView, { type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import {
  MAP_USER_AGENT, OSM_MAP_BASE_URL, buildOsmMapHtml, buildOsmMapState, buildOsmUpdateScript,
  type AppMapProps, type OsmMapViewState,
} from '../lib/osmMap';
import { MapErrorBoundary } from './MapErrorBoundary';

// react-native-webview 14 types are not compatible with React 19 JSX (props collapse to never).
type MapWebViewHandle = { injectJavaScript: (script: string) => void };
const MapWebView = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<MapWebViewHandle | null> }>;

type Msg =
  | { type: 'ready' }
  | { type: 'error'; message?: string }
  | { type: 'press'; lat: number; lng: number }
  | { type: 'dragend'; id: string; lat: number; lng: number };

export function OsmMap(props: AppMapProps) {
  const ref = useRef<MapWebViewHandle>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [html] = useState(() => buildOsmMapHtml(buildOsmMapState(props)));
  const stateKey = JSON.stringify(buildOsmMapState(props));

  const fail = () => {
    if (failed) return;
    setFailed(true);
    props.onError?.();
  };

  useEffect(() => {
    if (!ready || failed) return;
    ref.current?.injectJavaScript(buildOsmUpdateScript(JSON.parse(stateKey) as OsmMapViewState));
  }, [ready, stateKey, failed]);

  const onMessage = (e: WebViewMessageEvent) => {
    let msg: Msg;
    try { msg = JSON.parse(e.nativeEvent.data) as Msg; } catch { return; }
    if (msg.type === 'ready') { setReady(true); return; }
    if (msg.type === 'error') { fail(); return; }
    if (msg.type === 'press' && Number.isFinite(msg.lat) && Number.isFinite(msg.lng)) {
      props.onPress?.({ lat: msg.lat, lng: msg.lng });
      return;
    }
    if (msg.type === 'dragend' && msg.id && Number.isFinite(msg.lat) && Number.isFinite(msg.lng)) {
      props.onMarkerDragEnd?.(msg.id, { lat: msg.lat, lng: msg.lng });
    }
  };

  const fallback = <View style={[{ flex: 1, minHeight: 160 }, props.style]} accessibilityLabel={props.accessibilityLabel} />;
  if (failed) return fallback;

  return (
    <MapErrorBoundary fallback={fallback} onError={fail}>
      <MapWebView
        ref={ref}
        source={{ html, baseUrl: OSM_MAP_BASE_URL }}
        originWhitelist={['*']}
        style={[{ flex: 1, backgroundColor: 'transparent' }, props.style]}
        userAgent={MAP_USER_AGENT}
        applicationNameForUserAgent="SafeWalk"
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        geolocationEnabled={false}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        mixedContentMode="never"
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        automaticallyAdjustContentInsets={false}
        scrollEnabled={false}
        bounces={false}
        onMessage={onMessage}
        onError={fail}
        accessibilityLabel={props.accessibilityLabel}
      />
    </MapErrorBoundary>
  );
}
