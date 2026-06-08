ALTER TABLE api.device_tokens
  ADD COLUMN IF NOT EXISTS firebase_project_id TEXT NOT NULL DEFAULT 'reflect-8e62d';
