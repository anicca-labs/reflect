import type { JournalEntry } from '@/src/types/journal'

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

export function computeStreak(entries: JournalEntry[]): number {
  if (entries.length === 0) return 0

  const daysWithEntry = new Set(entries.map(e => dayKey(new Date(e.created_at))))

  let streak = 0
  const cursor = new Date()

  while (daysWithEntry.has(dayKey(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }

  return streak
}

export function useStreak(entries: JournalEntry[]): number {
  return computeStreak(entries)
}
