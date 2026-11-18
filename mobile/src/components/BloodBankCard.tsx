// components/BloodBankCard.tsx
import React from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAppTheme } from '@/stores/themeStore';
import { Elevation, FontSize, FontWeight, Radius, Spacing } from '@/constants/Typography';
import { BloodGroupBadge, Card, Text } from '@/ui';
import type { BloodBank } from '@/services/bloodBanks';

interface BloodBankCardProps {
  facility: BloodBank;
  onRequestHere?: (facility: BloodBank) => void;
}

export function BloodBankCard({ facility, onRequestHere }: BloodBankCardProps) {
  const theme = useAppTheme();

  const handleCall = () => {
    void Haptics.selectionAsync();
    const num = facility.phone || '104';
    void Linking.openURL(`tel:${num}`);
  };

  const handleDirections = () => {
    void Haptics.selectionAsync();
    const url = `https://www.google.com/maps/dir/?api=1&destination=${facility.latitude},${facility.longitude}`;
    void Linking.openURL(url);
  };

  const isBloodBank = facility.type === 'blood_bank';

  return (
    <Card variant="surface" style={[styles.card, Elevation.sm]}>
      {/* Top row: Type indicator & Distance */}
      <View style={styles.topRow}>
        <View style={styles.badgeRow}>
          <View
            style={[
              styles.typePill,
              {
                backgroundColor: isBloodBank ? theme.primary + '18' : theme.info + '18',
                borderColor: isBloodBank ? theme.primary + '40' : theme.info + '40',
              },
            ]}
          >
            <Ionicons
              name={isBloodBank ? 'water' : 'medical'}
              size={12}
              color={isBloodBank ? theme.primary : theme.info}
            />
            <Text
              style={[
                styles.typeText,
                { color: isBloodBank ? theme.primary : theme.info },
              ]}
            >
              {isBloodBank ? 'Certified Blood Bank' : 'Trauma Hospital'}
            </Text>
          </View>

          <View style={[styles.statusPill, { backgroundColor: theme.success + '18' }]}>
            <View style={[styles.dot, { backgroundColor: theme.success }]} />
            <Text style={[styles.statusText, { color: theme.success }]}>Open 24/7</Text>
          </View>
        </View>

        <Text style={[styles.distText, { color: theme.primary }]}>
          {facility.distanceKm} km away
        </Text>
      </View>

      {/* Facility Name & Address */}
      <View style={{ gap: 2 }}>
        <Text variant="title" numberOfLines={1}>{facility.name}</Text>
        <Text variant="caption" tone="muted" numberOfLines={2}>
          {facility.address}
        </Text>
      </View>

      {/* Available Units preview */}
      <View style={{ gap: 4 }}>
        <Text variant="overline" tone="muted">Available Reserves</Text>
        <View style={styles.stockRow}>
          {facility.availableGroups.map((bg) => (
            <BloodGroupBadge key={bg} group={bg} size="sm" variant="soft" />
          ))}
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionRow}>
        <Pressable
          onPress={handleCall}
          style={({ pressed }) => [
            styles.actionBtn,
            { backgroundColor: theme.cardElevated, borderColor: theme.border, opacity: pressed ? 0.8 : 1 },
          ]}
          hitSlop={4}
        >
          <Ionicons name="call" size={15} color={theme.success} />
          <Text variant="labelSm" style={{ color: theme.textPrimary }}>Call</Text>
        </Pressable>

        <Pressable
          onPress={handleDirections}
          style={({ pressed }) => [
            styles.actionBtn,
            { backgroundColor: theme.cardElevated, borderColor: theme.border, opacity: pressed ? 0.8 : 1 },
          ]}
          hitSlop={4}
        >
          <Ionicons name="navigate" size={15} color={theme.info} />
          <Text variant="labelSm" style={{ color: theme.textPrimary }}>Directions</Text>
        </Pressable>

        {onRequestHere && (
          <Pressable
            onPress={() => {
              void Haptics.selectionAsync();
              onRequestHere(facility);
            }}
            style={({ pressed }) => [
              styles.actionBtnPrimary,
              { backgroundColor: theme.primary, opacity: pressed ? 0.9 : 1 },
            ]}
            hitSlop={4}
          >
            <Ionicons name="add-circle" size={16} color={theme.textOnPrimary} />
            <Text variant="labelSm" style={{ color: theme.textOnPrimary, fontWeight: FontWeight.bold }}>
              Request Here
            </Text>
          </Pressable>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing[4],
    gap: Spacing[3],
    borderRadius: Radius.xl,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing[2],
    paddingVertical: 3,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  typeText: {
    fontSize: FontSize['2xs'],
    fontWeight: FontWeight.bold,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing[2],
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: FontSize['2xs'],
    fontWeight: FontWeight.semibold,
  },
  distText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.black,
  },
  stockRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    paddingTop: Spacing[2],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(150,150,150,0.15)',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing[2],
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  actionBtnPrimary: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing[2],
    borderRadius: Radius.lg,
  },
});
