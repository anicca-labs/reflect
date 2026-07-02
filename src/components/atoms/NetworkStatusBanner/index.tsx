import { useEffect, useRef, useState } from 'react';
import Animated, { withTiming, type EntryExitAnimationFunction } from 'react-native-reanimated';
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
 * A top strip that slides down when the device goes offline (red, persistent)
 * and, on reconnect, briefly shows a green "Back online" confirmation before
 * sliding back up. Purely informational — pointerEvents="none" so it never
 * intercepts touches.
 *
 * IMPORTANT: it renders `null` while online (the common case) instead of sitting
 * off-screen mounted. A persistent animated view at the root was reparented by
 * Fabric when the view tree re-mounted on a navigation/activity transition (e.g.
 * "Continue without account" or returning from Google Sign-In), crashing with
 * "child already has a parent" (Sentry REFLECT-B). Keeping the view out of the
 * tree unless it's actually needed removes that surface — the enter/exit
 * animations then only ever run on a network change, never during navigation.
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
        // (prev === false gates out the normal online cold start, which shows
        // nothing.)
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

  // Absent from the view tree entirely while online — see the note above.
  if (mode === 'hidden') return null;

  // The strip fills from the very top (under the status bar) down past the safe
  // area, so its content sits clear of the notch/status bar.
  const totalHeight = BANNER_CONTENT_HEIGHT + insets.top;
  // Keep the green while sliding away after a reconnect (mode is 'reconnected'
  // during the exit, so the colour stays green rather than flashing red).
  const backgroundColor = mode === 'offline' ? OFFLINE_COLOR : ONLINE_COLOR;

  // Slide exactly the banner's own height (the built-in Slide presets travel a
  // full window height, which makes a 30px strip snap in only at the very end).
  const entering: EntryExitAnimationFunction = () => {
    'worklet';
    return {
      initialValues: { transform: [{ translateY: -totalHeight }] },
      animations: { transform: [{ translateY: withTiming(0, { duration: SLIDE_DURATION_MS }) }] },
    };
  };
  const exiting: EntryExitAnimationFunction = () => {
    'worklet';
    return {
      initialValues: { transform: [{ translateY: 0 }] },
      animations: {
        transform: [{ translateY: withTiming(-totalHeight, { duration: SLIDE_DURATION_MS }) }],
      },
    };
  };

  return (
    <Animated.View
      entering={entering}
      exiting={exiting}
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: totalHeight,
        paddingTop: insets.top,
        backgroundColor,
        zIndex: Z_INDEX_BANNER,
      }}
    >
      <YStack flex={1} items="center" justify="center" px="$4">
        {/* numberOfLines={1}: with larger font-scaling "Back online" can wrap to a
            second line, which the short strip then clips — showing just "Back".
            Pin it to one line. */}
        <LabelMd color="$white" numberOfLines={1}>
          {mode === 'offline' ? <Trans>No connection</Trans> : <Trans>Back online</Trans>}
        </LabelMd>
      </YStack>
    </Animated.View>
  );
};

export { NetworkStatusBanner };
