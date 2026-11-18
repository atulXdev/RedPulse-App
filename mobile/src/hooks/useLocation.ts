// Foreground location. Writes to the backend are throttled (>=1/min and only
// after moving >=100m), so a donor appears in nearby searches without spamming
// the API. Reverse geocode for a human-readable address (best-effort).
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { useAuth } from '@/stores/authStore';
import { apiUpdateLocation } from '@/utils/api';

export interface LocationCoords {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

interface UseLocationReturn {
  location: LocationCoords | null;
  address: string | null;
  permissionGranted: boolean;
  loading: boolean;
  error: string | null;
  requestPermission: () => Promise<boolean>;
  refreshLocation: () => Promise<LocationCoords | null>;
}

const LOCATION_WRITE_MIN_GAP_MS = 60_000;
const LOCATION_MIN_DELTA_M = 100;

function metresBetween(a: LocationCoords, b: LocationCoords): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function useLocation(autoStart = false): UseLocationReturn {
  const { user } = useAuth();
  const [location, setLocation] = useState<LocationCoords | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [permissionGranted, setGranted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastWriteAtRef = useRef(0);
  const lastWroteRef = useRef<LocationCoords | null>(null);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === 'granted';
      setGranted(granted);
      return granted;
    } catch {
      return false;
    }
  }, []);

  const reverseGeocode = useCallback(async (lat: number, lon: number) => {
    try {
      const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
      const r = results[0];
      if (r) setAddress([r.street, r.district, r.city, r.region].filter(Boolean).join(', '));
    } catch {
      // address is non-critical
    }
  }, []);

  const maybeWriteLocation = useCallback(async (coords: LocationCoords) => {
    if (!user?.id) return;
    const now = Date.now();
    const last = lastWroteRef.current;
    const movedEnough = !last || metresBetween(last, coords) >= LOCATION_MIN_DELTA_M;
    const cooledDown = now - lastWriteAtRef.current >= LOCATION_WRITE_MIN_GAP_MS;
    if (!movedEnough && !cooledDown) return;
    try {
      await apiUpdateLocation(coords.latitude, coords.longitude);
      lastWriteAtRef.current = now;
      lastWroteRef.current = coords;
    } catch {
      // server may be down; keep last-known state, never surface to the user
    }
  }, [user?.id]);

  const refreshLocation = useCallback(async (): Promise<LocationCoords | null> => {
    setLoading(true);
    setError(null);
    try {
      const { status: currentStatus } = await Location.getForegroundPermissionsAsync();
      let granted = currentStatus === 'granted';
      if (!granted) {
        granted = await requestPermission();
        if (!granted) {
          setError('Location permission denied');
          return null;
        }
      }
      setGranted(true);

      let latestCoords: LocationCoords | null = null;

      // 1. Fast path: immediately get last-known position (<50ms)
      try {
        const lastPos = await Location.getLastKnownPositionAsync();
        if (lastPos) {
          latestCoords = {
            latitude: lastPos.coords.latitude,
            longitude: lastPos.coords.longitude,
            accuracy: lastPos.coords.accuracy ?? undefined,
          };
          setLocation(latestCoords);
          void reverseGeocode(latestCoords.latitude, latestCoords.longitude);
        }
      } catch {
        // Optional fast path
      }

      // 2. High-speed accurate fix: Balanced accuracy
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        latestCoords = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? undefined,
        };
        setLocation(latestCoords);
        await Promise.all([
          reverseGeocode(latestCoords.latitude, latestCoords.longitude),
          maybeWriteLocation(latestCoords),
        ]);
      } catch (err) {
        if (!latestCoords) throw err;
      }

      return latestCoords;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to get location');
      return null;
    } finally {
      setLoading(false);
    }
  }, [requestPermission, reverseGeocode, maybeWriteLocation]);

  useEffect(() => {
    if (autoStart) void refreshLocation();
  }, [autoStart, refreshLocation]);

  return { location, address, permissionGranted, loading, error, requestPermission, refreshLocation };
}
