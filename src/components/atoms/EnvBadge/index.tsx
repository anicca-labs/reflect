import { YStack, Paragraph } from 'tamagui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'


const Z_INDEX_ENV_BADGE = 9999
const BADGE_RIGHT = 12
const BADGE_TOP_OFFSET = 8
const BADGE_BORDER_RADIUS = 999
const BADGE_PX = 8
const BADGE_PY = 3
const BADGE_FONT_SIZE = 10
const BADGE_LETTER_SPACING = 0.5

const env = process.env.EXPO_PUBLIC_ENV

const EnvBadge = () => {
  const { top, right: rightInset } = useSafeAreaInsets()

  if (!env || env === 'prd' || env === 'production') return null

  const label = env === 'stg' || env === 'staging' ? 'STG' : env.toUpperCase()

  return (
    <YStack
      position="absolute"
      right={BADGE_RIGHT + rightInset}
      top={top + BADGE_TOP_OFFSET}
      zIndex={Z_INDEX_ENV_BADGE}
      pointerEvents="none">
      <YStack
        // NOTE: amber warning color — no semantic token in this project's palette
        style={{ backgroundColor: '#F59E0B' }}
        borderRadius={BADGE_BORDER_RADIUS}
        px={BADGE_PX}
        py={BADGE_PY}>
        <Paragraph
          color="$white"
          fontSize={BADGE_FONT_SIZE}
          fontWeight="700"
          letterSpacing={BADGE_LETTER_SPACING}>
          {label}
        </Paragraph>
      </YStack>
    </YStack>
  )
}

export { EnvBadge }
