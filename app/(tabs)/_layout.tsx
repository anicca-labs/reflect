import { Tabs } from 'expo-router'
import React from 'react'
import { HapticTab, BaseIcon } from '@atoms'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from 'tamagui'
import { sizes } from '@theme'
import { useLingui } from '@lingui/react/macro'

export default function TabLayout() {
  const theme = useTheme()
  const { t } = useLingui()

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
          title: t`Journal`,
          tabBarIcon: ({ color }) => <BaseIcon iconName="iconPen" width={sizes.lg} height={sizes.lg} color={color} />,
        }}
      />
      <Tabs.Screen
        name="reflections"
        options={{
          title: t`Reflections`,
          tabBarIcon: ({ color }) => <BaseIcon iconName="iconBook" width={sizes.lg} height={sizes.lg} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t`Settings`,
          tabBarIcon: ({ color }) => <Ionicons name="person-outline" size={sizes.lg} color={color} />,
        }}
      />
    </Tabs>
  )
}
