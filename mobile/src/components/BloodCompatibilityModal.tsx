// components/BloodCompatibilityModal.tsx
// Complete Blood Compatibility Matrix & Interactive Explorer for RedPulse.
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAppTheme } from '@/stores/themeStore';
import {
  BLOOD_GROUPS,
  COMPATIBILITY_MAP,
  DONOR_FOR_RECIPIENT,
  type BloodGroup,
} from '@/constants/BloodData';
import { FontSize, FontWeight, Radius, Spacing } from '@/constants/Typography';
import { BloodGroupBadge, Text } from '@/ui';

// Ordered display list matching the standard transfusion reference
const DISPLAY_ORDER: BloodGroup[] = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];

const GROUP_TRAITS: Record<BloodGroup, { title: string; desc: string; icon: keyof typeof Ionicons.glyphMap }> = {
  'O-':  { title: 'Universal Red Cell Donor', desc: 'Can donate to EVERY blood group. Essential in emergency rooms and trauma care when typing is impossible.', icon: 'globe-outline' },
  'O+':  { title: 'Most In-Demand Blood Type', desc: 'The most common blood group. Over 40% of patients can safely receive O+ red cells.', icon: 'flame-outline' },
  'A-':  { title: 'Rare Universal-A Donor', desc: 'Can donate red cells to all A and AB patients. High priority for pediatric surgery.', icon: 'sparkles-outline' },
  'A+':  { title: 'Crucial Plasma & Red Cell Match', desc: 'Can donate to A+ and AB+ patients, covering over 35% of the general population.', icon: 'water-outline' },
  'B-':  { title: 'Extremely Rare Blood (< 2%)', desc: 'Can donate to B-, B+, AB-, and AB+ patients. Continual shortage in trauma banks.', icon: 'alert-circle-outline' },
  'B+':  { title: 'Key Universal Recipient Match', desc: 'Can receive from O and B donors. Very high demand for scheduled surgeries.', icon: 'pulse-outline' },
  'AB-': { title: 'Rarest Blood Group (< 1%)', desc: 'Universal plasma donor. Can receive from all Rh-negative donors in emergencies.', icon: 'shield-checkmark-outline' },
  'AB+': { title: 'Universal Red Cell Recipient', desc: 'Can safely receive red blood cells from ALL groups. Universal emergency recipient.', icon: 'infinite-outline' },
};

// Formatted table summary text for quick reference
const TABLE_DATA: { group: BloodGroup; donateTo: string; receiveFrom: string }[] = [
  { group: 'O-',  donateTo: 'Everyone',          receiveFrom: 'O-' },
  { group: 'O+',  donateTo: 'O+, A+, B+, AB+',   receiveFrom: 'O-, O+' },
  { group: 'A-',  donateTo: 'A-, A+, AB-, AB+',  receiveFrom: 'O-, A-' },
  { group: 'A+',  donateTo: 'A+, AB+',           receiveFrom: 'O-, O+, A-, A+' },
  { group: 'B-',  donateTo: 'B-, B+, AB-, AB+',  receiveFrom: 'O-, B-' },
  { group: 'B+',  donateTo: 'B+, AB+',           receiveFrom: 'O-, O+, B-, B+' },
  { group: 'AB-', donateTo: 'AB-, AB+',          receiveFrom: 'O-, A-, B-, AB-' },
  { group: 'AB+', donateTo: 'AB+',               receiveFrom: 'All groups' },
];

interface BloodCompatibilityModalProps {
  visible: boolean;
  onClose: () => void;
  initialGroup?: BloodGroup;
}

