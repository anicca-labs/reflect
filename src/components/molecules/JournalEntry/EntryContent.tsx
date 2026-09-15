import { YStack } from 'tamagui';
import { BodySm, BodyMdBold } from '@fonts';

const TITLE_MAX = 120;
const PREVIEW_BODY_MAX = 250;

// A prompt-answered entry is stored as "title\n\nbody" (see JournalScreen's
// "Answer today's prompt" checkbox). Split that shape so the title renders bold.
// Gated tightly so a normal entry that merely has a paragraph break isn't mistaken
// for a titled one: the first segment must be a single line and reasonably short,
// and there must be a real body after it.
const splitTitle = (content: string): { title: string | null; body: string } => {
  const idx = content.indexOf('\n\n');
  if (idx <= 0) return { title: null, body: content };
  const first = content.slice(0, idx);
  const body = content.slice(idx + 2);
  if (first.includes('\n') || first.length > TITLE_MAX || !body.trim()) {
    return { title: null, body: content };
  }
  return { title: first, body };
};

type Props = {
  content: string;
  // Journal-list card: truncate the body. Full peek view: show it all.
  preview?: boolean;
  lineHeight?: number;
};

// Shared entry renderer: bold title line (when present) + body. Used by the
// journal card and the peek modal so both treat titled entries identically.
const EntryContent = ({ content, preview = false, lineHeight }: Props) => {
  const { title, body } = splitTitle(content);
  const shownBody =
    preview && body.length > PREVIEW_BODY_MAX ? body.slice(0, PREVIEW_BODY_MAX) + '…' : body;
  return (
    <YStack gap={title ? '$2' : '$0'}>
      {title ? <BodyMdBold color="$text-emphasis">{title}</BodyMdBold> : null}
      <BodySm color="$text-emphasis" lineHeight={lineHeight}>
        {shownBody}
      </BodySm>
    </YStack>
  );
};

export { EntryContent };
