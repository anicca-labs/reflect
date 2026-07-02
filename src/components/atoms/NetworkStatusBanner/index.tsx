import { useEffect, useRef, useState } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YStack } from 'tamagui';
import { Trans } from '@lingui/react/macro';
import { LabelMd } from '@fonts';
import { subscribeToNetworkStatus } from '@/src/services/network';

// No semantic red/green in this project's warm palette (see EnvBadge), so the
// status colors are defined here. Muted enough to sit with the brand, clear
// enough to read instantly as "offline" / "back online".
const OFFLINE_COLOR = '#C0392B'; // warm red
const ONLINE_COLOR = '#2E7D52'; // muted green

const BANNER_CONTENT_HEIGHT = 30; // the coloured strip below the status bar
const SLIDE_DURATION_MS = 280;
// How long the green "Back online" strip lingers before it slides back up.
const RECONNECTED_VISIBLE_MS = 1500;
// Below EnvBadge (9999) so the staging badge stays legible over the strip.
const Z_INDEX_BANNER = 9990;

type Mode = 'hidden' | 'offline' | 'reconnected';

/**
 * A top strip that animates down when the device goes offline (red, persistent)
 * and, on reconnect, briefly shows a green "Back online" confirmation before
 * sliding back up. Mounted once, high in the tree. Purely informational —
 * pointerEvents="none" so it never intercepts touches.
 */
const NetworkStatusBanner = () => {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('hidden');
  const wasOnline = useRef<boolean | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearHideTimer = () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
    };

    const unsubscribe = subscribeToNetworkStatus((online) => {
      const prev = wasOnline.current;
      wasOnline.current = online;

      if (!online) {
        // Offline: show the red strip and keep it until we're back.
        clearHideTimer();
        setMode('offline');
      } else if (prev === false) {
        // Reconnected after being offline: green confirmation, then auto-hide.
        // (prev === false gates out the normal online cold start, which must
        // show nothing.)
        clearHideTimer();
        setMode('reconnected');
        hideTimer.current = setTimeout(() => setMode('hidden'), RECONNECTED_VISIBLE_MS);
      }
    });

    return () => {
      unsubscribe();
      clearHideTimer();
    };
  }, []);

  const visible = mode !== 'hidden';
  // The strip fills from the very top (under the status bar) down past the safe
  // area, so its content sits clear of the notch/status bar.
  const totalHeight = BANNER_CONTENT_HEIGHT + insets.top;

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, { duration: SLIDE_DURATION_MS });
  }, [visible, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (progress.value - 1) * totalHeight }],
  }));

  // Keep the green while sliding away after a reconnect (mode flips to 'hidden'
  // for the exit animation, but the colour should stay green, not flash red).
  const backgroundColor = mode === 'offline' ? OFFLINE_COLOR : ONLINE_COLOR;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: totalHeight,
          paddingTop: insets.top,
          backgroundColor,
          zIndex: Z_INDEX_BANNER,
        },
        animatedStyle,
      ]}
    >
      <YStack flex={1} items="center" justify="center">
        <LabelMd color="$white">
          {mode === 'offline' ? <Trans>No connection</Trans> : <Trans>Back online</Trans>}
        </LabelMd>
      </YStack>
    </Animated.View>
  );
};

export { NetworkStatusBanner };
