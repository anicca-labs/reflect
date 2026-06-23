import { useRef, useState, useCallback, useEffect, type RefObject } from 'react';
import { BackHandler, Dimensions, Share, type View } from 'react-native';
import { BlurView } from 'expo-blur';
import { ScrollView, YStack, XStack } from 'tamagui';
import { BodySm, LabelMd, LabelSm } from '@fonts';
import { BaseTouchable } from '@ksairi-org/ui-touchables';
import { BaseIcon } from '@atoms';
import { sizes } from '@theme';
import { format } from 'date-fns';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { usePreferencesStore } from '@/src/stores';
import { formatEntryTime, getDateLocale } from '@/src/utils/date';
import type { JournalEntry } from '@/src/types/journal';

interface EntryPeekModalProps {
  entry: JournalEntry | null;
  onClose: () => void;
  onToggleBookmark?: (id: string, current: boolean) => void;
  blurTargetRef?: RefObject<View | null>;
}

const PEEK_MODAL_HEIGHT_FRACTION = 0.7;
const PEEK_HIT_SLOP_SIZE = 12;
const ENTRY_BODY_LINE_HEIGHT = 22;
const PEEK_BLUR_INTENSITY = 80;
const ENTER_DURATION_MS = 220;
const EXIT_DURATION_MS = 160;
const CARD_SCALE_FROM = 0.93;

const MAX_CARD_HEIGHT = Dimensions.get('window').height * PEEK_MODAL_HEIGHT_FRACTION;
const HIT_SLOP = {
  top: PEEK_HIT_SLOP_SIZE,
  bottom: PEEK_HIT_SLOP_SIZE,
  left: PEEK_HIT_SLOP_SIZE,
  right: PEEK_HIT_SLOP_SIZE,
};

interface CardContentProps {
  displayEntry: JournalEntry | null;
  isBookmarked: boolean;
  timeFormat: string;
  onShare: () => void;
  onToggleBookmark?: (id: string, current: boolean) => void;
}

const CardContent = ({
  displayEntry,
  isBookmarked,
  timeFormat,
  onShare,
  onToggleBookmark,
}: CardContentProps) => (
  <>
    <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
      <YStack p="$5" pb="$4">
        <BodySm color="$text-emphasis" lineHeight={ENTRY_BODY_LINE_HEIGHT}>
          {displayEntry?.content}
        </BodySm>
      </YStack>
    </ScrollView>
    <XStack
      px="$5"
      py="$4"
      borderTopWidth={1}
      borderColor="$borderColor"
      justify="space-between"
      items="center"
    >
      <YStack gap="$0.5">
        <LabelSm color="$text-disabled">
          {displayEntry
            ? format(new Date(displayEntry.created_at), 'EEEE, MMMM d', { locale: getDateLocale() })
            : ''}
        </LabelSm>
        <LabelMd color="$text-disabled">
          {displayEntry ? formatEntryTime(displayEntry.created_at, timeFormat === '24h') : ''}
        </LabelMd>
      </YStack>
      <XStack gap="$4" items="center">
        <BaseTouchable onPress={onShare} hitSlop={HIT_SLOP}>
          <BaseIcon
            iconName="iconShare"
            width={sizes.md}
            height={sizes.md}
            color="$text-disabled"
          />
        </BaseTouchable>
        {onToggleBookmark && displayEntry ? (
          <BaseTouchable
            onPress={() => onToggleBookmark(displayEntry.id, isBookmarked)}
            hitSlop={HIT_SLOP}
          >
            <LabelMd color={isBookmarked ? '$accentBackground' : '$text-disabled'}>
              {isBookmarked ? '★' : '☆'}
            </LabelMd>
          </BaseTouchable>
        ) : null}
      </XStack>
    </XStack>
  </>
);

