import { useState, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/src/services/supabase';
import { decryptContent } from '@/src/services/crypto';
import { useSessionStore } from '@/src/stores';
import { format } from 'date-fns';
import { getDateLocale } from '@/src/utils/date';

// A weekly AI reflection, content decrypted for display.
export type Reflection = {
  id: string;
  body: string;
  entry_count: number;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  seen_at: string | null;
};

type GenerateResult = {
  status: 'ok' | 'limit' | 'not_enough' | 'error';
  reflection?: string;
  id?: string;
  entryCount?: number;
  message?: string;
};

const REFLECTIONS_KEY = ['reflections'];

// Read the signed-in user's reflections (RLS: own rows), decrypting each body.
const useReflections = () => {
  const isAnonymous = useSessionStore((s) => s.isAnonymous);
  return useQuery({
    queryKey: REFLECTIONS_KEY,
    enabled: !isAnonymous,
    queryFn: async (): Promise<Reflection[]> => {
      const { data, error } = await supabase
        .from('reflections')
        .select('id, content, entry_count, period_start, period_end, created_at, seen_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        body: decryptContent(r.content),
        entry_count: r.entry_count,
        period_start: r.period_start,
        period_end: r.period_end,
        created_at: r.created_at,
        seen_at: r.seen_at,
      }));
    },
  });
};

// Generate a reflection on demand (self path — the edge function reads the JWT).
// 'recent' reflects the most recent entries (used for testing without waiting for
// the Sunday window); 'week' is the last 7 days.
const useGenerateReflection = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mode: 'recent' | 'week' = 'recent'): Promise<GenerateResult> => {
      const { data, error } = await supabase.functions.invoke('generate-reflection', {
        body: { mode },
      });
      if (error) throw error;
      return data as GenerateResult;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: REFLECTIONS_KEY }),
  });
};

// Mark a reflection read (drives the "your week is ready" home banner).
const useMarkReflectionSeen = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('reflections').update({ seen_at: new Date().toISOString() }).eq('id', id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: REFLECTIONS_KEY }),
  });
};

// Account-level AI opt-in (consent). Auto-enabled on first self-generate; this
// hook powers the explicit Settings toggle (and lets users turn it off).
const AI_SETTING_KEY = ['user-settings', 'ai_reflections_enabled'];

const useAiReflectionsSetting = () => {
  const isAnonymous = useSessionStore((s) => s.isAnonymous);
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: AI_SETTING_KEY,
    enabled: !isAnonymous,
    queryFn: async (): Promise<boolean> => {
      const { data } = await supabase
        .from('user_settings')
        .select('ai_reflections_enabled')
        .maybeSingle();
      return data?.ai_reflections_enabled ?? false;
    },
  });
  const mutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const now = new Date().toISOString();
      // Only stamp ai_consent_at when enabling; on disable we omit it so a prior
      // consent timestamp is preserved.
      const row: {
        user_id: string;
        ai_reflections_enabled: boolean;
        updated_at: string;
        ai_consent_at?: string;
      } = { user_id: user.id, ai_reflections_enabled: enabled, updated_at: now };
      if (enabled) row.ai_consent_at = now;
      await supabase.from('user_settings').upsert(row, { onConflict: 'user_id' });
    },
    onMutate: async (enabled: boolean) => {
      await qc.cancelQueries({ queryKey: AI_SETTING_KEY });
      const prev = qc.getQueryData<boolean>(AI_SETTING_KEY);
      qc.setQueryData(AI_SETTING_KEY, enabled); // optimistic
      return { prev };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(AI_SETTING_KEY, ctx?.prev ?? false),
    onSettled: () => qc.invalidateQueries({ queryKey: AI_SETTING_KEY }),
  });
  return {
    enabled: query.data ?? false,
    isLoading: query.isLoading,
    setEnabled: mutation.mutate,
  };
};

