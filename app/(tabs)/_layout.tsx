import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  // Chiều cao "nội dung" mong muốn của tab bar (icon + label), chưa tính safe area
  const CONTENT_HEIGHT = 62;

  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          height: CONTENT_HEIGHT + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 6,
          backgroundColor: '#ffffff',
          borderTopWidth: 0,
          elevation: 5,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 3,
        },
        tabBarItemStyle: {
          justifyContent: 'center',
          alignItems: 'center',
        },
        tabBarIconStyle: {
          marginBottom: 0,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 0,
        },

        tabBarActiveTintColor: '#1F5CA9', // Màu CTU Navy Blue
        tabBarInactiveTintColor: '#000000',

        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      {/* 1. Màn hình Giám sát */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Giám sát',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              size={24}
              name={focused ? 'videocam' : 'videocam-outline'}
              color={color}
            />
          ),
        }}
      />

      {/* 2. Màn hình Thống kê */}
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Thống kê',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              size={24}
              name={focused ? 'stats-chart' : 'stats-chart-outline'}
              color={color}
            />
          ),
        }}
      />

      {/* 4. Màn hình Cài đặt */}
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Cài đặt',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              size={24}
              name={focused ? 'settings' : 'settings-outline'}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}