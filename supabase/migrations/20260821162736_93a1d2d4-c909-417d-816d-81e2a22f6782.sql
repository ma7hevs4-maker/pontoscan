CREATE TABLE public.form_tipos (
  chave text PRIMARY KEY,
  rotulo text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  builtin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.form_tipos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_tipos TO authenticated;
GRANT ALL ON public.form_tipos TO service_role;

ALTER TABLE public.form_tipos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "form_tipos leitura pública" ON public.form_tipos FOR SELECT USING (true);
CREATE POLICY "form_tipos dispatch insert" ON public.form_tipos FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'ADMIN_DISPATCH'::app_role));
CREATE POLICY "form_tipos dispatch update" ON public.form_tipos FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'ADMIN_DISPATCH'::app_role)) WITH CHECK (has_role(auth.uid(), 'ADMIN_DISPATCH'::app_role));
CREATE POLICY "form_tipos dispatch delete" ON public.form_tipos FOR DELETE TO authenticated USING (has_role(auth.uid(), 'ADMIN_DISPATCH'::app_role) AND builtin = false);

INSERT INTO public.form_tipos (chave, rotulo, ordem, builtin) VALUES
  ('ATENDIMENTO_INDIVIDUAL', 'Atendimento Individual', 0, true),
  ('ORDEM_2', 'Ordem 2', 1, true),
  ('IMPRODUTIVO', 'Improdutivo', 2, true);

ALTER TABLE public.form_questions ALTER COLUMN tipo TYPE text USING tipo::text;
ALTER TABLE public.incidentes ALTER COLUMN tipo TYPE text USING tipo::text;