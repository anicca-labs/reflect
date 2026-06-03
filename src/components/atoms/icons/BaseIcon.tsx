import { SvgXml, type XmlProps } from 'react-native-svg'
import type { ColorTokens } from 'tamagui'

import { svgImports } from './svg-imports'
import { sizes } from '@theme'
import { getImageDimensions } from '@ksairi-org/react-native-functions'
import { useFontScale } from '@ksairi-org/react-native-hooks'
import { useColorTokenValue } from '@ksairi-org/react-native-ui-config'

type IconName = keyof typeof svgImports

type BaseIconProps = {
  iconName: IconName
  color?: ColorTokens | string
  width?: number
  height?: number
  autoScaleBasedOnScreenDimensions?: boolean
  maxFontScaleToApply?: number
  viewBox?: string
} & Omit<XmlProps, 'width' | 'height' | 'color' | 'xml'>

const isIconValid = (nameOfIcon: string | IconName): nameOfIcon is IconName =>
  nameOfIcon in svgImports

const BaseIcon = ({
  color,
  iconName,
  width,
  height,
  preserveAspectRatio = 'xMaxYMax meet',
  autoScaleBasedOnScreenDimensions = true,
  maxFontScaleToApply,
  viewBox = '0 0 24 24',
  ...rest
}: BaseIconProps) => {
  if (!isIconValid(iconName)) {
    throw new Error(`Icon ${iconName} does not exist`)
  }

  const fontScale = useFontScale()

  const { width: maybeScaledWidth, height: maybeScaledHeight } =
    getImageDimensions({
      width,
      height,
      autoScaleBasedOnScreenDimensions,
      defaultSize: sizes.lg,
      fontScale,
      maxFontScaleToApply,
    })

  const isColorToken = (c: ColorTokens | string | undefined): c is ColorTokens =>
    typeof c === 'string' && c.startsWith('$')

  const tokenColor = useColorTokenValue(isColorToken(color) ? color : undefined)
  const calculatedColor = isColorToken(color) ? tokenColor : color

  return (
    <SvgXml
      width={maybeScaledWidth}
      height={maybeScaledHeight}
      color={calculatedColor}
      xml={svgImports[iconName]}
      preserveAspectRatio={preserveAspectRatio}
      viewBox={viewBox}
      {...rest}
    />
  )
}

export { BaseIcon }
export type { IconName, BaseIconProps }
