ALTER TABLE public.form_questions
  ADD COLUMN IF NOT EXISTS parent_chave text,
  ADD COLUMN IF NOT EXISTS parent_valores jsonb NOT NULL DEFAULT '[]'::jsonb;