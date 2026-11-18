// Lever: DECIDE -> VERIFY -> ACT. Commitment via map-pin-first, Uber's
// ride-request pattern remixed for blood.
//
//   DECIDE  The map owns the top ~55%. An oversized hospital pin plus pulsing
//           crimson dots for nearby compatible donors turn motion into
//           perceived availability. Tap the map to move the pin (commit a
//           place before you commit a form).
//
//   VERIFY  An ascending sheet rises over the map. A route bar (you ->
//           hospital), a horizontal urgency carousel that spring-scales on
//           select, a live donor-availability badge, an 8-cell blood grid, a
//           units stepper that spells out how many donors get matched, an
//           optional note, and a "what donors will see" preview card. Every
//           field is one last sanity check before commit.
//
//   ACT     A sticky inline CTA whose label mirrors the urgency tier. When the
//           tier is critical the pill breathes (loss-aversion via motion).
//           Haptics on pin drop, select, and commit. Reduced-motion users get
//           the same screen without the pulse or breath.
//
// Recipients (and 'both') land here. The tab layout hides this for donors.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet,
  useWindowDimensions, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  MapLibreMap, Camera, type CameraRef, Marker, UserLocation,
  type PressEvent,
} from '@/components/map/MapLibre';
import { getMapStyleJSON, zoomFromRadiusKm } from '@/utils/mapStyles';
import * as Haptics from 'expo-haptics';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Animated, {
  Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue,
  withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { useAppTheme, useIsDark } from '@/stores/themeStore';
import { useAuth } from '@/stores/authStore';
import { useToast } from '@/stores/toastStore';
import { useLocation } from '@/hooks/useLocation';
import { useNearbyDonors } from '@/queries/stats';
import { useCreateRequest } from '@/queries/requests';
import { requestSchema, type RequestForm } from '@/schemas';
import {
  BLOOD_GROUPS, URGENCY_LEVELS, type BloodGroup, type UrgencyLevel,
} from '@/constants/BloodData';
import {
  FontSize, FontWeight, LetterSpacing, Spacing, Radius, Elevation, Motion,
  TAB_BAR_BOTTOM_INSET,
} from '@/constants/Typography';
import type { ThemeColors } from '@/constants/Colors';
import { errorReporter } from '@/lib/errorReporter';
import { fetchNearbyBloodBanks, type BloodBank } from '@/services/bloodBanks';
import { Text, BloodGroupBadge, Input, Button } from '@/ui';

const RADIUS_KM = 25;
const MAX_UNITS = 10;
const MAX_DOTS = 8;

// Urgency meta drives the carousel cards, the sub-copy, and the CTA label.
const URGENCY_META: Record<UrgencyLevel, {
  label: string;
  window: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = {
  critical: { label: 'Critical', window: 'in 30 min', sub: 'Alarm-tone alert, bypasses silent mode.', icon: 'flash' },
  urgent:   { label: 'Urgent',   window: 'in 2 hrs',  sub: 'Heads-up notification, no alarm.',         icon: 'time' },
  standard: { label: 'Standard', window: 'today',     sub: 'Standard notification.',                   icon: 'calendar-outline' },
};

function ctaLabelFor(urgency: UrgencyLevel): string {
  if (urgency === 'critical') return 'Post critical request';
  if (urgency === 'urgent') return 'Post urgent request';
  return 'Post request';
}

function urgencyColor(urgency: UrgencyLevel, theme: ThemeColors): string {
  if (urgency === 'critical') return theme.danger;
  if (urgency === 'urgent') return theme.warning;
  return theme.success;
}

function readNearbyCount(data: unknown): number {
  if (data && typeof data === 'object' && 'count' in data) {
    const c = (data as { count?: unknown }).count;
    if (typeof c === 'number' && Number.isFinite(c)) return c;
  }
  if (data && typeof data === 'object' && 'donors' in data) {
    const d = (data as { donors?: unknown }).donors;
    if (Array.isArray(d)) return d.length;
  }
  return 0;
}

// Deterministic jitter around the pin so donor dots feel placed, never random
// per render. Coordinates are display-only and never real donor positions.
type DonorDot = { id: string; lat: number; lon: number };

function jitterDots(count: number, lat: number, lon: number): DonorDot[] {
  const n = Math.min(count, MAX_DOTS);
  const cosLat = Math.cos((lat * Math.PI) / 180) || 1;
  return Array.from({ length: n }).map((_, idx) => {
    const angle = (idx / Math.max(n, 1)) * 2 * Math.PI + idx * 0.7;
    const km = 0.6 + ((idx * 2.3) % 6); // 0.6 to ~6.6 km out, spread by index
    const dLat = (km / 111) * Math.sin(angle);
    const dLon = (km / (111 * cosLat)) * Math.cos(angle);
    return { id: `donor-dot-${idx}`, lat: lat + dLat, lon: lon + dLon };
  });
}

// ── Pulsing donor dot (UI-thread worklet). Static when reduced motion. ──────
const PulseDot = React.memo(function PulseDot({
  color, reduced,
}: { color: string; reduced: boolean }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    if (reduced) { progress.value = 0; return; }
    progress.value = withRepeat(
      withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.ease) }),
      -1, false,
    );
  }, [progress, reduced]);
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.6, 2.4]) }],
    opacity: interpolate(progress.value, [0, 0.6, 1], [0.45, 0.2, 0]),
  }));
  return (
    <Animated.View style={pulseStyles.wrap}>
      <Animated.View style={[pulseStyles.ring, { backgroundColor: color }, ringStyle]} />
      <Animated.View style={[pulseStyles.dot, { backgroundColor: color }]} />
    </Animated.View>
  );
});
const pulseStyles = StyleSheet.create({
  wrap: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 24, height: 24, borderRadius: 12 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: '#FFFFFF' },
});

