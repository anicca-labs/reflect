import { useEffect, useRef, type ReactNode } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  cancelAnimation,
  SlideOutLeft,
  LinearTransition,
} from 'react-native-reanimated';

interface AnimatedEntryProps {
  children: ReactNode;
  index: number;
  animKey: number;
}

const SLIDE_OFFSET = 40;
export const STAGGER_DELAY_MS = 100;
export const ENTER_DURATION_MS = 500;
const EXIT_DURATION_MS = 250;

const AnimatedEntry = ({ children, index, animKey }: AnimatedEntryProps) => {
  const tx = useSharedValue(index % 2 === 0 ? -SLIDE_OFFSET : SLIDE_OFFSET);
  const opacity = useSharedValue(0);
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  // Runs on mount AND whenever animKey flips (screen focus replays the stagger).
  // It must run on mount too — never gated on animKey — or a card that mounts while
  // animKey is still 0 and never receives a focus bump (e.g. the JS bundle reloads
  // while this tab is already focused, so no new focus event fires) would sit at
  // opacity 0 forever: laid out and tappable but invisible. An entrance animation
  // must never be able to hide content permanently.
  useEffect(() => {
    const i = indexRef.current;
    cancelAnimation(tx);
    cancelAnimation(opacity);
    tx.value = i % 2 === 0 ? -SLIDE_OFFSET : SLIDE_OFFSET;
    opacity.value = 0;
    const delay = i * STAGGER_DELAY_MS;
    tx.value = withDelay(delay, withTiming(0, { duration: ENTER_DURATION_MS }));
    opacity.value = withDelay(delay, withTiming(1, { duration: ENTER_DURATION_MS }));
  }, [animKey, tx, opacity]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
    opacity: opacity.value,
  }));

  return (
    // NOTE: Animated.View style prop requires a plain animated style object — no Tamagui equivalent
    <Animated.View
      style={style}
      exiting={SlideOutLeft.duration(EXIT_DURATION_MS)}
      layout={LinearTransition}
    >
      {children}
    </Animated.View>
  );
};

export { AnimatedEntry };
export type { AnimatedEntryProps };
