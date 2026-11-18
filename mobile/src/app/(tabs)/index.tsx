// Lever: scent of urgency (critical pinned first) + Fitts's Law on Accept +
// identity ("your blood, near you, now"). Every cell memoized, callbacks stable.
import React, { useCallback, useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAppTheme } from '@/stores/themeStore';
import { useAuth } from '@/stores/authStore';
import { useToast } from '@/stores/toastStore';
import { useLocation } from '@/hooks/useLocation';
import { useRequests } from '@/queries/requests';
import { useAcceptRequest, useDeclineRequest } from '@/queries/donations';
import { useCommunityStats } from '@/queries/stats';
import { COMPATIBILITY_MAP, type BloodGroup } from '@/constants/BloodData';
import { Spacing, TAB_BAR_HEIGHT } from '@/constants/Typography';
import { Text, StatsBanner, RequestCard, EmptyState, type RequestCardData } from '@/ui';

const URGENCY_RANK: Record<string, number> = { critical: 0, urgent: 1, standard: 2 };

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function HomeScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const toast = useToast();
  const { location } = useLocation(true);
  const stats = useCommunityStats();
  const acceptM = useAcceptRequest();
  const declineM = useDeclineRequest();

  const query = useMemo(
    () => (location ? { lat: location.latitude, lon: location.longitude, radiusKm: 50 } : {}),
    [location],
  );
  const { data, refetch, isRefetching } = useRequests(query, !!location);

  const canDonateTo = profile?.blood_group ? COMPATIBILITY_MAP[profile.blood_group as BloodGroup] ?? [] : [];
  const compatible = ((data?.requests ?? []) as RequestCardData[])
    .filter((r) => canDonateTo.includes(r.blood_group as BloodGroup))
    .sort((a, b) => (URGENCY_RANK[a.urgency] ?? 3) - (URGENCY_RANK[b.urgency] ?? 3));

  const onAccept = useCallback((id: string) => {
    acceptM.mutate(id, {
      onSuccess: () => toast.success("You're on the way", { description: 'Head to the hospital as soon as you can.' }),
      onError: (e) => toast.error("Couldn't accept", { description: e instanceof Error ? e.message : 'Check your connection and tap again.' }),
    });
  }, [acceptM, toast]);

  const onDecline = useCallback((id: string) => { declineM.mutate(id); }, [declineM]);

  const renderItem = useCallback(({ item }: { item: RequestCardData }) => (
    <RequestCard
      request={item}
      onPress={() => router.push({ pathname: '/request/[id]', params: { id: item.id } })}
      showActions
      onAccept={() => onAccept(item.id)}
      onDecline={() => onDecline(item.id)}
      accepting={acceptM.isPending && acceptM.variables === item.id}
    />
  ), [router, onAccept, onDecline, acceptM.isPending, acceptM.variables]);

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there';
  const s = stats.data as { total_donations?: number; active_donors?: number; lives_helped?: number } | undefined;

  // bottomPad accounts for actual device bottom inset + tab bar on any screen size.
  const bottomPad = insets.bottom + TAB_BAR_HEIGHT + Spacing[4];

  // ── App bar ────────────────────────────────────────────────────────────────
  const AppBar = (
    <View
      style={{
        paddingTop: insets.top + Spacing[2],
        paddingBottom: Spacing[2],
        paddingHorizontal: Spacing[5],
        backgroundColor: theme.background,
      }}
    >
      <Text variant="overline" tone="muted">Home</Text>
    </View>
  );

  // ── Top content (greeting + stats) always rendered ────────────────────────
  const TopContent = (
    <View style={{ gap: Spacing[5], paddingHorizontal: Spacing[5], paddingTop: Spacing[4] }}>
      <View style={{ gap: 2 }}>
        <Text variant="overline" tone="muted">{greeting()}</Text>
        <Text variant="headline">{firstName}</Text>
      </View>
      <StatsBanner
        donations={s?.total_donations ?? 0}
        donors={s?.active_donors ?? 0}
        livesHelped={s?.lives_helped ?? 0}
        loading={stats.isLoading}
      />
    </View>
  );

  // ── Empty path: ScrollView that fills the screen properly ─────────────────
  if (compatible.length === 0) {
    return (
      <View style={[styles.root, { backgroundColor: theme.background }]}>
        {AppBar}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: bottomPad }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => { void refetch(); }}
              tintColor={theme.primary}
            />
          }
        >
          {TopContent}
          {/* flex: 1 on this inner View + flexGrow: 1 on contentContainerStyle
              = the empty state always occupies the remaining screen space and
              the button sits just above the tab bar on EVERY screen size. */}
          {location ? (
            <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: Spacing[5], paddingTop: Spacing[8] }}>
              <EmptyState
                brand
                title="All quiet for now"
                body="We will ping you the moment a compatible request lands near you. Keep your availability on."
                actionLabel="Update availability"
                onAction={() => router.push('/(tabs)/profile')}
              />
            </View>
          ) : null}
        </ScrollView>
      </View>
    );
  }

  // ── Data path: FlashList ───────────────────────────────────────────────────
  const Header = (
    <View style={{ gap: Spacing[5], marginBottom: Spacing[5] }}>
      <View style={{ gap: 2 }}>
        <Text variant="overline" tone="muted">{greeting()}</Text>
        <Text variant="headline">{firstName}</Text>
      </View>
      <StatsBanner
        donations={s?.total_donations ?? 0}
        donors={s?.active_donors ?? 0}
        livesHelped={s?.lives_helped ?? 0}
        loading={stats.isLoading}
      />
      <Text variant="overline" tone="muted" style={{ marginLeft: Spacing[2] }}>Compatible requests near you</Text>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {AppBar}
      <FlashList
        data={compatible}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={Header}
        ItemSeparatorComponent={() => <View style={{ height: Spacing[3] }} />}
        contentContainerStyle={{
          paddingHorizontal: Spacing[5],
          paddingTop: Spacing[4],
          paddingBottom: bottomPad,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => { void refetch(); }}
            tintColor={theme.primary}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
