CREATE TABLE public.equipe_telefones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prefixo text NOT NULL,
  polo public.polo_enum NOT NULL,
  telefone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prefixo, polo)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipe_telefones TO authenticated;
GRANT ALL ON public.equipe_telefones TO service_role;

ALTER TABLE public.equipe_telefones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "equipe_telefones read" ON public.equipe_telefones
FOR SELECT TO authenticated USING (true);

CREATE POLICY "equipe_telefones admin write" ON public.equipe_telefones
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'ADMIN_DISPATCH'::app_role) OR (has_role(auth.uid(), 'ADMIN_POLO'::app_role) AND polo = get_admin_polo(auth.uid())))
WITH CHECK (has_role(auth.uid(), 'ADMIN_DISPATCH'::app_role) OR (has_role(auth.uid(), 'ADMIN_POLO'::app_role) AND polo = get_admin_polo(auth.uid())));

CREATE TRIGGER trg_equipe_telefones_touch BEFORE UPDATE ON public.equipe_telefones
FOR EACH ROW EXECUTE FUNCTION public.form_questions_touch();