// ── Urgency choice card. Springs to 1.04 on select (static when reduced). ───
const UrgencyCard = React.memo(function UrgencyCard({
  level, selected, onPress, theme, reduced,
}: {
  level: UrgencyLevel; selected: boolean; onPress: () => void;
  theme: ThemeColors; reduced: boolean;
}) {
  const scale = useSharedValue(selected ? 1.04 : 1);
  useEffect(() => {
    const target = selected ? 1.04 : 1;
    scale.value = reduced ? target : withSpring(target, Motion.spring.snappy);
  }, [selected, scale, reduced]);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const meta = URGENCY_META[level];
  const bg = selected ? theme.primary : theme.cardElevated;
  const fg = selected ? theme.textOnPrimary : theme.textPrimary;
  const sub = selected ? theme.textOnPrimary : theme.textMuted;

  return (
    <Animated.View style={aStyle}>
      <Pressable
        onPress={onPress}
        style={[
          urgencyStyles.card,
          { backgroundColor: bg, borderColor: selected ? theme.primary : theme.border },
          selected && Elevation.sm,
        ]}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={`${meta.label} urgency, needed ${meta.window}`}
      >
        <Animated.View
          style={[
            urgencyStyles.iconWrap,
            { backgroundColor: selected ? 'rgba(255,255,255,0.18)' : theme.surface },
          ]}
        >
          <Ionicons name={meta.icon} size={18} color={fg} />
        </Animated.View>
        <Text style={[urgencyStyles.label, { color: fg }]}>{meta.label}</Text>
        <Text style={[urgencyStyles.window, { color: sub }]}>{meta.window}</Text>
      </Pressable>
    </Animated.View>
  );
});
const urgencyStyles = StyleSheet.create({
  card: {
    width: 132,
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.xl,
    borderCurve: 'continuous',
    borderWidth: 1.5,
    alignItems: 'flex-start',
    gap: Spacing[2],
    marginRight: Spacing[3],
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: Radius.pill,
    alignItems: 'center', justifyContent: 'center',
  },
  label: { fontSize: FontSize.base, fontWeight: FontWeight.black, letterSpacing: LetterSpacing.snug },
  window: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, letterSpacing: LetterSpacing.snug },
});

// ── Breathing wrapper for the CTA on critical (loss-aversion via motion). ───
const BreathingWrapper = React.memo(function BreathingWrapper({
  enabled, children,
}: { enabled: boolean; children: React.ReactNode }) {
  const breath = useSharedValue(1);
  useEffect(() => {
    if (enabled) {
      breath.value = withRepeat(
        withSequence(
          withTiming(1.02, { duration: 900, easing: Easing.inOut(Easing.ease) }),
          withTiming(1.0, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        ),
        -1, false,
      );
    } else {
      breath.value = withTiming(1, { duration: Motion.duration.fast });
    }
  }, [enabled, breath]);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: breath.value }] }));
  return <Animated.View style={aStyle}>{children}</Animated.View>;
});

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      variant="overline"
      tone="muted"
      style={{ marginLeft: Spacing[2], marginBottom: Spacing[2] }}
    >
      {children}
    </Text>
  );
}

function PreviewChip({
  icon, label, color,
}: { icon: keyof typeof Ionicons.glyphMap; label: string; color: string }) {
  return (
    <Animated.View style={[chipStyles.chip, { backgroundColor: color + '1F', borderColor: color + '55' }]}>
      <Ionicons name={icon} size={12} color={color} />
      <Text style={[chipStyles.label, { color }]}>{label}</Text>
    </Animated.View>
  );
}
const chipStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing[2], paddingVertical: 3,
    borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: FontSize['2xs'], fontWeight: FontWeight.black,
    letterSpacing: LetterSpacing.snug, textTransform: 'uppercase',
  },
});

