
-- Helper security-definer para consultar se um usuário tem registro em base de determinado polo, evitando recursão entre políticas
CREATE OR REPLACE FUNCTION public.user_has_registro_no_polo(_user_id uuid, _polo polo_enum)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.registros r
    JOIN public.bases b ON b.id = r.base_id
    WHERE r.usuario_id = _user_id AND b.polo = _polo
  )
$$;

-- Reescreve política de registros usando funções security-definer (sem sub-select em profiles/bases)
DROP POLICY IF EXISTS "registros own read" ON public.registros;
CREATE POLICY "registros own read" ON public.registros
FOR SELECT TO authenticated
USING (
  usuario_id = auth.uid()
  OR has_role(auth.uid(), 'ADMIN_DISPATCH'::app_role)
  OR (
    has_role(auth.uid(), 'ADMIN_POLO'::app_role)
    AND (
      get_user_polo(usuario_id) = get_admin_polo(auth.uid())
      OR (base_id IS NOT NULL AND (SELECT polo FROM public.bases WHERE id = registros.base_id) = get_admin_polo(auth.uid()))
    )
  )
);

-- Reescreve política de profiles removendo o EXISTS sobre registros
DROP POLICY IF EXISTS "own profile read" ON public.profiles;
CREATE POLICY "own profile read" ON public.profiles
FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR has_role(auth.uid(), 'ADMIN_DISPATCH'::app_role)
  OR (has_role(auth.uid(), 'ADMIN_POLO'::app_role) AND polo = get_admin_polo(auth.uid()))
  OR (has_role(auth.uid(), 'ADMIN_POLO'::app_role) AND public.user_has_registro_no_polo(profiles.id, get_admin_polo(auth.uid())))
);
