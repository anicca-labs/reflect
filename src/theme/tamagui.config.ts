import { defaultConfig } from '@tamagui/config/v5';
import { animations } from '@tamagui/config/v5-rn';
import { createTamagui, createTokens } from 'tamagui';
import { themes } from './themes';
import { sizes, radius, fonts } from './tokens';

const tamaguiConfig = createTamagui({
  ...defaultConfig,
  animations,
  fonts,
  themes: {
    ...defaultConfig.themes,
    ...themes,
  },
  tokens: createTokens({
    ...defaultConfig.tokens,
    size: { ...defaultConfig.tokens.size, ...sizes },
    space: { ...defaultConfig.tokens.space, ...sizes },
    radius: { ...defaultConfig.tokens.radius, ...radius },
  }),
  settings: {
    allowedStyleValues: 'strict',
  },
});

type AppConfig = typeof tamaguiConfig;

export type { AppConfig };
export { tamaguiConfig };
