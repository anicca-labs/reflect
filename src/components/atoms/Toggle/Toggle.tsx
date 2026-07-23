import { useEffect } from 'react';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from 'tamagui';
import { BaseTouchable } from '@anicca-labs/ui-touchables';

const TRACK_WIDTH = 44;
const TRACK_HEIGHT = 26;
const THUMB_SIZE = 20;
const PADDING = 3;
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - PADDING * 2;
const DURATION = 180;
const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

type ToggleProps = {
  value: boolean;
  onPress: () => void;
  disabled?: boolean;
  // Dims the whole control (e.g. when the toggle is unavailable).
  opacity?: number;
};

// Animated on/off switch: the thumb slides and the track cross-fades between the
// subtle and accent colors, instead of snapping. Shared by every Settings toggle.
const Toggle = ({ value, onPress, disabled = false, opacity = 1 }: ToggleProps) => {
  const theme = useTheme();
  const offColor = theme['surface-subtle']?.val ?? '#e5e5e5';
  const onColor = theme.accentBackground?.val ?? '#000000';
  const thumbColor = theme.white?.val ?? '#ffffff';

  const progress = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, {
      duration: DURATION,
      easing: Easing.out(Easing.cubic),
    });
  }, [value, progress]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [offColor, onColor]),
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * THUMB_TRAVEL }],
  }));

  return (
    <BaseTouchable onPress={onPress} disabled={disabled} opacity={opacity} hitSlop={HIT_SLOP}>
      <Animated.View
        style={[
          {
            width: TRACK_WIDTH,
            height: TRACK_HEIGHT,
            borderRadius: TRACK_HEIGHT / 2,
            justifyContent: 'center',
            paddingHorizontal: PADDING,
          },
          trackStyle,
        ]}
      >
        <Animated.View
          style={[
            {
              width: THUMB_SIZE,
              height: THUMB_SIZE,
              borderRadius: THUMB_SIZE / 2,
              backgroundColor: thumbColor,
            },
            thumbStyle,
          ]}
        />
      </Animated.View>
    </BaseTouchable>
  );
};

export { Toggle };
