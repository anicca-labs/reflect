import { Share } from 'react-native';
import { format } from 'date-fns';
import type { JournalEntry } from '@/src/types/journal';
import { getDateLocale } from '@/src/utils/date';
import { useAppLockStore } from '@/src/stores';

// Uses "·" rather than the word "at" so there's no English connector to translate,
// and honours the user's 12/24-hour preference — it was hardcoded to h:mm a, so a
// 24h user got 12-hour times in their own export.
const formatEntry = (entry: JournalEntry, use24h: boolean): string => {
  const date = new Date(entry.created_at);
  const locale = getDateLocale();
  const dateStr = format(date, 'EEEE, MMMM d, yyyy', { locale });
  const timeStr = format(date, use24h ? 'HH:mm' : 'h:mm a', { locale });
  return `${dateStr} · ${timeStr}\n\n${entry.content}`;
};

type ExportOptions = {
  use24h: boolean;
  // Localized by the caller, where the Lingui macro is in scope — the extractor
  // only sees `t` inside a component, so building these here would ship English
  // to an app translated into six languages.
  title: string;
  heading: string;
};

const exportJournal = async (
  entries: JournalEntry[],
  { use24h, title, heading }: ExportOptions,
): Promise<void> => {
  if (entries.length === 0) return;

  const sorted = [...entries].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const text = sorted.map((e) => formatEntry(e, use24h)).join('\n\n---\n\n');
  const header = `${heading}\n\n${'='.repeat(40)}\n\n`;

  // The share sheet pushes the app through inactive/background without the user
  // leaving — suppress the biometric lock for the round trip (same pattern as
  // the paywall sheet; closeStoreSheet defers until we're back in foreground).
  const { openStoreSheet, closeStoreSheet } = useAppLockStore.getState();
  openStoreSheet();
  try {
    await Share.share({ message: header + text, title });
  } finally {
    closeStoreSheet();
  }
};

export { exportJournal };
