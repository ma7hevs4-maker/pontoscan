CREATE TABLE public.equipe_area_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dia date NOT NULL,
  prefixo text NOT NULL,
  polo public.polo_enum NOT NULL,
  acao text NOT NULL,
  area_anterior public.area_atuacao_enum,
  area_nova public.area_atuacao_enum,
  gerada boolean NOT NULL DEFAULT false,
  usuario_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.equipe_area_logs TO authenticated;
GRANT ALL ON public.equipe_area_logs TO service_role;

ALTER TABLE public.equipe_area_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "equipe_area_logs dispatch read" ON public.equipe_area_logs
FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'ADMIN_DISPATCH'));

CREATE OR REPLACE FUNCTION public.log_equipe_area()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.equipe_area_logs (dia, prefixo, polo, acao, area_anterior, area_nova, gerada, usuario_id)
    VALUES (NEW.dia, NEW.prefixo, NEW.polo, CASE WHEN NEW.gerada THEN 'EQUIPE_GERADA' ELSE 'AREA_DEFINIDA' END, NULL, NEW.area, NEW.gerada, auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.area IS DISTINCT FROM OLD.area THEN
      INSERT INTO public.equipe_area_logs (dia, prefixo, polo, acao, area_anterior, area_nova, gerada, usuario_id)
      VALUES (NEW.dia, NEW.prefixo, NEW.polo, CASE WHEN NEW.area IS NULL THEN 'AREA_REMOVIDA' ELSE 'AREA_ALTERADA' END, OLD.area, NEW.area, NEW.gerada, auth.uid());
    END IF;
    RETURN NEW;
  ELSE
    INSERT INTO public.equipe_area_logs (dia, prefixo, polo, acao, area_anterior, area_nova, gerada, usuario_id)
    VALUES (OLD.dia, OLD.prefixo, OLD.polo, CASE WHEN OLD.gerada THEN 'EQUIPE_EXCLUIDA' ELSE 'AREA_REMOVIDA' END, OLD.area, NULL, OLD.gerada, auth.uid());
    RETURN OLD;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.log_equipe_area() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_equipe_areas_log
AFTER INSERT OR UPDATE OR DELETE ON public.equipe_areas
FOR EACH ROW EXECUTE FUNCTION public.log_equipe_area();