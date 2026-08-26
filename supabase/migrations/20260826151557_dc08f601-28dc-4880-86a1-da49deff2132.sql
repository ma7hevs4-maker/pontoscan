ALTER TABLE public.solicitacoes_senha ADD COLUMN IF NOT EXISTS polo public.polo_enum;

CREATE OR REPLACE FUNCTION public.solicitacoes_senha_set_polo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.polo IS NULL THEN
    SELECT p.polo INTO NEW.polo
    FROM public.profiles p
    WHERE upper(p.prefixo) = upper(NEW.prefixo)
    ORDER BY p.ativo DESC, p.created_at DESC
    LIMIT 1;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_solicitacoes_senha_polo ON public.solicitacoes_senha;
CREATE TRIGGER trg_solicitacoes_senha_polo
BEFORE INSERT ON public.solicitacoes_senha
FOR EACH ROW EXECUTE FUNCTION public.solicitacoes_senha_set_polo();

UPDATE public.solicitacoes_senha s
SET polo = p.polo
FROM public.profiles p
WHERE s.polo IS NULL AND upper(p.prefixo) = upper(s.prefixo);

DROP POLICY IF EXISTS "solicitacoes senha admin read" ON public.solicitacoes_senha;
CREATE POLICY "solicitacoes senha admin read"
ON public.solicitacoes_senha FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'ADMIN_DISPATCH'::app_role)
  OR (has_role(auth.uid(), 'ADMIN_POLO'::app_role) AND (polo IS NULL OR polo = get_admin_polo(auth.uid())))
);

DROP POLICY IF EXISTS "solicitacoes senha admin update" ON public.solicitacoes_senha;
CREATE POLICY "solicitacoes senha admin update"
ON public.solicitacoes_senha FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'ADMIN_DISPATCH'::app_role)
  OR (has_role(auth.uid(), 'ADMIN_POLO'::app_role) AND (polo IS NULL OR polo = get_admin_polo(auth.uid())))
)
WITH CHECK (
  has_role(auth.uid(), 'ADMIN_DISPATCH'::app_role)
  OR (has_role(auth.uid(), 'ADMIN_POLO'::app_role) AND (polo IS NULL OR polo = get_admin_polo(auth.uid())))
);