// ── Reflection feedback: one-tap "did this feel true?" ──────────────────────
// Content-free quality metric (bare boolean, no text by design). One row per
// reflection, upsert so a changed mind overwrites.
const useReflectionFeedback = (reflectionId: string | null) => {
  const qc = useQueryClient();
  const key = ['reflection-feedback', reflectionId];
  const query = useQuery({
    queryKey: key,
    enabled: !!reflectionId,
    queryFn: async (): Promise<boolean | null> => {
      const { data } = await supabase
        .from('reflection_feedback')
        .select('felt_true')
        .eq('reflection_id', reflectionId!)
        .maybeSingle();
      return data ? (data.felt_true as boolean) : null;
    },
  });
  const mutation = useMutation({
    mutationFn: async (feltTrue: boolean) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !reflectionId) return;
      await supabase
        .from('reflection_feedback')
        .upsert(
          { reflection_id: reflectionId, user_id: user.id, felt_true: feltTrue },
          { onConflict: 'reflection_id' },
        );
    },
    onMutate: async (feltTrue: boolean) => {
      qc.setQueryData(key, feltTrue); // optimistic — instant "thanks"
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
  return { rating: query.data ?? null, rate: mutation.mutate };
};

// ── Entry echo: one warm AI line back after saving an entry ─────────────────
// The first-session taste of the AI. If the user has consented (ai setting on),
// every online save gets an echo. If not, the first save shows a one-time consent
// card; accepting turns the setting on (which also opts into Sunday reflections).
const ECHO_ASKED_KEY = 'entry-echo:asked';

const useEntryEcho = () => {
  const { enabled, setEnabled } = useAiReflectionsSetting();
  const [line, setLine] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [consentVisible, setConsentVisible] = useState(false);
  const pendingEntryId = useRef<string | null>(null);

  const fetchEcho = useCallback(async (entryId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-reflection', {
        body: { action: 'echo', entryId },
      });
      const res = data as { status?: string; line?: string } | null;
      if (!error && res?.status === 'ok' && res.line) setLine(res.line);
    } catch {
      // Echo is a garnish — never surface an error for it.
    } finally {
      setLoading(false);
    }
  }, []);

  // Call after a successful ONLINE save (queued/offline saves have no server row).
  const onSaved = useCallback(
    async (entryId: string) => {
      setLine(null);
      if (enabled) {
        fetchEcho(entryId);
        return;
      }
      const asked = await AsyncStorage.getItem(ECHO_ASKED_KEY);
      if (asked) return;
      pendingEntryId.current = entryId;
      setConsentVisible(true);
    },
    [enabled, fetchEcho],
  );

  const acceptConsent = useCallback(() => {
    setConsentVisible(false);
    AsyncStorage.setItem(ECHO_ASKED_KEY, '1');
    setEnabled(true);
    if (pendingEntryId.current) fetchEcho(pendingEntryId.current);
  }, [setEnabled, fetchEcho]);

  const declineConsent = useCallback(() => {
    setConsentVisible(false);
    AsyncStorage.setItem(ECHO_ASKED_KEY, '1');
  }, []);

  const dismissLine = useCallback(() => setLine(null), []);

  return { line, loading, consentVisible, onSaved, acceptConsent, declineConsent, dismissLine };
};

// Presentation metadata derived from a reflection's dates. relKey drives a
// translated "This week / Last week" label; older ones fall back to the date.
export type ReflectionMeta = {
  relKey: 'this-week' | 'last-week' | 'date';
  dateLabel: string;
  rangeLabel: string;
  preview: string;
};

const reflectionMeta = (r: Reflection): ReflectionMeta => {
  const loc = { locale: getDateLocale() };
  const created = new Date(r.created_at);
  const daysAgo = Math.floor((Date.now() - created.getTime()) / 86_400_000);
  const relKey: ReflectionMeta['relKey'] =
    daysAgo < 7 ? 'this-week' : daysAgo < 14 ? 'last-week' : 'date';
  const dateLabel = format(created, 'MMM d', loc);
  const rangeLabel =
    r.period_start && r.period_end
      ? `${format(new Date(r.period_start), 'MMM d', loc)} – ${format(new Date(r.period_end), 'd', loc)}`
      : dateLabel;
  // First sentence, no regex lookbehind (Hermes-safe).
  const idx = r.body.search(/[.?!](\s|$)/);
  const first = idx >= 0 ? r.body.slice(0, idx + 1) : r.body;
  const preview = first.length > 90 ? first.slice(0, 90).trim() + '…' : first;
  return { relKey, dateLabel, rangeLabel, preview };
};

export {
  useReflections,
  useGenerateReflection,
  useMarkReflectionSeen,
  useAiReflectionsSetting,
  useEntryEcho,
  useReflectionFeedback,
  reflectionMeta,
};
