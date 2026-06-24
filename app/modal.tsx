import { Link } from 'expo-router';
import { YStack, Text } from 'tamagui';

const MODAL_TITLE_FONT_SIZE = 24;

const ModalScreen = () => (
  <YStack flex={1} items="center" justify="center" p="$5">
    <Text fontSize={MODAL_TITLE_FONT_SIZE} fontWeight="700" mb="$4">
      This is a modal
    </Text>
    <Link href="/" dismissTo>
      <Text color="$accentBackground">Go to home screen</Text>
    </Link>
  </YStack>
);

export default ModalScreen;
