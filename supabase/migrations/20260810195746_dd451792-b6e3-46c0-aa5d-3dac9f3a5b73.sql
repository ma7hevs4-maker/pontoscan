ALTER TABLE public.equipe_incidentes
  ADD COLUMN IF NOT EXISTS ponto_eletrico text,
  ADD COLUMN IF NOT EXISTS alimentador text;