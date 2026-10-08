CREATE INDEX IF NOT EXISTS idx_registros_timestamp ON public.registros (timestamp);
CREATE INDEX IF NOT EXISTS idx_incidentes_created_at ON public.incidentes (created_at);