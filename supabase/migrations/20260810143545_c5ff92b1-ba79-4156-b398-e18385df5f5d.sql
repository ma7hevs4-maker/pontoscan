ALTER TABLE public.equipe_area_logs ADD COLUMN IF NOT EXISTS numero_incidente text;

CREATE TABLE public.equipe_incidentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dia date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo'))::date,
  prefixo text NOT NULL,
  polo polo_enum NOT NULL,
  numero_incidente text NOT NULL,
  usuario_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dia, prefixo, polo, numero_incidente)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipe_incidentes TO authenticated;
GRANT ALL ON public.equipe_incidentes TO service_role;

ALTER TABLE public.equipe_incidentes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "equipe_incidentes read" ON public.equipe_incidentes
FOR SELECT TO authenticated USING (true);

CREATE POLICY "equipe_incidentes admin write" ON public.equipe_incidentes
FOR ALL TO authenticated
USING (has_role(auth.uid(),'ADMIN_DISPATCH'::app_role) OR (has_role(auth.uid(),'ADMIN_POLO'::app_role) AND polo = get_admin_polo(auth.uid())))
WITH CHECK (has_role(auth.uid(),'ADMIN_DISPATCH'::app_role) OR (has_role(auth.uid(),'ADMIN_POLO'::app_role) AND polo = get_admin_polo(auth.uid())));

CREATE OR REPLACE FUNCTION public.log_equipe_incidente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.equipe_area_logs (dia, prefixo, polo, acao, numero_incidente, usuario_id)
    VALUES (NEW.dia, NEW.prefixo, NEW.polo, 'INCIDENTE_ATRIBUIDO', NEW.numero_incidente, auth.uid());
    RETURN NEW;
  ELSE
    INSERT INTO public.equipe_area_logs (dia, prefixo, polo, acao, numero_incidente, usuario_id)
    VALUES (OLD.dia, OLD.prefixo, OLD.polo, 'INCIDENTE_REMOVIDO', OLD.numero_incidente, auth.uid());
    RETURN OLD;
  END IF;
END $$;

CREATE TRIGGER trg_equipe_incidentes_log
AFTER INSERT OR DELETE ON public.equipe_incidentes
FOR EACH ROW EXECUTE FUNCTION public.log_equipe_incidente();