interface WeeklyReflection {
  id: string;
  user_id: string;
  week_start: string;
  content: string | null;
  status: 'pending' | 'complete' | 'error';
  model: string;
  created_at: string;
}

export type { WeeklyReflection }
