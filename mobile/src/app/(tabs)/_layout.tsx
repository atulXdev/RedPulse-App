// src/app/(tabs)/_layout.tsx
// Standard Expo Router Tabs layout:
// Flush edge-to-edge alignment with Android navigation buttons and iOS home indicators.
// Role-aware visibility gates tabs cleanly without native inset bugs.
import React from 'react';
import { StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/stores/themeStore';
import { useIsDonor } from '@/stores/authStore';

export default function TabsLayout() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const isDonor = useIsDonor();

  // If insets.bottom is 0 (3-button navigation devices), add a small 6px breathing room.
  // If insets.bottom is > 0 (gesture bar / home indicator), use the exact inset.
  const bottomInset = Math.max(insets.bottom, 6);
  const tabHeight = 56 + bottomInset;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.tabInactive,
        tabBarStyle: {
          backgroundColor: theme.tabBar,
          borderTopColor: theme.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: tabHeight,
          paddingBottom: bottomInset,
          paddingTop: 6,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 4,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          href: isDonor ? '/' : null,
          tabBarIcon: ({ color, focused }: any) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="request"
        options={{
          title: 'Request',
          tabBarIcon: ({ color, focused }: any) => (
            <Ionicons name={focused ? 'add-circle' : 'add-circle-outline'} size={24} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="donors"
        options={{
          title: 'Find',
          href: isDonor ? '/donors' : null,
          tabBarIcon: ({ color, focused }: any) => (
            <Ionicons name={focused ? 'search' : 'search-outline'} size={22} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="my-requests"
        options={{
          title: 'Requests',
          tabBarIcon: ({ color, focused }: any) => (
            <Ionicons name={focused ? 'list' : 'list-outline'} size={22} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          href: isDonor ? '/history' : null,
          tabBarIcon: ({ color, focused }: any) => (
            <Ionicons name={focused ? 'heart' : 'heart-outline'} size={22} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Account',
          tabBarIcon: ({ color, focused }: any) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
