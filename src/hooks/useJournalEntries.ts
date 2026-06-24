import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/src/services/supabase';
import { encryptContent, decryptContent, PREFIX } from '@/src/services/crypto';
import type { JournalEntry } from '@/src/types/journal';
import { useSessionStore } from '@/src/stores';

const QUERY_KEY = ['journal-entries'] as const;

const useJournalEntries = () => {
  const isAnonymous = useSessionStore((s) => s.isAnonymous);
  return useQuery({
    queryKey: QUERY_KEY,
    enabled: !isAnonymous,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('journal_entries')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const raw = data ?? [];

      // Background-migrate any plaintext entries left over from before encryption was added
      const toMigrate = raw.filter((e) => !e.content.startsWith(PREFIX));
      if (toMigrate.length > 0) {
        Promise.all(
          toMigrate.map(async (e) => {
            const encrypted = encryptContent(e.content);
            const { error } = await supabase
              .from('journal_entries')
              .update({ content: encrypted })
              .eq('id', e.id);
            if (error) console.error('[encrypt-migration] update failed:', error.message);
          }),
        ).catch((err) => console.error('[encrypt-migration] failed:', err));
      }

      return raw.map((e) => ({ ...e, content: decryptContent(e.content) })) as JournalEntry[];
    },
  });
};

const useCreateJournalEntry = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (content: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('journal_entries')
        .insert({ content: encryptContent(content), user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      const entry: JournalEntry = { ...data, content };
      return entry;
    },
    onSuccess: (newEntry) => {
      queryClient.setQueryData<JournalEntry[]>(QUERY_KEY, (old) => [newEntry, ...(old ?? [])]);
    },
  });
};

const useUpdateJournalEntry = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const { error } = await supabase
        .from('journal_entries')
        .update({ content: encryptContent(content), updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, content }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<JournalEntry[]>(QUERY_KEY);
      queryClient.setQueryData<JournalEntry[]>(QUERY_KEY, (old) =>
        (old ?? []).map((e) =>
          e.id === id ? { ...e, content, updated_at: new Date().toISOString() } : e,
        ),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(QUERY_KEY, ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
};

const useToggleBookmark = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_bookmarked }: { id: string; is_bookmarked: boolean }) => {
      const { error } = await supabase
        .from('journal_entries')
        .update({ is_bookmarked })
        .eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, is_bookmarked }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<JournalEntry[]>(QUERY_KEY);
      queryClient.setQueryData<JournalEntry[]>(QUERY_KEY, (old) =>
        (old ?? []).map((e) => (e.id === id ? { ...e, is_bookmarked } : e)),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(QUERY_KEY, ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
};

const useDeleteJournalEntry = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('journal_entries').delete().eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<JournalEntry[]>(QUERY_KEY);
      queryClient.setQueryData<JournalEntry[]>(QUERY_KEY, (old) =>
        (old ?? []).filter((e) => e.id !== id),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(QUERY_KEY, ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
};

export {
  useJournalEntries,
  useCreateJournalEntry,
  useUpdateJournalEntry,
  useToggleBookmark,
  useDeleteJournalEntry,
};
