CREATE TABLE public.solicitacoes_senha (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prefixo text NOT NULL,
  nome text NOT NULL,
  status text NOT NULL DEFAULT 'PENDENTE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  atendido_por uuid,
  atendido_em timestamptz
);

GRANT INSERT ON public.solicitacoes_senha TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.solicitacoes_senha TO authenticated;
GRANT ALL ON public.solicitacoes_senha TO service_role;

ALTER TABLE public.solicitacoes_senha ENABLE ROW LEVEL SECURITY;

CREATE POLICY "solicitacoes senha public insert" ON public.solicitacoes_senha
  FOR INSERT TO anon, authenticated WITH CHECK (status = 'PENDENTE');

CREATE POLICY "solicitacoes senha admin read" ON public.solicitacoes_senha
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'ADMIN_DISPATCH'::app_role) OR has_role(auth.uid(), 'ADMIN_POLO'::app_role));

CREATE POLICY "solicitacoes senha admin update" ON public.solicitacoes_senha
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'ADMIN_DISPATCH'::app_role) OR has_role(auth.uid(), 'ADMIN_POLO'::app_role))
  WITH CHECK (has_role(auth.uid(), 'ADMIN_DISPATCH'::app_role) OR has_role(auth.uid(), 'ADMIN_POLO'::app_role));

CREATE POLICY "solicitacoes senha dispatch delete" ON public.solicitacoes_senha
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'ADMIN_DISPATCH'::app_role));

CREATE TRIGGER trg_solicitacoes_senha_touch BEFORE UPDATE ON public.solicitacoes_senha
  FOR EACH ROW EXECUTE FUNCTION public.form_questions_touch();