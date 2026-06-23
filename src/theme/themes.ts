import { defaultConfig } from '@tamagui/config/v5';

const lightTheme = {
  ...defaultConfig.themes.light,

  // Surface scale — warm off-white → warm near-black
  'surface-app': 'hsl(40, 20%, 98%)', // page background
  'surface-card': 'hsl(38, 18%, 95%)', // cards, inputs
  'surface-subtle': 'hsl(36, 16%, 91%)', // disabled button bg, chips
  'surface-hover': 'hsl(34, 14%, 87%)',
  'surface-pressed': 'hsl(32, 12%, 83%)',
  'border-subtle': 'hsl(30, 11%, 78%)',
  'border-default': 'hsl(28, 10%, 70%)',
  'text-disabled': 'hsl(26, 9%, 60%)',
  'text-placeholder': 'hsl(24, 8%, 48%)',
  'text-tertiary': 'hsl(22, 9%, 36%)',
  'text-secondary': 'hsl(20, 10%, 24%)',
  'text-emphasis': 'hsl(18, 12%, 11%)', // headings, strong text

  background: 'hsl(40, 20%, 98%)',
  backgroundHover: 'hsl(38, 18%, 95%)',
  backgroundPress: 'hsl(36, 16%, 91%)',
  backgroundFocus: 'hsl(38, 18%, 95%)',

  // Semi-transparent backgrounds (for overlays)
  background0: 'hsla(40, 20%, 98%, 0)',
  background02: 'hsla(40, 20%, 98%, 0.2)',
  background04: 'hsla(40, 20%, 98%, 0.4)',
  background06: 'hsla(40, 20%, 98%, 0.6)',
  background08: 'hsla(40, 20%, 98%, 0.8)',

  color: 'hsl(18, 12%, 11%)',
  colorHover: 'hsl(20, 10%, 24%)',
  colorPress: 'hsl(22, 9%, 36%)',
  colorFocus: 'hsl(20, 10%, 24%)',

  // Semi-transparent text
  color0: 'hsla(18, 12%, 11%, 0)',
  color02: 'hsla(18, 12%, 11%, 0.2)',
  color04: 'hsla(18, 12%, 11%, 0.4)',
  color06: 'hsla(18, 12%, 11%, 0.6)',
  color08: 'hsla(18, 12%, 11%, 0.8)',

  borderColor: 'hsl(34, 14%, 87%)',
  borderColorHover: 'hsl(32, 12%, 83%)',
  borderColorPress: 'hsl(30, 11%, 78%)',
  borderColorFocus: 'hsl(26, 60%, 52%)', // amber on focus

  placeholderColor: 'hsl(24, 8%, 48%)',
  outlineColor: 'hsla(26, 60%, 52%, 0.35)',

  // Brand — warm amber
  accentBackground: 'hsl(26, 72%, 44%)', // #C4631A
  accentColor: '#ffffff',

  shadowColor: 'rgba(28, 25, 23, 0.07)',
  shadow1: 'rgba(28, 25, 23, 0.04)',
  shadow2: 'rgba(28, 25, 23, 0.08)',
  shadow3: 'rgba(28, 25, 23, 0.12)',
  shadow4: 'rgba(28, 25, 23, 0.18)',
  shadow5: 'rgba(28, 25, 23, 0.24)',
  shadow6: 'rgba(28, 25, 23, 0.32)',

  peekDim: 'rgba(0,0,0,0.52)',
};

const darkTheme = {
  ...defaultConfig.themes.dark,

  // Surface scale — warm near-black → warm off-white
  'surface-app': 'hsl(30, 8%, 6%)', // page background
  'surface-card': 'hsl(28, 7%, 10%)', // cards, inputs
  'surface-subtle': 'hsl(27, 7%, 14%)', // disabled button bg, chips
  'surface-hover': 'hsl(26, 7%, 18%)',
  'surface-pressed': 'hsl(25, 7%, 22%)',
  'border-subtle': 'hsl(24, 7%, 27%)',
  'border-default': 'hsl(23, 8%, 35%)',
  'text-disabled': 'hsl(22, 9%, 44%)',
  'text-placeholder': 'hsl(21, 10%, 55%)',
  'text-tertiary': 'hsl(20, 11%, 68%)',
  'text-secondary': 'hsl(19, 14%, 82%)',
  'text-emphasis': 'hsl(36, 28%, 96%)', // headings, strong text — warm white

  background: 'hsl(30, 8%, 6%)',
  backgroundHover: 'hsl(28, 7%, 10%)',
  backgroundPress: 'hsl(27, 7%, 14%)',
  backgroundFocus: 'hsl(28, 7%, 10%)',

  background0: 'hsla(30, 8%, 6%, 0)',
  background02: 'hsla(30, 8%, 6%, 0.2)',
  background04: 'hsla(30, 8%, 6%, 0.4)',
  background06: 'hsla(30, 8%, 6%, 0.6)',
  background08: 'hsla(30, 8%, 6%, 0.8)',

  color: 'hsl(36, 28%, 96%)',
  colorHover: 'hsl(19, 14%, 82%)',
  colorPress: 'hsl(20, 11%, 68%)',
  colorFocus: 'hsl(19, 14%, 82%)',

  color0: 'hsla(36, 28%, 96%, 0)',
  color02: 'hsla(36, 28%, 96%, 0.2)',
  color04: 'hsla(36, 28%, 96%, 0.4)',
  color06: 'hsla(36, 28%, 96%, 0.6)',
  color08: 'hsla(36, 28%, 96%, 0.8)',

  borderColor: 'hsl(26, 7%, 18%)',
  borderColorHover: 'hsl(25, 7%, 22%)',
  borderColorPress: 'hsl(24, 7%, 27%)',
  borderColorFocus: 'hsl(26, 72%, 56%)',

  placeholderColor: 'hsl(21, 10%, 55%)',
  outlineColor: 'hsla(26, 72%, 56%, 0.35)',

  // Brand — lighter amber for dark mode
  accentBackground: 'hsl(26, 72%, 58%)', // #E0894E
  accentColor: 'hsl(30, 8%, 6%)',

  shadowColor: 'rgba(0, 0, 0, 0.4)',
  shadow1: 'rgba(0, 0, 0, 0.15)',
  shadow2: 'rgba(0, 0, 0, 0.25)',
  shadow3: 'rgba(0, 0, 0, 0.35)',
  shadow4: 'rgba(0, 0, 0, 0.45)',
  shadow5: 'rgba(0, 0, 0, 0.55)',
  shadow6: 'rgba(0, 0, 0, 0.65)',

  peekDim: 'rgba(0,0,0,0.52)',
};

const splashTokens = {
  light: { splashBackground: 'hsl(37, 38%, 93%)' }, // brand cream #F5F0E8
  dark: { splashBackground: 'hsl(30, 8%, 6%)' }, // matches dark background
};

const themes = {
  light: { ...lightTheme, ...splashTokens.light },
  dark: { ...darkTheme, ...splashTokens.dark },
};

export { lightTheme, darkTheme, themes };