export default function RequestScreen() {
  const theme = useAppTheme();
  const isDark = useIsDark();
  const reduced = useReducedMotion();
  const { profile } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ hospital?: string; address?: string; lat?: string; lon?: string }>();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const { location, refreshLocation } = useLocation(true);
  const createM = useCreateRequest();

  const cameraRef = useRef<CameraRef | null>(null);
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null);

  // Blood bank pins on map
  const [showBloodBanks, setShowBloodBanks] = useState(false);
  const [nearbyBanks, setNearbyBanks] = useState<BloodBank[]>([]);
  const [selectedBank, setSelectedBank] = useState<BloodBank | null>(null);

  // react-hook-form owns the request payload. The pin drives lat/lon.
  const { control, handleSubmit, setValue, formState } = useForm<RequestForm>({
    resolver: zodResolver(requestSchema),
    defaultValues: {
      blood_group: (profile?.blood_group as BloodGroup) ?? 'O+',
      urgency: 'urgent',
      units_needed: 1,
      hospital_name: '',
      hospital_address: '',
      latitude: 0,
      longitude: 0,
      notes: '',
    },
  });

  // Handle incoming params from BloodBankCard "Request Here"
  useEffect(() => {
    if (params.hospital) {
      setValue('hospital_name', params.hospital, { shouldValidate: true });
    }
    if (params.hospital || params.address) {
      const rawAddress = params.address || '';
      const safeAddress = rawAddress.trim().length >= 2
        ? rawAddress.trim()
        : `${params.hospital || 'Hospital'}, Medical District`;
      setValue('hospital_address', safeAddress, { shouldValidate: true });
    }
    if (params.lat && params.lon) {
      const pLat = parseFloat(params.lat);
      const pLon = parseFloat(params.lon);
      if (!isNaN(pLat) && !isNaN(pLon)) {
        setPin({ latitude: pLat, longitude: pLon });
        setValue('latitude', pLat, { shouldValidate: true });
        setValue('longitude', pLon, { shouldValidate: true });
        cameraRef.current?.flyTo({ center: [pLon, pLat], zoom: 15 });
      }
    }
  }, [params.hospital, params.address, params.lat, params.lon, setValue]);

  // Lazy-load blood banks when toggled on map
  useEffect(() => {
    if (location && showBloodBanks && nearbyBanks.length === 0) {
      void fetchNearbyBloodBanks(location.latitude, location.longitude, 30).then(setNearbyBanks);
    }
  }, [location, showBloodBanks, nearbyBanks.length]);

  // useWatch keeps these reactive without the watch() compiler-skip warning.
  const bloodGroup = useWatch({ control, name: 'blood_group' }) as BloodGroup;
  const urgency = useWatch({ control, name: 'urgency' }) as UrgencyLevel;
  const units = useWatch({ control, name: 'units_needed' });
  const hospitalName = useWatch({ control, name: 'hospital_name' });
  const hospitalAddress = useWatch({ control, name: 'hospital_address' });

  // Live donor count near the pin, filtered to the requested group. Distance
  // only, never coordinates; dots are jittered for display.
  const nearbyQuery = pin
    ? { lat: pin.latitude, lon: pin.longitude, radiusKm: RADIUS_KM, bloodGroup }
    : null;
  const nearby = useNearbyDonors(nearbyQuery);
  const donorCount = readNearbyCount(nearby.data);
  const donorDots = pin ? jitterDots(donorCount, pin.latitude, pin.longitude) : [];

  // Drop the pin on the user's location once it resolves. This syncs an
  // imperative external system (the GPS) into local + form state one time.
  useEffect(() => {
    if (location) {
      setPin((prev) => {
        if (!prev) {
          setValue('latitude', location.latitude, { shouldValidate: true });
          setValue('longitude', location.longitude, { shouldValidate: true });
          return { latitude: location.latitude, longitude: location.longitude };
        }
        return prev;
      });
    }
  }, [location, setValue]);

  const movePin = useCallback((latitude: number, longitude: number) => {
    void Haptics.selectionAsync();
    setPin({ latitude, longitude });
    setValue('latitude', latitude, { shouldValidate: true });
    setValue('longitude', longitude, { shouldValidate: true });
  }, [setValue]);

  const onMapPress = useCallback((event: { nativeEvent: PressEvent }) => {
    const lngLat = event?.nativeEvent?.lngLat;
    if (!Array.isArray(lngLat) || lngLat.length < 2) return;
    const [longitude, latitude] = lngLat;
    movePin(latitude, longitude);
  }, [movePin]);

  const onRecenter = useCallback(async () => {
    void Haptics.selectionAsync();
    const fresh = await refreshLocation();
    const target = fresh ?? location;
    if (target) {
      cameraRef.current?.flyTo({
        center: [target.longitude, target.latitude],
        zoom: zoomFromRadiusKm(1),
        duration: reduced ? 0 : Motion.duration.base,
      });
      movePin(target.latitude, target.longitude);
      toast.info('Location pinned', { description: 'Hospital pin placed at your current location.' });
    } else {
      toast.warning('Locating...', { description: 'Waiting for GPS fix. Ensure device location is enabled.' });
    }
  }, [refreshLocation, location, movePin, reduced, toast]);

  const selectGroup = useCallback((g: BloodGroup) => {
    void Haptics.selectionAsync();
    setValue('blood_group', g, { shouldValidate: true });
  }, [setValue]);

  const selectUrgency = useCallback((u: UrgencyLevel) => {
    void Haptics.selectionAsync();
    setValue('urgency', u, { shouldValidate: true });
  }, [setValue]);

  const stepUnits = useCallback((delta: number) => {
    void Haptics.selectionAsync();
    const next = Math.max(1, Math.min(MAX_UNITS, units + delta));
    setValue('units_needed', next, { shouldValidate: true });
  }, [units, setValue]);

  const onSubmit = useCallback((form: RequestForm) => {
    if (!pin) {
      toast.error('Pin the hospital first', { description: 'Tap the map to set where you need blood.' });
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const safeAddress = form.hospital_address.trim().length < 5
      ? `${form.hospital_address.trim()}, Medical Area`
      : form.hospital_address.trim();

    createM.mutate(
      {
        ...form,
        hospital_name: form.hospital_name.trim().slice(0, 190),
        hospital_address: safeAddress.slice(0, 390),
        latitude: pin.latitude,
        longitude: pin.longitude,
        notes: form.notes?.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Request posted', { description: 'Compatible donors near the hospital are being notified.' });
          router.replace('/(tabs)/my-requests');
        },
        onError: (e) => {
          errorReporter.error(e, { screen: 'tabs/request' });
          toast.error("We couldn't post that", { description: e instanceof Error ? e.message : 'Check your connection and tap again.' });
        },
      },
    );
  }, [pin, createM, toast, router]);

  const onInvalid = useCallback(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    toast.warning('A few fields need attention', { description: 'Fill the highlighted fields, then post.' });
  }, [toast]);

  const submitting = createM.isPending;
  const ctaAccent = urgencyColor(urgency, theme);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const mapHeight = isMapExpanded
    ? Math.max(340, Math.round(height * 0.62))
    : 210;
  const userLine = location ? 'Your current location' : 'Locating you';

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ───────────────────────── MAP (DECIDE) ─────────────────────────── */}
      <Animated.View style={[styles.mapWrap, { height: mapHeight, backgroundColor: theme.surface }]}>
        <MapLibreMap
          style={StyleSheet.absoluteFill}
          mapStyle={getMapStyleJSON(isDark)}
          onPress={onMapPress}
        >
          <Camera
            ref={cameraRef}
            initialViewState={{
              center: [
                pin?.longitude ?? location?.longitude ?? 77.209,
                pin?.latitude ?? location?.latitude ?? 28.6139,
              ],
              zoom: zoomFromRadiusKm(2),
            }}
          />
          <UserLocation animated />

          {donorDots.map((d) => (
            <Marker key={d.id} lngLat={[d.lon, d.lat]} anchor="center">
              <PulseDot color={theme.primary} reduced={reduced} />
            </Marker>
          ))}

          {/* Blood Bank / Hospital pins from OpenStreetMap */}
          {showBloodBanks && nearbyBanks.map((b) => (
            <Marker
              key={b.id}
              id={b.id}
              lngLat={[b.longitude, b.latitude]}
              type="blood_bank"
              onPress={() => {
                void Haptics.selectionAsync();
                setSelectedBank(b);
                cameraRef.current?.flyTo({ center: [b.longitude, b.latitude], zoom: 15 });
              }}
            />
          ))}

          {pin && (
            <Marker lngLat={[pin.longitude, pin.latitude]} anchor="bottom">
              <Animated.View style={[styles.bigPin, { backgroundColor: theme.primary, borderColor: theme.surface }]}>
                <Ionicons name="medical" size={18} color={theme.textOnPrimary} />
              </Animated.View>
            </Marker>
          )}
        </MapLibreMap>

        {/* Map Top Action Bar */}
        <Animated.View pointerEvents="box-none" style={[styles.mapTop, { top: insets.top + Spacing[3] }]}>
          <Animated.View
            style={[
              styles.statusPill,
              { backgroundColor: theme.surface, borderColor: theme.border },
              Elevation.sm,
            ]}
          >
            <Ionicons
              name={pin ? 'location' : 'location-outline'}
              size={14}
              color={pin ? theme.primary : theme.textMuted}
            />
            <Text style={[styles.statusPillText, { color: theme.textPrimary }]}>
              {pin ? 'Hospital Pinned' : 'Tap map to pin'}
            </Text>
          </Animated.View>

          <Animated.View style={{ flex: 1 }} />

          <Animated.View style={styles.mapActionRow}>
            {/* Toggle Blood Banks button */}
            <Pressable
              onPress={() => {
                void Haptics.selectionAsync();
                setShowBloodBanks((prev) => {
                  const next = !prev;
                  if (next) {
                    toast.info('Blood banks loaded', { description: 'Tap any red pin to inspect and select facility.' });
                  }
                  return next;
                });
              }}
              style={({ pressed }) => [
                styles.mapBtn,
                {
                  backgroundColor: showBloodBanks ? theme.primary : theme.surface,
                  borderColor: theme.border,
                  opacity: pressed ? 0.9 : 1,
                },
                Elevation.md,
              ]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Toggle blood banks on map"
            >
              <Ionicons
                name="water"
                size={18}
                color={showBloodBanks ? theme.textOnPrimary : theme.primary}
              />
            </Pressable>

            {/* Recenter button */}
            <Pressable
              onPress={onRecenter}
              style={({ pressed }) => [
                styles.mapBtn,
                { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.9 : 1 },
                Elevation.md,
              ]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Recenter on my GPS location"
            >
              <Ionicons name="locate" size={18} color={theme.primary} />
            </Pressable>

            {/* Expand / Minimize map toggle */}
            <Pressable
              onPress={() => {
                void Haptics.selectionAsync();
                setIsMapExpanded((prev) => !prev);
              }}
              style={({ pressed }) => [
                styles.mapBtn,
                { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.9 : 1 },
                Elevation.md,
              ]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={isMapExpanded ? 'Minimize map' : 'Expand map'}
            >
              <Ionicons
                name={isMapExpanded ? 'contract-outline' : 'expand-outline'}
                size={18}
                color={theme.textPrimary}
              />
            </Pressable>
          </Animated.View>
        </Animated.View>

        {/* Selected Blood Bank Floating Quick Action Card */}
        {selectedBank && (
          <Animated.View
            style={[
              styles.selectedBankCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
              Elevation.md,
            ]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.selectedBankName, { color: theme.textPrimary }]} numberOfLines={1}>
                {selectedBank.name}
              </Text>
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {selectedBank.distanceKm} km away • {selectedBank.address}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setValue('hospital_name', selectedBank.name, { shouldValidate: true });
                setValue('hospital_address', selectedBank.address, { shouldValidate: true });
                movePin(selectedBank.latitude, selectedBank.longitude);
                toast.success('Hospital Set', { description: selectedBank.name });
                setSelectedBank(null);
              }}
              style={[styles.useBankBtn, { backgroundColor: theme.primary }]}
            >
              <Text style={styles.useBankBtnText}>Use Facility</Text>
            </Pressable>
            <Pressable onPress={() => setSelectedBank(null)} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={20} color={theme.textMuted} />
            </Pressable>
          </Animated.View>
        )}

        {/* Live donor-availability badge (when map expanded) */}
        {pin && isMapExpanded && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.donorBadge,
              { backgroundColor: theme.surface, borderColor: theme.border, bottom: Spacing[4], left: Spacing[4] },
              Elevation.md,
            ]}
          >
            <Animated.View style={styles.liveDotWrap}>
              <Animated.View style={[styles.liveDotOuter, { backgroundColor: theme.success + '40' }]} />
              <Animated.View style={[styles.liveDot, { backgroundColor: theme.success }]} />
            </Animated.View>
            <Animated.View>
              <Text style={[styles.badgeNumber, { color: theme.textPrimary }]}>
                {donorCount} {bloodGroup}
              </Text>
              <Text style={[styles.badgeSub, { color: theme.textMuted }]}>
                {donorCount === 0
                  ? (nearby.isLoading ? 'Checking donors' : 'No donors yet')
                  : (donorCount === 1 ? 'donor ready nearby' : 'donors ready nearby')}
              </Text>
            </Animated.View>
          </Animated.View>
        )}

        {/* Informative tap-to-pin hint banner */}
        {!isMapExpanded && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.mapBannerHint,
              { backgroundColor: isDark ? 'rgba(18,20,24,0.85)' : 'rgba(255,255,255,0.92)', borderColor: theme.border },
            ]}
          >
            <Ionicons name="information-circle-outline" size={13} color={theme.textMuted} />
            <Text style={[styles.mapBannerHintText, { color: theme.textMuted }]}>
              {pin ? 'Tap anywhere on map to reposition hospital pin' : 'Tap on map or 🎯 to pin hospital'}
            </Text>
          </Animated.View>
        )}
      </Animated.View>

      {/* ─────────────────────── BOTTOM SHEET (VERIFY) ───────────────────── */}
      <Animated.View
        style={[
          styles.sheet,
          { backgroundColor: theme.surface, borderTopColor: theme.border },
          Elevation.lg,
        ]}
      >
        <Animated.View style={styles.sheetTop}>
          <Animated.View style={[styles.handle, { backgroundColor: theme.borderStrong }]} />
        </Animated.View>

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: Spacing[5],
            paddingBottom: insets.bottom + TAB_BAR_BOTTOM_INSET + Spacing[10],
            gap: Spacing[5],
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Route bar: you -> hospital */}
          <Animated.View style={[styles.routeBar, { backgroundColor: theme.cardElevated, borderColor: theme.border }]}>
            <Animated.View style={styles.routeCol}>
              <Animated.View style={[styles.routeDot, { backgroundColor: theme.success, borderColor: theme.surface }]} />
              <Animated.View style={[styles.routeLine, { backgroundColor: theme.border }]} />
              <Animated.View style={[styles.routeDot, { backgroundColor: theme.primary, borderColor: theme.surface }]} />
            </Animated.View>
            <Animated.View style={{ flex: 1, gap: Spacing[3] }}>
              <Animated.View>
                <Text variant="overline" tone="muted">You</Text>
                <Text style={[styles.routeValue, { color: theme.textPrimary }]} numberOfLines={1}>
                  {userLine}
                </Text>
              </Animated.View>
              <Animated.View>
                <Text variant="overline" tone="muted">Hospital</Text>
                <Text style={[styles.routeValue, { color: theme.textPrimary }]} numberOfLines={1}>
                  {hospitalName.trim() || (pin ? 'Name the hospital below' : 'Tap the map to pin')}
                </Text>
              </Animated.View>
            </Animated.View>
          </Animated.View>

          {/* Urgency carousel */}
          <Animated.View>
            <SectionLabel>How urgent?</SectionLabel>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: Spacing[1], paddingRight: Spacing[3] }}
            >
              {URGENCY_LEVELS.map((u) => (
                <UrgencyCard
                  key={u}
                  level={u}
                  selected={urgency === u}
                  onPress={() => selectUrgency(u)}
                  theme={theme}
                  reduced={reduced}
                />
              ))}
            </ScrollView>
            <Text style={[styles.urgencySub, { color: theme.textMuted }]} numberOfLines={2}>
              {URGENCY_META[urgency].sub}
            </Text>
          </Animated.View>

          {/* Donor-availability badge (inline echo of the map badge) */}
          <Animated.View style={[styles.availBadge, { backgroundColor: theme.cardElevated, borderColor: theme.border }]}>
            <Animated.View style={styles.liveDotWrap}>
              <Animated.View style={[styles.liveDotOuter, { backgroundColor: theme.success + '40' }]} />
              <Animated.View style={[styles.liveDot, { backgroundColor: theme.success }]} />
            </Animated.View>
            <Text style={[styles.availText, { color: theme.textPrimary }]} numberOfLines={1}>
              <Text style={{ fontWeight: FontWeight.black, color: theme.textPrimary }}>
                {donorCount} {bloodGroup}
              </Text>
              <Text style={{ color: theme.textMuted }}>
                {donorCount === 1 ? ' donor ready within ' : ' donors ready within '}
                {RADIUS_KM} km
              </Text>
            </Text>
          </Animated.View>

          {/* Blood group 8-cell grid */}
          <Animated.View>
            <SectionLabel>Blood group needed</SectionLabel>
            <Animated.View style={styles.bloodGrid}>
              {BLOOD_GROUPS.map((g) => {
                const selected = bloodGroup === g;
                return (
                  <Pressable
                    key={g}
                    onPress={() => selectGroup(g)}
                    style={[
                      styles.bloodCell,
                      {
                        borderColor: selected ? theme.primary : theme.border,
                        backgroundColor: selected ? theme.primary : theme.cardElevated,
                      },
                      selected && Elevation.sm,
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Blood group ${g}`}
                  >
                    <Text style={[
                      styles.bloodCellLabel,
                      { color: selected ? theme.textOnPrimary : theme.textPrimary },
                    ]}>{g}</Text>
                  </Pressable>
                );
              })}
            </Animated.View>
          </Animated.View>

          {/* Units stepper */}
          <Animated.View>
            <SectionLabel>Units needed</SectionLabel>
            <Animated.View style={[styles.unitsWrap, { backgroundColor: theme.cardElevated, borderColor: theme.border }]}>
              <Pressable
                onPress={() => stepUnits(-1)}
                style={[styles.unitsBtn, { borderRightColor: theme.border }]}
                disabled={units <= 1}
                accessibilityRole="button"
                accessibilityLabel="Decrease units"
              >
                <Ionicons name="remove" size={20} color={units <= 1 ? theme.textTertiary : theme.textPrimary} />
              </Pressable>
              <Animated.View style={styles.unitsCenter}>
                <Text style={[styles.unitsValue, { color: theme.textPrimary }]}>{units}</Text>
                <Animated.View style={styles.unitsDots}>
                  {Array.from({ length: Math.min(units, MAX_UNITS) }).map((_, i) => (
                    <Animated.View key={i} style={[styles.unitsDot, { backgroundColor: theme.primary }]} />
                  ))}
                </Animated.View>
                <Text style={[styles.unitsLabel, { color: theme.textMuted }]}>
                  {units === 1 ? '1 donor will be matched' : `${units} donors will be matched`}
                </Text>
              </Animated.View>
              <Pressable
                onPress={() => stepUnits(1)}
                style={[styles.unitsBtn, { borderLeftColor: theme.border }]}
                disabled={units >= MAX_UNITS}
                accessibilityRole="button"
                accessibilityLabel="Increase units"
              >
                <Ionicons name="add" size={20} color={units >= MAX_UNITS ? theme.textTertiary : theme.textPrimary} />
              </Pressable>
            </Animated.View>
          </Animated.View>

          {/* Hospital details */}
          <Animated.View style={{ gap: Spacing[3] }}>
            <SectionLabel>Confirm the hospital</SectionLabel>
            <Controller
              control={control}
              name="hospital_name"
              render={({ field: { value, onChange, onBlur }, fieldState }) => (
                <Input
                  label="Hospital name"
                  placeholder="e.g. Services Hospital"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={fieldState.error?.message}
                  leftIcon="medical-outline"
                  returnKeyType="next"
                />
              )}
            />
            <Controller
              control={control}
              name="hospital_address"
              render={({ field: { value, onChange, onBlur }, fieldState }) => (
                <Input
                  label="Address"
                  placeholder="Building, road, area near the pin"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={fieldState.error?.message}
                  variant="area"
                />
              )}
            />
          </Animated.View>

          {/* Optional note */}
          <Animated.View>
            <SectionLabel>Add a note for donors (optional)</SectionLabel>
            <Controller
              control={control}
              name="notes"
              render={({ field: { value, onChange, onBlur }, fieldState }) => (
                <Input
                  placeholder="Patient name, ward, contact: anything that helps a donor reach you faster"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={fieldState.error?.message}
                  variant="area"
                  maxLength={280}
                />
              )}
            />
          </Animated.View>

          {/* Preview: what donors will see */}
          <Animated.View>
            <SectionLabel>What donors will see</SectionLabel>
            <Animated.View style={[styles.previewCard, { backgroundColor: theme.cardElevated, borderColor: theme.border }]}>
              <Animated.View style={[styles.previewStripe, { backgroundColor: theme.primary }]} />
              <Animated.View style={styles.previewBody}>
                <Animated.View style={styles.previewTopRow}>
                  <BloodGroupBadge group={bloodGroup} size="md" variant="solid" />
                  <Animated.View style={{ flex: 1 }}>
                    <Text style={[styles.previewHospital, { color: theme.textPrimary }]} numberOfLines={1}>
                      {hospitalName.trim() || 'Hospital name'}
                    </Text>
                    <Text style={[styles.previewAddr, { color: theme.textMuted }]} numberOfLines={1}>
                      {hospitalAddress.trim() || 'Address you confirm above'}
                    </Text>
                  </Animated.View>
                </Animated.View>
                <Animated.View style={styles.previewMeta}>
                  <PreviewChip icon={URGENCY_META[urgency].icon} label={URGENCY_META[urgency].label} color={ctaAccent} />
                  <PreviewChip icon="people-outline" label={`${units} ${units === 1 ? 'donor' : 'donors'}`} color={theme.primary} />
                  {donorCount > 0 && (
                    <PreviewChip icon="pulse" label={`${donorCount} ready`} color={theme.success} />
                  )}
                </Animated.View>
              </Animated.View>
            </Animated.View>
          </Animated.View>

          {/* ── Inline CTA (ACT) ── */}
          <Animated.View style={styles.ctaInline}>
            <Animated.View style={styles.ctaSummary}>
              <Animated.View style={[styles.ctaSummaryDot, { backgroundColor: ctaAccent }]} />
              <Text style={[styles.ctaSummaryText, { color: theme.textPrimary }]} numberOfLines={1}>
                <Text style={{ fontWeight: FontWeight.black, color: ctaAccent }}>
                  {URGENCY_META[urgency].label}
                </Text>
                <Text style={{ color: theme.textMuted }}>{'  .  '}</Text>
                <Text>{bloodGroup}</Text>
                <Text style={{ color: theme.textMuted }}>{'  .  '}</Text>
                <Text>{units} {units === 1 ? 'unit' : 'units'}</Text>
              </Text>
              {donorCount > 0 && (
                <Animated.View style={[styles.ctaPill, { backgroundColor: theme.success + '1F', borderColor: theme.success + '55' }]}>
                  <Animated.View style={[styles.ctaPillDot, { backgroundColor: theme.success }]} />
                  <Text style={[styles.ctaPillText, { color: theme.success }]}>{donorCount} live</Text>
                </Animated.View>
              )}
            </Animated.View>

            <BreathingWrapper enabled={urgency === 'critical' && !reduced && !submitting}>
              <Button
                label={ctaLabelFor(urgency)}
                onPress={handleSubmit(onSubmit, onInvalid)}
                disabled={!pin || submitting}
                loading={submitting}
                loadingLabel="Posting"
                fullWidth
                size="xl"
                variant="primary"
                haptic={false}
                icon="paper-plane"
                accessibilityLabel={ctaLabelFor(urgency)}
              />
            </BreathingWrapper>

            <Text variant="caption" tone="tertiary" style={styles.ctaFooter}>
              By posting, your contact details are shared with a donor only after they accept.
            </Text>
            {formState.errors.latitude || formState.errors.longitude ? (
              <Text variant="caption" tone="danger" style={{ textAlign: 'center' }}>
                Tap the map to pin the hospital before posting.
              </Text>
            ) : null}
          </Animated.View>
        </ScrollView>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Map
  mapWrap: { position: 'relative' },
  mapTop: {
    position: 'absolute', left: Spacing[4], right: Spacing[4],
    flexDirection: 'row', alignItems: 'center', zIndex: 10,
  },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[1],
    paddingHorizontal: Spacing[3], paddingVertical: Spacing[2],
    borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth,
  },
  statusPillText: {
    fontSize: FontSize.xs, fontWeight: FontWeight.semibold, letterSpacing: LetterSpacing.snug,
  },
  mapActionRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[2],
  },
  mapBtn: {
    width: 38, height: 38, borderRadius: Radius.pill,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  donorBadge: {
    position: 'absolute',
    flexDirection: 'row', alignItems: 'center', gap: Spacing[2],
    paddingHorizontal: Spacing[3], paddingVertical: Spacing[2],
    borderRadius: Radius.pill, borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth, maxWidth: '62%',
  },
  liveDotWrap: { width: 12, height: 12, alignItems: 'center', justifyContent: 'center' },
  liveDotOuter: { position: 'absolute', width: 12, height: 12, borderRadius: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  badgeNumber: { fontSize: FontSize.sm, fontWeight: FontWeight.black, letterSpacing: LetterSpacing.snug },
  badgeSub: { fontSize: FontSize['2xs'], fontWeight: FontWeight.semibold, marginTop: 1 },
  mapBannerHint: {
    position: 'absolute', bottom: Spacing[6], alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: Spacing[3], paddingVertical: 4,
    borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth,
  },
  mapBannerHintText: {
    fontSize: FontSize['2xs'], fontWeight: FontWeight.medium, letterSpacing: LetterSpacing.snug,
  },
  bigPin: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, ...Elevation.sm,
  },
  selectedBankCard: {
    position: 'absolute',
    bottom: Spacing[4],
    left: Spacing[4],
    right: Spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    borderRadius: Radius.xl,
    borderWidth: 1,
    zIndex: 25,
  },
  selectedBankName: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.black,
  },
  useBankBtn: {
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderRadius: Radius.lg,
  },
  useBankBtnText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },

  // Sheet
  sheet: {
    flex: 1, marginTop: -Spacing[5],
    borderTopLeftRadius: Radius['2xl'], borderTopRightRadius: Radius['2xl'],
    borderCurve: 'continuous', borderTopWidth: StyleSheet.hairlineWidth,
  },
  sheetTop: { alignItems: 'center', paddingTop: Spacing[2], paddingBottom: Spacing[3] },
  handle: { width: 44, height: 4, borderRadius: 2 },

  // Route bar
  routeBar: {
    flexDirection: 'row', gap: Spacing[3], padding: Spacing[4],
    borderRadius: Radius.xl, borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
  },
  routeCol: { alignItems: 'center', paddingTop: 4 },
  routeDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  routeLine: { width: 2, flex: 1, marginVertical: 4 },
  routeValue: {
    fontSize: FontSize.sm, fontWeight: FontWeight.bold,
    letterSpacing: LetterSpacing.snug, marginTop: 2,
  },

  urgencySub: {
    fontSize: FontSize.xs, fontWeight: FontWeight.semibold,
    letterSpacing: LetterSpacing.snug,
    marginLeft: Spacing[2], marginTop: Spacing[2],
    lineHeight: FontSize.xs * 1.5,
  },

  // Inline availability badge
  availBadge: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[2],
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[3],
    borderRadius: Radius.lg, borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
  },
  availText: { flex: 1, fontSize: FontSize.sm, letterSpacing: LetterSpacing.snug },

  // Blood grid
  bloodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  bloodCell: {
    width: '23%', paddingVertical: Spacing[4],
    alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.xl, borderCurve: 'continuous', borderWidth: 1.5,
  },
  bloodCellLabel: { fontSize: FontSize.lg, fontWeight: FontWeight.black, letterSpacing: LetterSpacing.tight },

  // Units stepper
  unitsWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: Radius.xl, borderCurve: 'continuous', borderWidth: 1.5,
    height: 80, overflow: 'hidden',
  },
  unitsBtn: { width: 60, height: '100%', alignItems: 'center', justifyContent: 'center' },
  unitsCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  unitsValue: { fontSize: FontSize['2xl'], fontWeight: FontWeight.black, letterSpacing: LetterSpacing.tighter },
  unitsDots: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2, marginBottom: 1 },
  unitsDot: { width: 5, height: 5, borderRadius: 2.5 },
  unitsLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, letterSpacing: LetterSpacing.snug },

  // Preview card
  previewCard: {
    flexDirection: 'row',
    borderRadius: Radius.xl, borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden',
  },
  previewStripe: { width: 4 },
  previewBody: { flex: 1, padding: Spacing[4], gap: Spacing[3] },
  previewTopRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  previewHospital: { fontSize: FontSize.base, fontWeight: FontWeight.black, letterSpacing: LetterSpacing.snug },
  previewAddr: { fontSize: FontSize.xs, marginTop: 2 },
  previewMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },

  // Inline CTA
  ctaInline: { marginTop: Spacing[2], gap: Spacing[3] },
  ctaSummary: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingHorizontal: Spacing[1] },
  ctaSummaryDot: { width: 8, height: 8, borderRadius: 4 },
  ctaSummaryText: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, letterSpacing: LetterSpacing.snug },
  ctaPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: Spacing[2], paddingVertical: 3,
    borderRadius: Radius.pill, borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
  },
  ctaPillDot: { width: 5, height: 5, borderRadius: 2.5 },
  ctaPillText: {
    fontSize: FontSize['2xs'], fontWeight: FontWeight.black,
    letterSpacing: LetterSpacing.snug, textTransform: 'uppercase',
  },
  ctaFooter: {
    textAlign: 'center', paddingHorizontal: Spacing[4],
    lineHeight: FontSize.xs * 1.5,
  },
});
