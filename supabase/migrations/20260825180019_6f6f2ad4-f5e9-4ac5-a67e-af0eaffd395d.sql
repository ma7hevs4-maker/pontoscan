DROP VIEW IF EXISTS public.vw_tempos;
DROP VIEW IF EXISTS public.vw_registros_admin;

CREATE VIEW public.vw_registros_admin
WITH (security_invoker = true)
AS
WITH registros_com_prefixo AS (
  SELECT
    r.*,
    first_value(COALESCE(r.prefixo_override, p.prefixo)) OVER (
      PARTITION BY r.usuario_id, ((r."timestamp" AT TIME ZONE 'America/Sao_Paulo')::date)
      ORDER BY r."timestamp" DESC, r.id DESC
    ) AS prefixo_efetivo
  FROM public.registros r
  JOIN public.profiles p ON p.id = r.usuario_id
)
SELECT
  r.id,
  r.usuario_id,
  r.etapa,
  r."timestamp",
  r.latitude,
  r.longitude,
  r.prefixo_override,
  r.prefixo_efetivo,
  r.base_id,
  p.nome,
  p.prefixo,
  p.polo AS user_polo,
  b.nome AS base_nome,
  b.polo AS base_polo
FROM registros_com_prefixo r
JOIN public.profiles p ON p.id = r.usuario_id
LEFT JOIN public.bases b ON b.id = r.base_id;

GRANT SELECT ON public.vw_registros_admin TO authenticated;

CREATE VIEW public.vw_tempos
WITH (security_invoker = true)
AS
WITH ranked AS (
  SELECT
    r.*,
    (r."timestamp" AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
    first_value(COALESCE(r.prefixo_override, p.prefixo)) OVER (
      PARTITION BY r.usuario_id, ((r."timestamp" AT TIME ZONE 'America/Sao_Paulo')::date)
      ORDER BY r."timestamp" DESC, r.id DESC
    ) AS prefixo_efetivo
  FROM public.registros r
  JOIN public.profiles p ON p.id = r.usuario_id
), agg AS (
  SELECT
    usuario_id,
    dia,
    max(prefixo_efetivo) AS prefixo,
    min("timestamp") FILTER (WHERE etapa = 'PONTO') AS ponto,
    min("timestamp") FILTER (WHERE etapa = 'POS_DDS') AS pos_dds,
    min("timestamp") FILTER (WHERE etapa = 'SAIDA_BASE') AS saida_base,
    (array_agg(base_id ORDER BY "timestamp") FILTER (WHERE etapa = 'PONTO' AND base_id IS NOT NULL))[1] AS base_id
  FROM ranked
  GROUP BY usuario_id, dia
)
SELECT
  a.usuario_id,
  p.nome,
  a.prefixo,
  p.polo,
  b.polo AS base_polo,
  a.dia,
  a.ponto,
  a.pos_dds,
  a.saida_base,
  EXTRACT(epoch FROM (a.pos_dds - a.ponto))/60::numeric AS tempo_ponto_pos_dds,
  EXTRACT(epoch FROM (a.saida_base - a.pos_dds))/60::numeric AS tempo_pos_dds_saida
FROM agg a
JOIN public.profiles p ON p.id = a.usuario_id
LEFT JOIN public.bases b ON b.id = a.base_id;

GRANT SELECT ON public.vw_tempos TO authenticated;

CREATE OR REPLACE VIEW public.vw_incidentes_admin
WITH (security_invoker = true)
AS
SELECT
  i.*,
  COALESCE(j.prefixo_efetivo, i.prefixo) AS prefixo_efetivo
FROM public.incidentes i
LEFT JOIN LATERAL (
  SELECT COALESCE(r.prefixo_override, p.prefixo) AS prefixo_efetivo
  FROM public.registros r
  JOIN public.profiles p ON p.id = r.usuario_id
  WHERE r.usuario_id = i.usuario_id
    AND (r."timestamp" AT TIME ZONE 'America/Sao_Paulo')::date = (i.created_at AT TIME ZONE 'America/Sao_Paulo')::date
  ORDER BY r."timestamp" DESC, r.id DESC
  LIMIT 1
) j ON true;

GRANT SELECT ON public.vw_incidentes_admin TO authenticated;