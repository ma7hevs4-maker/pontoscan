CREATE TYPE public.area_atuacao_enum AS ENUM ('BT','MT_RAMAL','MT_TRONCO');

CREATE TABLE public.equipe_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dia date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date),
  prefixo text NOT NULL,
  polo public.polo_enum NOT NULL,
  area public.area_atuacao_enum NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dia, prefixo, polo)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipe_areas TO authenticated;
GRANT ALL ON public.equipe_areas TO service_role;

ALTER TABLE public.equipe_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "equipe_areas read" ON public.equipe_areas
FOR SELECT TO authenticated USING (true);

CREATE POLICY "equipe_areas admin write" ON public.equipe_areas
FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'ADMIN_DISPATCH') OR (public.has_role(auth.uid(),'ADMIN_POLO') AND polo = public.get_admin_polo(auth.uid())))
WITH CHECK (public.has_role(auth.uid(),'ADMIN_DISPATCH') OR (public.has_role(auth.uid(),'ADMIN_POLO') AND polo = public.get_admin_polo(auth.uid())));

CREATE TRIGGER trg_equipe_areas_touch BEFORE UPDATE ON public.equipe_areas
FOR EACH ROW EXECUTE FUNCTION public.form_questions_touch();