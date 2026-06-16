import {
  useRef,
  useEffect,
  useCallback,
  useState,
  useImperativeHandle,
  type ReactNode,
  type Ref,
} from 'react';
import { Alert } from 'react-native';
import { useLingui } from '@lingui/react/macro';
import { YStack } from 'tamagui';
import { BaseTouchable } from '@ksairi-org/ui-touchables';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withTiming,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { logJournalEntryDeleted } from '@analytics';
import { useSwipeableStore } from '@/src/stores';
import { STAGGER_DELAY_MS, ENTER_DURATION_MS } from './AnimatedEntry';

const DELETE_ACTION_WIDTH = 72;
const DELETE_ICON_SIZE = 22;
const DELETE_CIRCLE_SIZE = 48;
const DELETE_FADE_DURATION_MS = 150;
const SPRING_CONFIG = { damping: 20, stiffness: 200 };

const DeleteAction = ({ onPress }: { onPress: () => void }) => (
  <BaseTouchable onPress={onPress} justify="center" items="center" width={DELETE_ACTION_WIDTH}>
    <YStack
      bg="$red10"
      width={DELETE_CIRCLE_SIZE}
      height={DELETE_CIRCLE_SIZE}
      rounded="$full"
      justify="center"
      items="center"
    >
      {/* NOTE: Ionicons color prop is a native string, not a Tamagui token */}
      <Ionicons name="trash-outline" size={DELETE_ICON_SIZE} color="white" />
    </YStack>
  </BaseTouchable>
);

interface SwipeableDeleteWrapperProps {
  entryId: string;
  onDelete: (id: string) => void;
  closeKey: number;
  index: number;
  children: ReactNode;
}

interface SwipeableDeleteWrapperHandle {
  open: () => void;
}

const SwipeableDeleteWrapper = ({
  entryId,
  onDelete,
  closeKey,
  index,
  children,
  ref,
}: SwipeableDeleteWrapperProps & { ref?: Ref<SwipeableDeleteWrapperHandle> }) => {
  const { t } = useLingui();
  const startDrag = useSwipeableStore((s) => s.startDrag);
  const endDrag = useSwipeableStore((s) => s.endDrag);
  const translateX = useSharedValue(0);
  const deleteOpacity = useSharedValue(0);
  const isOpen = useRef(false);
  const [showOverlay, setShowOverlay] = useState(false);

  const close = useCallback(() => {
    // Reanimated shared value — stable ref mutated outside React's data flow.
    // eslint-disable-next-line react-hooks/immutability
    translateX.value = withSpring(0, SPRING_CONFIG);
    setShowOverlay(false);
    if (isOpen.current) {
      isOpen.current = false;
      endDrag();
    }
  }, [translateX, endDrag]);

  // React Compiler memoizes this handler; not in any deps array, so no useCallback.
  const confirmDelete = () => {
    Alert.alert(t`Delete entry?`, t`This cannot be undone.`, [
      { text: t`Cancel`, style: 'cancel', onPress: close },
      {
        text: t`Delete`,
        style: 'destructive',
        onPress: () => {
          onDelete(entryId);
          logJournalEntryDeleted();
        },
      },
    ]);
  };

  useImperativeHandle(
    ref,
    () => ({
      open: () => {
        translateX.value = withSpring(-DELETE_ACTION_WIDTH, SPRING_CONFIG);
        setShowOverlay(true);
        if (!isOpen.current) {
          isOpen.current = true;
          startDrag();
        }
      },
    }),
    [translateX, startDrag],
  );

  useEffect(() => {
    // Parent bumps closeKey to imperatively close this row — calling close()
    // (which sets overlay state) in response is the intended behaviour.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (closeKey > 0) close();
  }, [closeKey, close]);

  useEffect(() => {
    return () => {
      if (isOpen.current) endDrag();
    };
  }, [endDrag]);

  useEffect(() => {
    const entryAnimationMs = index * STAGGER_DELAY_MS + ENTER_DURATION_MS;
    deleteOpacity.value = withDelay(
      entryAnimationMs,
      withTiming(1, { duration: DELETE_FADE_DURATION_MS }),
    );
  }, [deleteOpacity, index]);

  const deleteActionStyle = useAnimatedStyle(() => {
    const swipeProgress = interpolate(
      -translateX.value,
      [0, DELETE_ACTION_WIDTH],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return { opacity: deleteOpacity.value * swipeProgress };
  });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <YStack>
      <Animated.View
        style={[
          deleteActionStyle,
          {
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: DELETE_ACTION_WIDTH,
            justifyContent: 'center',
            alignItems: 'center',
          },
        ]}
      >
        <DeleteAction onPress={confirmDelete} />
      </Animated.View>
      <Animated.View style={animatedStyle}>
        {children}
        {showOverlay && (
          <YStack
            position="absolute"
            top={0}
            left={0}
            right={0}
            bottom={0}
            onStartShouldSetResponder={() => true}
            onResponderRelease={close}
          />
        )}
      </Animated.View>
    </YStack>
  );
};

export { SwipeableDeleteWrapper };
export type { SwipeableDeleteWrapperProps, SwipeableDeleteWrapperHandle };