export function BloodCompatibilityModal({
  visible,
  onClose,
  initialGroup = 'O+',
}: BloodCompatibilityModalProps) {
  const theme = useAppTheme();
  const [activeTab, setActiveTab] = useState<'interactive' | 'matrix'>('interactive');
  const [selectedGroup, setSelectedGroup] = useState<BloodGroup>(initialGroup);

  // Biological ground-truth:
  // COMPATIBILITY_MAP[g] => who donor 'g' can DONATE TO
  // DONOR_FOR_RECIPIENT[g] => who recipient 'g' can RECEIVE FROM
  const canDonateTo = COMPATIBILITY_MAP[selectedGroup] ?? [];
  const canReceiveFrom = DONOR_FOR_RECIPIENT[selectedGroup] ?? [];
  const trait = GROUP_TRAITS[selectedGroup];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <View style={{ flex: 1 }}>
              <Text variant="overline" tone="brand">RedPulse Medical Reference</Text>
              <Text variant="headline">Blood Compatibility</Text>
            </View>
            <Pressable
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: theme.cardElevated }]}
              hitSlop={8}
            >
              <Ionicons name="close" size={20} color={theme.textPrimary} />
            </Pressable>
          </View>

          {/* Segmented Mode Selector */}
          <View style={[styles.tabBar, { backgroundColor: theme.background }]}>
            <Pressable
              onPress={() => {
                void Haptics.selectionAsync();
                setActiveTab('interactive');
              }}
              style={[
                styles.tabBtn,
                activeTab === 'interactive' && {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                },
              ]}
            >
              <Ionicons
                name="color-wand-outline"
                size={14}
                color={activeTab === 'interactive' ? theme.primary : theme.textMuted}
              />
              <Text
                variant="labelSm"
                style={{
                  color: activeTab === 'interactive' ? theme.primary : theme.textTertiary,
                  fontWeight: activeTab === 'interactive' ? FontWeight.bold : FontWeight.medium,
                }}
              >
                Interactive Matcher
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                void Haptics.selectionAsync();
                setActiveTab('matrix');
              }}
              style={[
                styles.tabBtn,
                activeTab === 'matrix' && {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                },
              ]}
            >
              <Ionicons
                name="grid-outline"
                size={14}
                color={activeTab === 'matrix' ? theme.primary : theme.textMuted}
              />
              <Text
                variant="labelSm"
                style={{
                  color: activeTab === 'matrix' ? theme.primary : theme.textTertiary,
                  fontWeight: activeTab === 'matrix' ? FontWeight.bold : FontWeight.medium,
                }}
              >
                Complete Matrix
              </Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: Spacing[5], gap: Spacing[4] }}>
            {activeTab === 'interactive' ? (
              <>
                {/* Blood Group Selector */}
                <View style={{ gap: Spacing[2] }}>
                  <Text variant="caption" tone="muted">Tap a blood group to view biological matching:</Text>
                  <View style={styles.grid}>
                    {DISPLAY_ORDER.map((g) => {
                      const active = g === selectedGroup;
                      return (
                        <Pressable
                          key={g}
                          onPress={() => {
                            void Haptics.selectionAsync();
                            setSelectedGroup(g);
                          }}
                          style={[
                            styles.groupCell,
                            {
                              backgroundColor: active ? theme.primary : theme.cardElevated,
                              borderColor: active ? theme.primary : theme.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.groupCellText,
                              { color: active ? theme.textOnPrimary : theme.textPrimary },
                            ]}
                          >
                            {g}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Trait Card */}
                <View style={[styles.traitCard, { backgroundColor: theme.cardElevated, borderColor: theme.border }]}>
                  <View style={[styles.traitIconWrap, { backgroundColor: theme.primary + '20' }]}>
                    <Ionicons name={trait.icon} size={22} color={theme.primary} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.traitTitle, { color: theme.primary }]}>{trait.title}</Text>
                    <Text variant="bodySm" tone="muted">{trait.desc}</Text>
                  </View>
                </View>

                {/* Can Donate To Section */}
                <View style={[styles.matchSection, { backgroundColor: theme.cardElevated, borderColor: theme.border }]}>
                  <View style={styles.matchHeader}>
                    <Ionicons name="arrow-up-circle" size={20} color={theme.success} />
                    <View style={{ flex: 1 }}>
                      <Text variant="label" style={{ fontWeight: FontWeight.black }}>
                        Can Donate To
                      </Text>
                      <Text variant="caption" tone="muted">
                        {selectedGroup === 'O-' ? 'Universal Donor (Everyone)' : `${canDonateTo.length} compatible group(s)`}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.badgeRow}>
                    {DISPLAY_ORDER.map((g) => {
                      const compatible = canDonateTo.includes(g);
                      return (
                        <View key={g} style={{ opacity: compatible ? 1 : 0.22 }}>
                          <BloodGroupBadge group={g} size="sm" variant={compatible ? 'solid' : 'outline'} />
                        </View>
                      );
                    })}
                  </View>
                </View>

                {/* Can Receive From Section */}
                <View style={[styles.matchSection, { backgroundColor: theme.cardElevated, borderColor: theme.border }]}>
                  <View style={styles.matchHeader}>
                    <Ionicons name="arrow-down-circle" size={20} color={theme.info} />
                    <View style={{ flex: 1 }}>
                      <Text variant="label" style={{ fontWeight: FontWeight.black }}>
                        Can Receive From
                      </Text>
                      <Text variant="caption" tone="muted">
                        {selectedGroup === 'AB+' ? 'Universal Recipient (All groups)' : `${canReceiveFrom.length} compatible group(s)`}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.badgeRow}>
                    {DISPLAY_ORDER.map((g) => {
                      const compatible = canReceiveFrom.includes(g);
                      return (
                        <View key={g} style={{ opacity: compatible ? 1 : 0.22 }}>
                          <BloodGroupBadge group={g} size="sm" variant={compatible ? 'solid' : 'outline'} />
                        </View>
                      );
                    })}
                  </View>
                </View>
              </>
            ) : (
              /* Complete Matrix Table View */
              <View style={{ gap: Spacing[3] }}>
                <View style={[styles.matrixTable, { backgroundColor: theme.cardElevated, borderColor: theme.border }]}>
                  {/* Table Header */}
                  <View style={[styles.tableRow, styles.tableHeaderRow, { borderBottomColor: theme.border }]}>
                    <Text variant="labelSm" style={[styles.colGroup, { color: theme.primary, fontWeight: FontWeight.black }]}>
                      Blood Group
                    </Text>
                    <Text variant="labelSm" style={[styles.colDonate, { color: theme.success, fontWeight: FontWeight.black }]}>
                      Can Donate To
                    </Text>
                    <Text variant="labelSm" style={[styles.colReceive, { color: theme.info, fontWeight: FontWeight.black }]}>
                      Can Receive From
                    </Text>
                  </View>

                  {/* Table Rows */}
                  {TABLE_DATA.map((row, idx) => {
                    const isLast = idx === TABLE_DATA.length - 1;
                    return (
                      <Pressable
                        key={row.group}
                        onPress={() => {
                          void Haptics.selectionAsync();
                          setSelectedGroup(row.group);
                          setActiveTab('interactive');
                        }}
                        style={[
                          styles.tableRow,
                          !isLast && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth },
                        ]}
                      >
                        <View style={styles.colGroup}>
                          <BloodGroupBadge group={row.group} size="sm" variant="solid" />
                        </View>
                        <View style={styles.colDonate}>
                          <Text
                            variant="bodySm"
                            style={{
                              color: row.donateTo === 'Everyone' ? theme.success : theme.textPrimary,
                              fontWeight: row.donateTo === 'Everyone' ? FontWeight.bold : FontWeight.medium,
                            }}
                          >
                            {row.donateTo}
                          </Text>
                        </View>
                        <View style={styles.colReceive}>
                          <Text
                            variant="bodySm"
                            style={{
                              color: row.receiveFrom === 'All groups' ? theme.info : theme.textPrimary,
                              fontWeight: row.receiveFrom === 'All groups' ? FontWeight.bold : FontWeight.medium,
                            }}
                          >
                            {row.receiveFrom}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>

                <Text variant="caption" tone="muted" style={{ textAlign: 'center', marginTop: Spacing[1] }}>
                  Tap any row to inspect biological match in the interactive simulator
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  container: {
    maxHeight: '90%',
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[4],
    paddingBottom: Spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: Spacing[5],
    marginTop: Spacing[3],
    padding: 3,
    borderRadius: Radius.pill,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    paddingVertical: Spacing[2],
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  groupCell: {
    width: '23%',
    paddingVertical: Spacing[3],
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  groupCellText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.black,
  },
  traitCard: {
    flexDirection: 'row',
    padding: Spacing[4],
    borderRadius: Radius.xl,
    borderWidth: 1,
    gap: Spacing[3],
    alignItems: 'center',
  },
  traitIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  traitTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.black,
  },
  matchSection: {
    padding: Spacing[4],
    borderRadius: Radius.xl,
    borderWidth: 1,
    gap: Spacing[3],
  },
  matchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  matrixTable: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[4],
  },
  tableHeaderRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing[2] + 2,
  },
  colGroup: {
    width: 80,
  },
  colDonate: {
    flex: 1,
    paddingRight: Spacing[2],
  },
  colReceive: {
    flex: 1,
  },
});
