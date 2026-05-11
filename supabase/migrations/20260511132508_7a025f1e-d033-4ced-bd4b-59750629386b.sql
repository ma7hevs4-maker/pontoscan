ALTER PUBLICATION supabase_realtime ADD TABLE public.registros;
ALTER TABLE public.registros REPLICA IDENTITY FULL;