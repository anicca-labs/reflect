import { getAnalytics, logEvent } from '@react-native-firebase/analytics'
import { getApp } from '@react-native-firebase/app'

const analytics = getAnalytics(getApp())

const logJournalEntryCreated = async (wordCount: number) => {
  await logEvent(analytics, 'journal_entry_created', { word_count: wordCount })
}

const logJournalEntryDeleted = async () => {
  await logEvent(analytics, 'journal_entry_deleted', {})
}

const logScreenView = async (screenName: string) => {
  await logEvent(analytics, 'screen_view', { screen_name: screenName, screen_class: screenName })
}

export { logJournalEntryCreated, logJournalEntryDeleted, logScreenView }
