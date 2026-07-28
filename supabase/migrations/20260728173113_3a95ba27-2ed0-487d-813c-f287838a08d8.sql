
-- 1) novos polos
ALTER TYPE public.polo_enum ADD VALUE IF NOT EXISTS 'Perdas';
ALTER TYPE public.polo_enum ADD VALUE IF NOT EXISTS 'Comercial';

COMMIT;

-- 2) recriar vw_tempos incluindo base_polo
DROP VIEW IF EXISTS public.vw_tempos;
CREATE VIEW public.vw_tempos
WITH (security_invoker = true)
AS
WITH agg AS (
  SELECT
    r.usuario_id,
    (r."timestamp" AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
    min(r."timestamp") FILTER (WHERE r.etapa = 'PONTO')      AS ponto,
    min(r."timestamp") FILTER (WHERE r.etapa = 'POS_DDS')    AS pos_dds,
    min(r."timestamp") FILTER (WHERE r.etapa = 'SAIDA_BASE') AS saida_base,
    (array_agg(r.base_id) FILTER (WHERE r.etapa = 'PONTO' AND r.base_id IS NOT NULL))[1] AS base_id
  FROM public.registros r
  GROUP BY r.usuario_id, ((r."timestamp" AT TIME ZONE 'America/Sao_Paulo')::date)
)
SELECT
  a.usuario_id,
  p.nome,
  p.prefixo,
  p.polo,
  b.polo AS base_polo,
  a.dia,
  a.ponto,
  a.pos_dds,
  a.saida_base,
  EXTRACT(epoch FROM (a.pos_dds - a.ponto))/60::numeric      AS tempo_ponto_pos_dds,
  EXTRACT(epoch FROM (a.saida_base - a.pos_dds))/60::numeric AS tempo_pos_dds_saida
FROM agg a
JOIN public.profiles p ON p.id = a.usuario_id
LEFT JOIN public.bases b ON b.id = a.base_id;

GRANT SELECT ON public.vw_tempos TO authenticated;

-- 3) visão de registros com polo do eletricista + polo da base
DROP VIEW IF EXISTS public.vw_registros_admin;
CREATE VIEW public.vw_registros_admin
WITH (security_invoker = true)
AS
SELECT
  r.id,
  r.usuario_id,
  r.etapa,
  r."timestamp",
  r.latitude,
  r.longitude,
  r.prefixo_override,
  r.base_id,
  p.nome,
  p.prefixo,
  p.polo       AS user_polo,
  b.nome       AS base_nome,
  b.polo       AS base_polo
FROM public.registros r
JOIN public.profiles p ON p.id = r.usuario_id
LEFT JOIN public.bases b ON b.id = r.base_id;

GRANT SELECT ON public.vw_registros_admin TO authenticated;

-- 4) RLS: admin de polo também vê registros cuja BASE é do polo dele
DROP POLICY IF EXISTS "registros own read" ON public.registros;
CREATE POLICY "registros own read" ON public.registros
FOR SELECT TO authenticated
USING (
  usuario_id = auth.uid()
  OR public.has_role(auth.uid(), 'ADMIN_DISPATCH')
  OR (
    public.has_role(auth.uid(), 'ADMIN_POLO') AND (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = registros.usuario_id AND p.polo = public.get_admin_polo(auth.uid()))
      OR EXISTS (SELECT 1 FROM public.bases b WHERE b.id = registros.base_id AND b.polo = public.get_admin_polo(auth.uid()))
    )
  )
);

-- 5) RLS: admin de polo também lê perfil de eletricista que registrou em base do polo dele
DROP POLICY IF EXISTS "own profile read" ON public.profiles;
CREATE POLICY "own profile read" ON public.profiles
FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR public.has_role(auth.uid(), 'ADMIN_DISPATCH')
  OR (public.has_role(auth.uid(), 'ADMIN_POLO') AND polo = public.get_admin_polo(auth.uid()))
  OR (
    public.has_role(auth.uid(), 'ADMIN_POLO') AND EXISTS (
      SELECT 1 FROM public.registros r
      JOIN public.bases b ON b.id = r.base_id
      WHERE r.usuario_id = profiles.id
        AND b.polo = public.get_admin_polo(auth.uid())
    )
  )
);
