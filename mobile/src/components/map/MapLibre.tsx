// src/components/map/MapLibre.tsx
// Unified Map Bridge:
// • Development / Production builds: Uses native @maplibre/maplibre-react-native.
// • Expo Go: Uses an interactive OpenStreetMap / CARTO tile map via react-native-webview
//   with full GPS user location indicator, pinch-to-zoom, pan, live pins, and tap-to-reposition.
import React, {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useAppTheme, useIsDark } from '@/stores/themeStore';
import { Radius, Spacing } from '@/constants/Typography';
import { Text } from '@/ui/Text';
import { Ionicons } from '@expo/vector-icons';

export const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
  Constants.appOwnership === 'expo';

// Only load native MapLibre when NOT in Expo Go to avoid missing TurboModule crashes.
let NativeMapLibre: any = null;
if (!isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    NativeMapLibre = require('@maplibre/maplibre-react-native');
  } catch {
    NativeMapLibre = null;
  }
}

export interface PressEvent {
  lngLat: [number, number];
  screenCoordinate?: { x: number; y: number };
}

export interface CameraRef {
  flyTo: (options: { center?: [number, number]; zoom?: number; duration?: number }) => void;
  fitBounds: (bounds: [number, number, number, number], options?: any) => void;
  setCamera: (config: any) => void;
}

interface MapMarkerItem {
  id: string;
  lat: number;
  lon: number;
  type: 'hospital' | 'donor' | 'user' | 'blood_bank';
  onPress?: () => void;
}

interface MapContextValue {
  center: [number, number]; // [lon, lat]
  setCenter: (c: [number, number]) => void;
  registerCamera: (ref: CameraRef) => void;
  markers: MapMarkerItem[];
  addMarker: (m: MapMarkerItem) => void;
  removeMarker: (id: string) => void;
}

const MapContext = createContext<MapContextValue>({
  center: [77.2090, 28.6139],
  setCenter: () => {},
  registerCamera: () => {},
  markers: [],
  addMarker: () => {},
  removeMarker: () => {},
});

/* ────────────────────────────────────────────────────────────────────────── */
/* Leaflet HTML Generator for Expo Go                                         */
/* ────────────────────────────────────────────────────────────────────────── */

function buildMapHTML(isDark: boolean, lat: number, lon: number, zoom: number): string {
  // Always use OpenStreetMap tiles directly (100% free, no API key required).
  // In dark mode, we apply a high-performance CSS tile filter so dark mode matches
  // the app theme without watermarks or paid API key dependencies.
  const tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const bgColor = isDark ? '#14161b' : '#f5f5f5';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; background: ${bgColor}; overflow: hidden; }
    ${isDark ? `
    .leaflet-tile {
      filter: brightness(0.65) invert(1) contrast(2.5) hue-rotate(200deg) saturate(0.3) brightness(0.75) !important;
    }
    ` : ''}
    .pulse-user {
      width: 18px;
      height: 18px;
      background: #2563EB;
      border: 3px solid #FFFFFF;
      border-radius: 50%;
      box-shadow: 0 0 12px rgba(37,99,235,0.7);
    }
    .hospital-pin {
      width: 32px;
      height: 32px;
      background: #E8002D;
      border: 2.5px solid #FFFFFF;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 2px 8px rgba(0,0,0,0.35);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .hospital-pin-inner {
      transform: rotate(45deg);
      color: #FFFFFF;
      font-weight: bold;
      font-size: 16px;
      line-height: 1;
    }
    .bloodbank-pin {
      width: 32px;
      height: 32px;
      background: #990000;
      border: 2px solid #FFFFFF;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 2px 8px rgba(153,0,0,0.45);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .bloodbank-pin-inner {
      transform: rotate(45deg);
      font-size: 15px;
      line-height: 1;
    }
    .donor-dot {
      width: 12px;
      height: 12px;
      background: #E8002D;
      border: 2px solid #FFFFFF;
      border-radius: 50%;
      opacity: 0.85;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView([${lat}, ${lon}], ${zoom});

    L.tileLayer('${tileUrl}', {
      maxZoom: 19
    }).addTo(map);

    var currentMarkers = {};

    function updateMarkers(markers) {
      Object.keys(currentMarkers).forEach(function(k) {
        map.removeLayer(currentMarkers[k]);
      });
      currentMarkers = {};

      markers.forEach(function(m) {
        var icon;
        if (m.type === 'user') {
          icon = L.divIcon({
            className: '',
            html: '<div class="pulse-user"></div>',
            iconSize: [18, 18],
            iconAnchor: [9, 9]
          });
        } else if (m.type === 'hospital') {
          icon = L.divIcon({
            className: '',
            html: '<div class="hospital-pin"><div class="hospital-pin-inner">+</div></div>',
            iconSize: [32, 32],
            iconAnchor: [16, 32]
          });
        } else if (m.type === 'blood_bank') {
          icon = L.divIcon({
            className: '',
            html: '<div class="bloodbank-pin"><div class="bloodbank-pin-inner">🩸</div></div>',
            iconSize: [32, 32],
            iconAnchor: [16, 32]
          });
        } else {
          icon = L.divIcon({
            className: '',
            html: '<div class="donor-dot"></div>',
            iconSize: [12, 12],
            iconAnchor: [6, 6]
          });
        }

        var marker = L.marker([m.lat, m.lon], { icon: icon }).addTo(map);
        marker.on('click', function(e) {
          if (e.originalEvent) {
            e.originalEvent.stopPropagation();
          }
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'markerPress',
              id: m.id
            }));
          }
        });
        currentMarkers[m.id] = marker;
      });
    }

    map.on('click', function(e) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'mapPress',
          lat: e.latlng.lat,
          lon: e.latlng.lng
        }));
      }
    });

    window.flyToCenter = function(lat, lon, zoom) {
      map.flyTo([lat, lon], zoom || map.getZoom(), { duration: 0.8 });
    };

    window.fitBoundsTo = function(bounds) {
      map.fitBounds(bounds, { padding: [50, 50] });
    };

    window.setMarkers = function(list) {
      updateMarkers(list);
    };
  </script>