const EntryPeekModal = ({
  entry,
  onClose,
  onToggleBookmark,
  blurTargetRef,
}: EntryPeekModalProps) => {
  const timeFormat = usePreferencesStore((s) => s.timeFormat);
  const [displayEntry, setDisplayEntry] = useState<JournalEntry | null>(null);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const isClosing = useRef(false);
  const openEntryId = useRef<string | null>(null);

  const opacity = useSharedValue(0);
  const scale = useSharedValue(CARD_SCALE_FROM);
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (entry) {
      const isNewEntry = openEntryId.current !== entry.id;
      openEntryId.current = entry.id;
      isClosing.current = false;
      // Syncing the entry prop into local state keeps the card rendered through
      // the exit animation after `entry` becomes null — an intentional effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayEntry(entry);
      setIsBookmarked(entry.is_bookmarked);
      if (isNewEntry) {
        opacity.value = 0;
        scale.value = CARD_SCALE_FROM;
        translateY.value = 0;
        opacity.value = withTiming(1, { duration: ENTER_DURATION_MS });
        scale.value = withSpring(1, { damping: 20, stiffness: 280 });
      }
    } else {
      openEntryId.current = null;
    }
  }, [entry, opacity, scale, translateY]);

  const handleToggleBookmark = useCallback(
    (id: string, current: boolean) => {
      setIsBookmarked(!current);
      onToggleBookmark?.(id, current);
    },
    [onToggleBookmark],
  );

  const handleClose = useCallback(() => {
    if (isClosing.current) return;
    isClosing.current = true;
    // Reanimated shared values are stable refs mutated outside React's data flow.
    /* eslint-disable react-hooks/immutability */
    scale.value = withTiming(CARD_SCALE_FROM, { duration: EXIT_DURATION_MS });
    translateY.value = withTiming(40, { duration: EXIT_DURATION_MS });
    opacity.value = withTiming(0, { duration: EXIT_DURATION_MS }, (finished) => {
      if (finished) {
        runOnJS(setDisplayEntry)(null);
        runOnJS(onClose)();
      }
    });
    /* eslint-enable react-hooks/immutability */
  }, [onClose, opacity, scale, translateY]);

  useEffect(() => {
    if (!displayEntry) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleClose();
      return true;
    });
    return () => sub.remove();
  }, [displayEntry, handleClose]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  // Opacity is on the parent wrapper — card only needs the transform animation
  const cardTransformStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
  }));

  const handleShare = () => {
    if (!displayEntry) return;
    Share.share({ message: displayEntry.content });
  };

  return (
    /*
      Everything in the same app-layer compositor pass — no native Modal window boundary.
      BlurView is always mounted so it never unmounts during the exit animation.
      Opacity controls visibility; pointerEvents controls touch interception.
    */
    <Animated.View
      pointerEvents={displayEntry ? 'box-none' : 'none'}
      style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, backdropStyle]}
    >
      <BlurView
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        intensity={PEEK_BLUR_INTENSITY}
        tint="dark"
        blurTarget={blurTargetRef}
        blurMethod="dimezisBlurViewSdk31Plus"
      />
      <BaseTouchable flex={1} justify="center" px="$5" onPress={handleClose} bg="$peekDim">
        <YStack onStartShouldSetResponder={() => true}>
          <Animated.View style={cardTransformStyle}>
            <YStack
              bg="$surface-card"
              rounded="$5"
              borderWidth={1}
              borderColor="$borderColor"
              maxHeight={MAX_CARD_HEIGHT}
              overflow="hidden"
            >
              <CardContent
                displayEntry={entry ?? displayEntry}
                isBookmarked={isBookmarked}
                timeFormat={timeFormat}
                onShare={handleShare}
                onToggleBookmark={onToggleBookmark ? handleToggleBookmark : undefined}
              />
            </YStack>
          </Animated.View>
        </YStack>
      </BaseTouchable>
    </Animated.View>
  );
};

export { EntryPeekModal };
export type { EntryPeekModalProps };
