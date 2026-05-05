import { getAnalytics } from '@react-native-firebase/analytics'
import { getApp } from '@react-native-firebase/app'

const analytics = getAnalytics(getApp())

export async function logJournalEntryCreated(wordCount: number) {
  await analytics.logEvent('journal_entry_created', { word_count: wordCount })
}

export async function logJournalEntryDeleted() {
  await analytics.logEvent('journal_entry_deleted', {})
}

export async function logScreenView(screenName: string) {
  await analytics.logEvent('screen_view', { screen_name: screenName, screen_class: screenName })
}
