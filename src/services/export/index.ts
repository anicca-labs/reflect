import { Share } from 'react-native';
import { format } from 'date-fns';
import type { JournalEntry } from '@/src/types/journal';
import { getDateLocale } from '@/src/utils/date';
import { useAppLockStore } from '@/src/stores';

const formatEntry = (entry: JournalEntry): string => {
  const date = new Date(entry.created_at);
  const locale = getDateLocale();
  const dateStr = format(date, 'EEEE, MMMM d, yyyy', { locale });
  const timeStr = format(date, 'h:mm a', { locale });
  return `${dateStr} at ${timeStr}\n\n${entry.content}`;
};

const exportJournal = async (entries: JournalEntry[]): Promise<void> => {
  if (entries.length === 0) return;

  const sorted = [...entries].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const text = sorted.map(formatEntry).join('\n\n---\n\n');
  const header = `Reflect Journal — ${sorted.length} ${sorted.length === 1 ? 'entry' : 'entries'}\nExported ${format(new Date(), 'MMMM d, yyyy', { locale: getDateLocale() })}\n\n${'='.repeat(40)}\n\n`;

  // The share sheet pushes the app through inactive/background without the user
  // leaving — suppress the biometric lock for the round trip (same pattern as
  // the paywall sheet; closeStoreSheet defers until we're back in foreground).
  const { openStoreSheet, closeStoreSheet } = useAppLockStore.getState();
  openStoreSheet();
  try {
    await Share.share({ message: header + text, title: 'My Reflect Journal' });
  } finally {
    closeStoreSheet();
  }
};

export { exportJournal };
