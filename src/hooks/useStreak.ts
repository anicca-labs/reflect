import type { JournalEntry } from '@/src/types/journal'

const dayKey = (date: Date): string =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`

const computeStreak = (entries: JournalEntry[]): number => {
  if (entries.length === 0) return 0

  const daysWithEntry = new Set(entries.map(e => dayKey(new Date(e.created_at))))

  let streak = 0
  const cursor = new Date()

  if (!daysWithEntry.has(dayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1)
  }

  while (daysWithEntry.has(dayKey(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }

  return streak
}

const useStreak = (entries: JournalEntry[]): number => computeStreak(entries)

export { computeStreak, useStreak }
