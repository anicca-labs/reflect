import { useEffect, useRef, type ReactNode } from 'react'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, cancelAnimation, SlideOutLeft, LinearTransition } from 'react-native-reanimated'

interface AnimatedEntryProps {
  children: ReactNode
  index: number
  animKey: number
}

const SLIDE_OFFSET = 40
export const STAGGER_DELAY_MS = 100
export const ENTER_DURATION_MS = 500
const EXIT_DURATION_MS = 250

const AnimatedEntry = ({ children, index, animKey }: AnimatedEntryProps) => {
  const tx = useSharedValue(index % 2 === 0 ? -SLIDE_OFFSET : SLIDE_OFFSET)
  const opacity = useSharedValue(0)
  const indexRef = useRef(index)
  indexRef.current = index

  useEffect(() => {
    if (animKey === 0) return
    const i = indexRef.current
    cancelAnimation(tx)
    cancelAnimation(opacity)
    tx.value = i % 2 === 0 ? -SLIDE_OFFSET : SLIDE_OFFSET
    opacity.value = 0
    const delay = i * STAGGER_DELAY_MS
    tx.value = withDelay(delay, withTiming(0, { duration: ENTER_DURATION_MS }))
    opacity.value = withDelay(delay, withTiming(1, { duration: ENTER_DURATION_MS }))
  }, [animKey, tx, opacity])

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
    opacity: opacity.value,
  }))

  return (
    // NOTE: Animated.View style prop requires a plain animated style object — no Tamagui equivalent
    <Animated.View style={style} exiting={SlideOutLeft.duration(EXIT_DURATION_MS)} layout={LinearTransition}>
      {children}
    </Animated.View>
  )
}

export { AnimatedEntry }
export type { AnimatedEntryProps }
