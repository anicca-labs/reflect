import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/src/services/supabase'
import type { JournalEntry } from '@/src/types/journal'

const QUERY_KEY = ['journal-entries'] as const

export function useJournalEntries() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('journal_entries')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as JournalEntry[]
    },
  })
}

export function useCreateJournalEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (content: string) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('journal_entries')
        .insert({ content, user_id: user.id })
        .select()
        .single()
      if (error) throw error
      return data as JournalEntry
    },
    onMutate: async (content) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY })
      const previous = queryClient.getQueryData<JournalEntry[]>(QUERY_KEY)
      const optimistic: JournalEntry = {
        id: `temp-${Date.now()}`,
        user_id: '',
        content,
        is_bookmarked: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      queryClient.setQueryData<JournalEntry[]>(QUERY_KEY, (old) => [optimistic, ...(old ?? [])])
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(QUERY_KEY, ctx.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export function useUpdateJournalEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const { error } = await supabase
        .from('journal_entries')
        .update({ content, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, content }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY })
      const previous = queryClient.getQueryData<JournalEntry[]>(QUERY_KEY)
      queryClient.setQueryData<JournalEntry[]>(QUERY_KEY, (old) =>
        (old ?? []).map((e) =>
          e.id === id ? { ...e, content, updated_at: new Date().toISOString() } : e,
        ),
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(QUERY_KEY, ctx.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export function useToggleBookmark() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, is_bookmarked }: { id: string; is_bookmarked: boolean }) => {
      const { error } = await supabase
        .from('journal_entries')
        .update({ is_bookmarked })
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, is_bookmarked }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY })
      const previous = queryClient.getQueryData<JournalEntry[]>(QUERY_KEY)
      queryClient.setQueryData<JournalEntry[]>(QUERY_KEY, (old) =>
        (old ?? []).map((e) => e.id === id ? { ...e, is_bookmarked } : e),
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(QUERY_KEY, ctx.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export function useDeleteJournalEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('journal_entries').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY })
      const previous = queryClient.getQueryData<JournalEntry[]>(QUERY_KEY)
      queryClient.setQueryData<JournalEntry[]>(QUERY_KEY, (old) =>
        (old ?? []).filter((e) => e.id !== id),
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(QUERY_KEY, ctx.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}
