import { BaseIcon } from "@atoms";
import { Ionicons } from "@expo/vector-icons";
import { LabelMd } from "@fonts";
import { BaseTouchable } from "@ksairi-org/ui-touchables";
import { useLingui } from "@lingui/react/macro";
import {
  createMaterialTopTabNavigator,
  type MaterialTopTabBarProps,
} from "@react-navigation/material-top-tabs";
import { sizes } from "@theme";
import * as Haptics from "expo-haptics";
import { withLayoutContext } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { XStack, YStack, useTheme } from "tamagui";

const { Navigator } = createMaterialTopTabNavigator();
const MaterialTopTabs = withLayoutContext(Navigator);

const TabBar = ({ state, descriptors, navigation }: MaterialTopTabBarProps) => {
  const theme = useTheme();
  const { bottom } = useSafeAreaInsets();

  return (
    <XStack bg="$color1" borderTopWidth={1} borderTopColor="$borderColor" paddingBottom={bottom}>
      {state.routes.map((route, idx) => {
        const { options } = descriptors[route.key];
        const isActive = state.index === idx;
        const color = isActive ? "$accentBackground" : "$color8";
        const nativeColor = isActive ? theme.accentBackground.val : theme.color8.val;

        const onPress = () => {
          if (Platform.OS === "ios") {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (state.index !== idx && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <BaseTouchable key={route.key} flex={1} onPress={onPress}>
            <YStack items="center" justify="center" py="$2" gap="$1">
              {options.tabBarIcon?.({ focused: isActive, color: nativeColor }) ?? null}
              <LabelMd color={color}>{String(options.title ?? route.name)}</LabelMd>
            </YStack>
          </BaseTouchable>
        );
      })}
    </XStack>
  );
};

const TabLayout = () => {
  const { t } = useLingui();

  return (
    <MaterialTopTabs
      tabBar={(props) => <TabBar {...props} />}
      tabBarPosition="bottom"
      screenOptions={{
        swipeEnabled: true,
        animationEnabled: true,
        lazy: false,
      }}
    >
      <MaterialTopTabs.Screen
        name="index"
        options={{
          title: t`Journal`,
          tabBarIcon: ({ color }: { color: string }) => (
            <BaseIcon iconName="iconPen" width={sizes.lg} height={sizes.lg} color={color} />
          ),
        }}
      />
      <MaterialTopTabs.Screen
        name="reflections"
        options={{
          title: t`Reflections`,
          tabBarIcon: ({ color }: { color: string }) => (
            <BaseIcon iconName="iconBook" width={sizes.lg} height={sizes.lg} color={color} />
          ),
        }}
      />
      <MaterialTopTabs.Screen
        name="settings"
        options={{
          title: t`Settings`,
          tabBarIcon: ({ color }: { color: string }) => (
            <Ionicons name="person-outline" size={sizes.lg} color={color} />
          ),
        }}
      />
    </MaterialTopTabs>
  );
};

export default TabLayout;
