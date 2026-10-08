CREATE INDEX IF NOT EXISTS idx_registros_usuario_ts ON public.registros (usuario_id, "timestamp" DESC, id DESC);
CREATE OR REPLACE VIEW public.vw_incidentes_admin WITH (security_invoker = on) AS
SELECT i.id, i.usuario_id, i.prefixo, i.polo_eletricista, i.polo_prefixo, i.polo_geo, i.origem, i.tipo,
  i.numero_incidente, i.latitude, i.longitude, i.dados, i.fotos, i.created_at, i.parceira, i.nome_colaborador,
  COALESCE(j.prefixo_efetivo, i.prefixo) AS prefixo_efetivo
FROM public.incidentes i
LEFT JOIN LATERAL (
  SELECT COALESCE(r.prefixo_override, p.prefixo) AS prefixo_efetivo
  FROM public.registros r JOIN public.profiles p ON p.id = r.usuario_id
  WHERE r.usuario_id = i.usuario_id
    AND r."timestamp" >= ((i.created_at AT TIME ZONE 'America/Sao_Paulo')::date::timestamp AT TIME ZONE 'America/Sao_Paulo')
    AND r."timestamp" <  (((i.created_at AT TIME ZONE 'America/Sao_Paulo')::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
  ORDER BY r."timestamp" DESC, r.id DESC
  LIMIT 1
) j ON true;