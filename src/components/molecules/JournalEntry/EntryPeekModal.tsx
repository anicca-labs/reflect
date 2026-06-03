import { Modal, Dimensions, Share } from 'react-native'
import { BlurView } from 'expo-blur'
import { ScrollView, YStack, XStack, styled } from 'tamagui'
import { BodySm, LabelMd, LabelSm } from '@fonts'
import { BaseTouchable } from '@ksairi-org/ui-touchables'
import { BaseIcon } from '@atoms'
import { sizes } from '@theme'
import { format } from 'date-fns'
import { usePreferencesStore } from '@/src/stores'
import { formatEntryTime, getDateLocale } from '@/src/utils/date'
import type { JournalEntry } from '@/src/types/journal'

const BlurOverlay = styled(BlurView, { flex: 1 })

interface EntryPeekModalProps {
  entry: JournalEntry | null
  onClose: () => void
  onToggleBookmark?: (id: string, current: boolean) => void
}

const PEEK_MODAL_HEIGHT_FRACTION = 0.7
const PEEK_HIT_SLOP_SIZE = 12
const ENTRY_BODY_LINE_HEIGHT = 22
const PEEK_BLUR_INTENSITY = 80

const MAX_CARD_HEIGHT = Dimensions.get('window').height * PEEK_MODAL_HEIGHT_FRACTION
const HIT_SLOP = { top: PEEK_HIT_SLOP_SIZE, bottom: PEEK_HIT_SLOP_SIZE, left: PEEK_HIT_SLOP_SIZE, right: PEEK_HIT_SLOP_SIZE }

const EntryPeekModal = ({ entry, onClose, onToggleBookmark }: EntryPeekModalProps) => {
  const timeFormat = usePreferencesStore((s) => s.timeFormat)

  const handleShare = () => {
    if (!entry) return
    Share.share({ message: entry.content })
  }

  return (
    <>
      {/*
        Blur lives in the APP layer, not inside the Modal.
        BlurView inside a transparent Modal blurs its own (transparent) window — nothing visible.
        Here it blurs the actual screen content behind it.
      */}
      {entry ? (
        <YStack fullscreen pointerEvents="none">
          <BlurOverlay intensity={PEEK_BLUR_INTENSITY} tint="dark" />
          <YStack fullscreen bg="$peekDim" />
        </YStack>
      ) : null}
      <Modal
        transparent
        visible={!!entry}
        animationType="fade"
        onRequestClose={onClose}
        statusBarTranslucent>
        <BaseTouchable flex={1} justify="center" px="$5" onPress={onClose}>
          <BaseTouchable onPress={() => {}}>
            <YStack
              bg="$surface-card"
              rounded="$5"
              borderWidth={1}
              borderColor="$borderColor"
              maxHeight={MAX_CARD_HEIGHT}
              overflow="hidden">
              <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
                <YStack p="$5" pb="$4">
                  <BodySm color="$text-emphasis" lineHeight={ENTRY_BODY_LINE_HEIGHT}>
                    {entry?.content}
                  </BodySm>
                </YStack>
              </ScrollView>
              <XStack
                px="$5"
                py="$4"
                borderTopWidth={1}
                borderColor="$borderColor"
                justify="space-between"
                items="center">
                <YStack gap="$0.5">
                  <LabelSm color="$text-disabled">
                    {entry ? format(new Date(entry.created_at), 'EEEE, MMMM d', { locale: getDateLocale() }) : ''}
                  </LabelSm>
                  <LabelMd color="$text-disabled">
                    {entry ? formatEntryTime(entry.created_at, timeFormat === '24h') : ''}
                  </LabelMd>
                </YStack>
                <XStack gap="$4" items="center">
                  <BaseTouchable onPress={handleShare} hitSlop={HIT_SLOP}>
                    <BaseIcon iconName="iconShare" width={sizes.md} height={sizes.md} color="$text-disabled" />
                  </BaseTouchable>
                  {onToggleBookmark && entry ? (
                    <BaseTouchable
                      onPress={() => onToggleBookmark(entry.id, entry.is_bookmarked)}
                      hitSlop={HIT_SLOP}>
                      <LabelMd color={entry.is_bookmarked ? '$accentBackground' : '$text-disabled'}>
                        {entry.is_bookmarked ? '★' : '☆'}
                      </LabelMd>
                    </BaseTouchable>
                  ) : null}
                </XStack>
              </XStack>
            </YStack>
          </BaseTouchable>
        </BaseTouchable>
      </Modal>
    </>
  )
}

export { EntryPeekModal }
export type { EntryPeekModalProps }
