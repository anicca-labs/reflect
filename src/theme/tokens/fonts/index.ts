import {
  Lora_400Regular,
  Lora_600SemiBold,
  Lora_700Bold,
  Lora_400Regular_Italic,
} from '@expo-google-fonts/lora';
import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { createFont } from 'tamagui';

const fontAssets = {
  'Lora-Regular': Lora_400Regular,
  'Lora-SemiBold': Lora_600SemiBold,
  'Lora-Bold': Lora_700Bold,
  'Lora-Italic': Lora_400Regular_Italic,
  'DMSans-Regular': DMSans_400Regular,
  'DMSans-Medium': DMSans_500Medium,
  'DMSans-Bold': DMSans_700Bold,
};

const loraFont = createFont({
  family: 'Lora',
  size: { 1: 12, 2: 14, 3: 16, 4: 18, 5: 20, 6: 24, 7: 28, 8: 32, 9: 36, 10: 48 },
  lineHeight: { 1: 16, 2: 20, 3: 24, 4: 28, 5: 32, 6: 36, 7: 40, 8: 48, 9: 56, 10: 64 },
  weight: { 4: '400', 6: '600', 7: '700' },
  letterSpacing: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 },
  face: {
    '400': { normal: 'Lora-Regular', italic: 'Lora-Italic' },
    '600': { normal: 'Lora-SemiBold' },
    '700': { normal: 'Lora-Bold' },
  },
});

const dmSansFont = createFont({
  family: 'DM Sans',
  size: { 1: 12, 2: 14, 3: 16, 4: 18, 5: 20, 6: 24, 7: 28, 8: 32, 9: 36, 10: 48 },
  lineHeight: { 1: 16, 2: 20, 3: 24, 4: 28, 5: 32, 6: 36, 7: 40, 8: 48, 9: 56, 10: 64 },
  weight: { 4: '400', 5: '500', 7: '700' },
  letterSpacing: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 },
  face: {
    '400': { normal: 'DMSans-Regular' },
    '500': { normal: 'DMSans-Medium' },
    '700': { normal: 'DMSans-Bold' },
  },
});

const fonts = {
  heading: loraFont,
  body: dmSansFont,
};

export { fontAssets, fonts };
