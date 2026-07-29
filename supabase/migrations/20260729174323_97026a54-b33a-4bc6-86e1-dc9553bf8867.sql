CREATE TABLE public.form_questions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo tipo_incidente_enum NOT NULL,
  chave text NOT NULL,
  rotulo text NOT NULL,
  campo_tipo text NOT NULL CHECK (campo_tipo IN ('text','textarea','choice')),
  opcoes jsonb NOT NULL DEFAULT '[]'::jsonb,
  obrigatoria boolean NOT NULL DEFAULT false,
  ordem integer NOT NULL DEFAULT 0,
  ativa boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (tipo, chave)
);

GRANT SELECT ON public.form_questions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_questions TO authenticated;
GRANT ALL ON public.form_questions TO service_role;

ALTER TABLE public.form_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "form_questions leitura pública"
  ON public.form_questions FOR SELECT
  USING (true);

CREATE POLICY "form_questions dispatch insert"
  ON public.form_questions FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'ADMIN_DISPATCH'));

CREATE POLICY "form_questions dispatch update"
  ON public.form_questions FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'ADMIN_DISPATCH'))
  WITH CHECK (public.has_role(auth.uid(), 'ADMIN_DISPATCH'));

CREATE POLICY "form_questions dispatch delete"
  ON public.form_questions FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'ADMIN_DISPATCH'));

CREATE OR REPLACE FUNCTION public.form_questions_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_form_questions_touch
BEFORE UPDATE ON public.form_questions
FOR EACH ROW EXECUTE FUNCTION public.form_questions_touch();