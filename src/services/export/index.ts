import { Share } from 'react-native'
import type { JournalEntry } from '@/src/types/journal'

const formatEntry = (entry: JournalEntry): string => {
  const date = new Date(entry.created_at)
  const dateStr = date.toLocaleDateString([], {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return `${dateStr} at ${timeStr}\n\n${entry.content}`
}

const exportJournal = async (entries: JournalEntry[]): Promise<void> => {
  if (entries.length === 0) return

  const sorted = [...entries].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )

  const text = sorted.map(formatEntry).join('\n\n---\n\n')
  const header = `Reflect Journal — ${sorted.length} ${sorted.length === 1 ? 'entry' : 'entries'}\nExported ${new Date().toLocaleDateString()}\n\n${'='.repeat(40)}\n\n`

  await Share.share({ message: header + text, title: 'My Reflect Journal' })
}

export { exportJournal }
