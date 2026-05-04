import { Tabs } from 'expo-router'
import React from 'react'
import { HapticTab , IconSymbol } from '@atoms'
import { useTheme } from 'tamagui'

export default function TabLayout() {
  const theme = useTheme()

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.accentBackground.val,
        tabBarInactiveTintColor: theme.color8.val,
        tabBarStyle: {
          backgroundColor: theme.color1.val,
          borderTopColor: theme.borderColor.val,
        },
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Journal',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="pencil.and.outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="reflections"
        options={{
          title: 'Reflections',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="books.vertical.fill" color={color} />,
        }}
      />
    </Tabs>
  )
}
