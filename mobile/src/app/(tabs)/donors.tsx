// Lever: discovery + real-time community resources.
// Tab 1: Compatible Blood Requests filtered by blood group.
// Tab 2: Live Nearby Blood Banks & Emergency Centers from OpenStreetMap Nominatim.
// Modal: Interactive Blood Compatibility Matrix.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAppTheme } from '@/stores/themeStore';
import { useLocation } from '@/hooks/useLocation';
import { useRequests } from '@/queries/requests';
import { BLOOD_GROUPS } from '@/constants/BloodData';
import { Elevation, FontSize, FontWeight, Radius, Spacing, TAB_BAR_HEIGHT } from '@/constants/Typography';
import { Text, RequestCard, EmptyState, type RequestCardData } from '@/ui';
import { fetchNearbyBloodBanks, type BloodBank } from '@/services/bloodBanks';
import { BloodBankCard } from '@/components/BloodBankCard';
import { BloodCompatibilityModal } from '@/components/BloodCompatibilityModal';

type Mode = 'requests' | 'blood_banks';

export default function DonorsScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { location, loading, error, refreshLocation } = useLocation(true);

  const [mode, setMode] = useState<Mode>('requests');
  const [group, setGroup] = useState<string | null>(null);
  const [compatModalVisible, setCompatModalVisible] = useState(false);

  // Blood bank state
  const [bloodBanks, setBloodBanks] = useState<BloodBank[]>([]);
  const [loadingBanks, setLoadingBanks] = useState(false);

  const query = useMemo(
    () => (location ? { lat: location.latitude, lon: location.longitude, radiusKm: 50, bloodGroup: group ?? undefined } : {}),
    [location, group],
  );
  const { data, refetch: refetchRequests, isRefetching: isRefetchingRequests } = useRequests(query, !!location);
  const requests = useMemo(() => ((data?.requests ?? []) as RequestCardData[]), [data]);

  const loadBloodBanks = useCallback(async () => {
    if (!location) return;
    setLoadingBanks(true);
    try {
      const list = await fetchNearbyBloodBanks(location.latitude, location.longitude, 35);
      setBloodBanks(list);
    } finally {
      setLoadingBanks(false);
    }
  }, [location]);

  useEffect(() => {
    if (mode === 'blood_banks' && bloodBanks.length === 0 && location) {
      void loadBloodBanks();
    }
  }, [mode, bloodBanks.length, location, loadBloodBanks]);

  const onRefresh = useCallback(async () => {
    if (mode === 'requests') {
      await refetchRequests();
    } else {
      await loadBloodBanks();
    }
  }, [mode, refetchRequests, loadBloodBanks]);

  const handleRequestHere = useCallback((facility: BloodBank) => {
    const safeAddress = facility.address && facility.address.trim().length >= 2
      ? facility.address.trim()
      : `${facility.name}, Medical Center`;
    router.push({
      pathname: '/(tabs)/request',
      params: {
        hospital: facility.name,
        address: safeAddress,
        lat: String(facility.latitude),
        lon: String(facility.longitude),
      },
    });
  }, [router]);

  const renderRequestItem = useCallback(({ item }: { item: RequestCardData }) => (
    <RequestCard request={item} onPress={() => router.push({ pathname: '/request/[id]', params: { id: item.id } })} />
  ), [router]);

  const renderBankItem = useCallback(({ item }: { item: BloodBank }) => (
    <BloodBankCard facility={item} onRequestHere={handleRequestHere} />
  ), [handleRequestHere]);

  if (error && !location) {
    return (
      <View style={[styles.root, { backgroundColor: theme.background, justifyContent: 'center', paddingTop: insets.top }]}>
        <EmptyState
          icon="location-outline"
          title="Find requests near you"
          body="Share your location to see blood requests and certified blood banks close by."
          actionLabel="Enable location"
          onAction={() => { void refreshLocation(); }}
        />
      </View>
    );
  }

  const bottomPad = insets.bottom + TAB_BAR_HEIGHT + Spacing[4];

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {/* ── Top Header & Action Row ── */}
      <View
        style={{
          paddingTop: insets.top + Spacing[3],
          paddingHorizontal: Spacing[5],
          paddingBottom: Spacing[3],
          gap: Spacing[3],
          backgroundColor: theme.surface,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.border,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing[3] }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text variant="overline" tone="muted" numberOfLines={1}>Discovery • OpenStreetMap</Text>
            <Text variant="headline" numberOfLines={1}>{mode === 'requests' ? 'Find requests' : 'Nearby Blood Banks'}</Text>
          </View>

          {/* Interactive Matrix button */}
          <Pressable
            onPress={() => {
              void Haptics.selectionAsync();
              setCompatModalVisible(true);
            }}
            style={[styles.compatBtn, { backgroundColor: theme.cardElevated, borderColor: theme.border }, Elevation.sm]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Blood compatibility explorer"
          >
            <Ionicons name="git-network-outline" size={15} color={theme.primary} />
            <Text variant="labelSm" style={{ color: theme.primary, fontWeight: FontWeight.bold }}>
              Matrix
            </Text>
          </Pressable>
        </View>

        {/* Mode Segment Bar */}
        <View style={[styles.segmentBar, { backgroundColor: theme.cardElevated, borderColor: theme.border }]}>
          <Pressable
            onPress={() => {
              void Haptics.selectionAsync();
              setMode('requests');
            }}
            style={[
              styles.segmentBtn,
              mode === 'requests' && [styles.segmentBtnActive, { backgroundColor: theme.surface }],
            ]}
          >
            <Ionicons
              name="water"
              size={14}
              color={mode === 'requests' ? theme.primary : theme.textMuted}
            />
            <Text
              style={[
                styles.segmentText,
                { color: mode === 'requests' ? theme.textPrimary : theme.textMuted },
                mode === 'requests' && { fontWeight: FontWeight.bold },
              ]}
            >
              Patient Requests
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              void Haptics.selectionAsync();
              setMode('blood_banks');
            }}
            style={[
              styles.segmentBtn,
              mode === 'blood_banks' && [styles.segmentBtnActive, { backgroundColor: theme.surface }],
            ]}
          >
            <Ionicons
              name="medical"
              size={14}
              color={mode === 'blood_banks' ? theme.primary : theme.textMuted}
            />
            <Text
              style={[
                styles.segmentText,
                { color: mode === 'blood_banks' ? theme.textPrimary : theme.textMuted },
                mode === 'blood_banks' && { fontWeight: FontWeight.bold },
              ]}
            >
              Blood Banks (OSM)
            </Text>
          </Pressable>
        </View>

        {/* Filter chips (only in Requests mode) */}
        {mode === 'requests' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing[2] }}>
            <FilterChip label="All" active={group === null} onPress={() => { void Haptics.selectionAsync(); setGroup(null); }} />
            {BLOOD_GROUPS.map((bg) => (
              <FilterChip key={bg} label={bg} active={group === bg} onPress={() => { void Haptics.selectionAsync(); setGroup(bg); }} />
            ))}
          </ScrollView>
        )}
      </View>

      {/* ── Content Area ── */}
      {mode === 'requests' ? (
        <FlashList
          data={requests}
          keyExtractor={(item) => item.id}
          renderItem={renderRequestItem}
          ItemSeparatorComponent={() => <View style={{ height: Spacing[3] }} />}
          contentContainerStyle={{
            paddingHorizontal: Spacing[5],
            paddingTop: Spacing[4],
            paddingBottom: bottomPad,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetchingRequests}
              onRefresh={() => { void onRefresh(); }}
              tintColor={theme.primary}
            />
          }
          ListEmptyComponent={
            !location || loading ? null : (
              <EmptyState
                icon="search-outline"
                title={group ? `No ${group} requests nearby` : 'All quiet nearby'}
                body={group ? 'Widen the search by clearing the filter.' : 'We will ping you the moment a compatible request lands close by.'}
                actionLabel={group ? 'Clear filter' : undefined}
                onAction={group ? () => setGroup(null) : undefined}
              />
            )
          }
        />
      ) : (
        <View style={{ flex: 1 }}>
          {loadingBanks && bloodBanks.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing[3] }}>
              <ActivityIndicator color={theme.primary} size="large" />
              <Text variant="caption" tone="muted">Scanning OpenStreetMap for nearby blood banks...</Text>
            </View>
          ) : (
            <FlashList
              data={bloodBanks}
              keyExtractor={(item) => item.id}
              renderItem={renderBankItem}
              ItemSeparatorComponent={() => <View style={{ height: Spacing[3] }} />}
              contentContainerStyle={{
                paddingHorizontal: Spacing[5],
                paddingTop: Spacing[4],
                paddingBottom: bottomPad,
              }}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={loadingBanks}
                  onRefresh={() => { void onRefresh(); }}
                  tintColor={theme.primary}
                />
              }
              ListEmptyComponent={
                <EmptyState
                  icon="medical-outline"
                  title="No facilities found"
                  body="Pull to refresh or check connection."
                  actionLabel="Retry"
                  onAction={() => { void loadBloodBanks(); }}
                />
              }
            />
          )}
        </View>
      )}

      {/* ── Interactive Compatibility Matrix Modal ── */}
      <BloodCompatibilityModal
        visible={compatModalVisible}
        onClose={() => setCompatModalVisible(false)}
        initialGroup={(group as any) || 'O+'}
      />
    </View>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={{
        paddingHorizontal: Spacing[4],
        paddingVertical: Spacing[2],
        borderRadius: Radius.pill,
        borderCurve: 'continuous',
        borderWidth: 1.5,
        backgroundColor: active ? theme.primary : theme.surface,
        borderColor: active ? theme.primary : theme.border,
      }}
    >
      <Text variant="labelSm" style={{ color: active ? theme.textOnPrimary : theme.textPrimary }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  compatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderRadius: Radius.pill,
    borderWidth: 1,
    flexShrink: 0,
  },
  segmentBar: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
  },
  segmentBtnActive: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  segmentText: {
    fontSize: FontSize.xs,
  },
});
