import { defaultConfig } from '@tamagui/config/v4'
import { createTamagui, createTokens } from 'tamagui'
import { themes } from './themes'
import { sizes, radius } from './tokens'

const tamaguiConfig = createTamagui({
  ...defaultConfig,
  themes: {
    ...defaultConfig.themes,
    ...themes,
  },
  tokens: createTokens({
    ...defaultConfig.tokens,
    color: themes.light,
    size: sizes,
    space: sizes,
    radius,
  }),
  settings: {
    allowedStyleValues: 'somewhat-strict',
  },
})

export type AppConfig = typeof tamaguiConfig
export default tamaguiConfig
