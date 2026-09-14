import { useState } from 'react';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { YStack, XStack, Spinner, Input } from 'tamagui';
import { BodySm, BodyMdBold, LabelMd, LabelLg } from '@fonts';
import { BaseTouchable } from '@anicca-labs/ui-touchables';
import { Trans, useLingui } from '@lingui/react/macro';
import { useAskJournal, useAiReflectionsSetting, useRevenueCat, useToast } from '@hooks';
import { useSessionStore } from '@/src/stores';

// Ask-your-journal: a question answered from the user's own pages. The premium
// feature that lands EARLY — every existing Pro gate (30 entries, 4 reflections)
// takes weeks to reach, so self-selecting buyers had nothing to buy in week one.
// Free users get 2 questions ever (enough to feel it), then the paywall.
//
// Consented users only: asking sends entries to the AI, so the surface simply
// doesn't exist before consent — the echo card owns that ask.
const MAX_QUESTION_CHARS = 300;

const AskJournal = () => {
  const isAnonymous = useSessionStore((s) => s.isAnonymous);
  const { enabled: consented, settled } = useAiReflectionsSetting();
  const { presentPaywall } = useRevenueCat();
  const ask = useAskJournal();
  const { alert } = useToast();
  const { t } = useLingui();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);

  if (isAnonymous || !settled || !consented) return null;

  const submit = async () => {
    const q = question.trim();
    if (!q || ask.isPending) return;
    setAnswer(null);
    const res = await ask.mutateAsync(q).catch(() => null);
    if (res?.status === 'ok' && res.answer) {
      setAnswer(res.answer);
      setQuestion('');
    } else if (res?.status === 'pro_required') {
      await presentPaywall('ask-journal');
    } else if (res?.status === 'not_enough') {
      alert({
        title: t`Nothing to search yet`,
        message: t`Write a few entries first — then your journal can answer.`,
      });
    } else {
      alert({ title: t`Couldn't answer`, message: t`Please try again.`, preset: 'error' });
    }
  };

  return (
    <YStack mb="$7" gap="$3">
      <YStack gap="$1">
        <BodyMdBold color="$text-emphasis">
          🔎 <Trans>Ask your journal</Trans>
        </BodyMdBold>
        <BodySm color="$text-disabled">
          <Trans>Your own pages answer — “when did I last feel like this?”</Trans>
        </BodySm>
      </YStack>
      <XStack gap="$2" items="center">
        {/* Explicit height + theming, mirroring the entry-search Input: Tamagui's
            default Input collapses to a sliver on Android without them. */}
        <Input
          flex={1}
          value={question}
          onChangeText={setQuestion}
          maxLength={MAX_QUESTION_CHARS}
          placeholder={t`Ask something about what you’ve written…`}
          returnKeyType="send"
          onSubmitEditing={submit}
          bg="$surface-card"
          borderWidth={1}
          borderColor="$borderColor"
          focusStyle={{ outlineWidth: 0 }}
          fontSize="$3"
          color="$text-emphasis"
          rounded="$4"
          px="$4"
          height={44}
        />
        <BaseTouchable
          onPress={submit}
          disabled={ask.isPending || !question.trim()}
          opacity={ask.isPending || !question.trim() ? 0.5 : 1}
          bg="$accentBackground"
          rounded="$4"
          px="$4"
          py="$3"
        >
          {ask.isPending ? (
            <Spinner size="small" color="$accentColor" />
          ) : (
            <LabelLg color="$accentColor">
              <Trans>Ask</Trans>
            </LabelLg>
          )}
        </BaseTouchable>
      </XStack>
      {answer ? (
        <Animated.View entering={FadeInDown.duration(260)} exiting={FadeOutUp.duration(200)}>
          <BaseTouchable onPress={() => setAnswer(null)}>
            <YStack
              bg="$surface-card"
              rounded="$4"
              p="$4"
              borderWidth={1}
              borderColor="$borderColor"
            >
              <XStack justify="space-between" items="flex-start" gap="$3">
                <BodySm color="$text-emphasis" flex={1} style={{ lineHeight: 20 }}>
                  🍂 {answer}
                </BodySm>
                <LabelMd color="$text-disabled">✕</LabelMd>
              </XStack>
            </YStack>
          </BaseTouchable>
        </Animated.View>
      ) : null}
    </YStack>
  );
};

export { AskJournal };