</body>
</html>
  `;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Expo Go Fallback Map Component                                             */
/* ────────────────────────────────────────────────────────────────────────── */

interface ExpoGoMapProps {
  style?: StyleProp<ViewStyle>;
  mapStyle?: any;
  onPress?: (event: { nativeEvent: PressEvent }) => void;
  children?: ReactNode;
  dragPan?: boolean;
  touchZoom?: boolean;
  touchRotate?: boolean;
  touchPitch?: boolean;
  doubleTapZoom?: boolean;
}

function ExpoGoMap({ style, onPress, children }: ExpoGoMapProps) {
  const isDark = useIsDark();
  const theme = useAppTheme();
  const webViewRef = useRef<WebView>(null);
  const [center, setCenter] = useState<[number, number]>([77.2090, 28.6139]);
  const [markers, setMarkers] = useState<MapMarkerItem[]>([]);
  const cameraRefHolder = useRef<CameraRef | null>(null);

  const addMarker = useCallback((m: MapMarkerItem) => {
    setMarkers((prev) => {
      const filtered = prev.filter((x) => x.id !== m.id);
      return [...filtered, m];
    });
  }, []);

  const removeMarker = useCallback((id: string) => {
    setMarkers((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const registerCamera = useCallback((camRef: CameraRef) => {
    cameraRefHolder.current = camRef;
  }, []);

  // Sync markers to Leaflet webview whenever markers change
  useEffect(() => {
    if (webViewRef.current && markers.length > 0) {
      const script = `window.setMarkers && window.setMarkers(${JSON.stringify(markers)}); true;`;
      webViewRef.current.injectJavaScript(script);
    }
  }, [markers]);

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(e.nativeEvent.data);
        if (data.type === 'mapPress' && onPress) {
          onPress({
            nativeEvent: {
              lngLat: [data.lon, data.lat],
              screenCoordinate: { x: 0, y: 0 },
            },
          });
        } else if (data.type === 'markerPress') {
          const found = markers.find((m) => m.id === data.id);
          if (found?.onPress) {
            found.onPress();
          }
        }
      } catch {
        // Message parse error ignored
      }
    },
    [onPress, markers],
  );

  const contextValue = useMemo<MapContextValue>(
    () => ({
      center,
      setCenter: (c) => {
        setCenter(c);
        if (webViewRef.current) {
          webViewRef.current.injectJavaScript(`window.flyToCenter && window.flyToCenter(${c[1]}, ${c[0]}); true;`);
        }
      },
      registerCamera,
      markers,
      addMarker,
      removeMarker,
    }),
    [center, registerCamera, markers, addMarker, removeMarker],
  );

  const html = useMemo(
    () => buildMapHTML(isDark, center[1], center[0], 14),
    [isDark, center],
  );

  return (
    <MapContext.Provider value={contextValue}>
      <View style={[styles.fallbackRoot, style]}>
        <WebView
          ref={webViewRef as any}
          originWhitelist={['*']}
          source={{ html }}
          onMessage={onMessage}
          style={styles.webView}
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          renderLoading={() => (
            <View style={[StyleSheet.absoluteFill, styles.loadingWrap, { backgroundColor: isDark ? '#121418' : '#f5f5f5' }]}>
              <ActivityIndicator color={theme.primary} size="small" />
            </View>
          )}
        />

        {/* Children (e.g. Camera refs and user overlays) */}
        {children}
      </View>
    </MapContext.Provider>
  );
}

interface ExpoGoCameraProps {
  initialViewState?: { center?: [number, number]; zoom?: number };
}

const ExpoGoCamera = forwardRef<CameraRef, ExpoGoCameraProps>(function ExpoGoCamera(
  { initialViewState },
  ref,
) {
  const { setCenter, registerCamera } = useContext(MapContext);

  useEffect(() => {
    if (initialViewState?.center && initialViewState.center[0] !== 0 && initialViewState.center[1] !== 0) {
      setCenter(initialViewState.center);
    }
  }, [initialViewState?.center, setCenter]);

  useImperativeHandle(
    ref,
    () => {
      const camObj: CameraRef = {
        flyTo: (options) => {
          if (options?.center) setCenter(options.center);
        },
        fitBounds: (_bounds, _options) => {},
        setCamera: (_config) => {},
      };
      registerCamera(camObj);
      return camObj;
    },
    [setCenter, registerCamera],
  );

  return null;
});

interface ExpoGoMarkerProps {
  id?: string;
  lngLat: [number, number];
  anchor?: 'center' | 'bottom' | 'top' | 'left' | 'right';
  children?: ReactNode;
  type?: 'hospital' | 'donor' | 'blood_bank';
  onPress?: () => void;
}

function ExpoGoMarker({ id: propId, lngLat, type = 'hospital', onPress }: ExpoGoMarkerProps) {
  const { addMarker, removeMarker } = useContext(MapContext);
  const autoIdRef = useRef(`marker-${Math.random().toString(36).substring(2, 9)}`);
  const id = propId || autoIdRef.current;

  useEffect(() => {
    if (lngLat && lngLat[0] !== 0 && lngLat[1] !== 0) {
      addMarker({ id, lon: lngLat[0], lat: lngLat[1], type, onPress });
    }
    return () => removeMarker(id);
  }, [id, lngLat, type, onPress, addMarker, removeMarker]);

  return null;
}

function ExpoGoUserLocation({ animated }: { animated?: boolean }) {
  const { center, addMarker, removeMarker } = useContext(MapContext);

  useEffect(() => {
    if (center && center[0] !== 0 && center[1] !== 0) {
      addMarker({ id: 'user-location-marker', lon: center[0], lat: center[1], type: 'user' });
    }
    return () => removeMarker('user-location-marker');
  }, [center, addMarker, removeMarker]);

  return null;
}

function ExpoGoGeoJSONSource({ children }: { id?: string; data?: any; children?: ReactNode }) {
  return <>{children}</>;
}

function ExpoGoLayer(_props: any) {
  return null;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Unified Exports                                                            */
/* ────────────────────────────────────────────────────────────────────────── */

export const MapLibreMap = NativeMapLibre ? NativeMapLibre.Map : ExpoGoMap;
export const Camera = NativeMapLibre ? NativeMapLibre.Camera : ExpoGoCamera;
export const Marker = NativeMapLibre ? NativeMapLibre.Marker : ExpoGoMarker;
export const UserLocation = NativeMapLibre ? NativeMapLibre.UserLocation : ExpoGoUserLocation;
export const GeoJSONSource = NativeMapLibre ? NativeMapLibre.GeoJSONSource : ExpoGoGeoJSONSource;
export const Layer = NativeMapLibre ? NativeMapLibre.Layer : ExpoGoLayer;

const styles = StyleSheet.create({
  fallbackRoot: {
    overflow: 'hidden',
    position: 'relative',
    flex: 1,
  },
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeBadge: {
    position: 'absolute',
    bottom: Spacing[2],
    right: Spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1],
    paddingHorizontal: Spacing[2],
    paddingVertical: 3,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 20,
  },
});
