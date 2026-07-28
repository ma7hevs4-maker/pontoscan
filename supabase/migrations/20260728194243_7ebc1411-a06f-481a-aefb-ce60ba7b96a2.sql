
ALTER TABLE public.incidentes
  ADD COLUMN IF NOT EXISTS parceira text,
  ADD COLUMN IF NOT EXISTS nome_colaborador text;
