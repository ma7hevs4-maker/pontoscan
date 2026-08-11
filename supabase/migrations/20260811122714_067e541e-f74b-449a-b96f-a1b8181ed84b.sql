ALTER TABLE public.equipe_areas ADD COLUMN IF NOT EXISTS ajustado boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.equipe_membros_override (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dia date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo'))::date,
  usuario_id uuid NOT NULL,
  prefixo text NOT NULL,
  polo public.polo_enum NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dia, usuario_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipe_membros_override TO authenticated;
GRANT ALL ON public.equipe_membros_override TO service_role;

ALTER TABLE public.equipe_membros_override ENABLE ROW LEVEL SECURITY;

CREATE POLICY "equipe_membros_override read" ON public.equipe_membros_override
FOR SELECT TO authenticated USING (true);

CREATE POLICY "equipe_membros_override admin write" ON public.equipe_membros_override
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'ADMIN_DISPATCH') OR (public.has_role(auth.uid(), 'ADMIN_POLO') AND polo = public.get_admin_polo(auth.uid())))
WITH CHECK (public.has_role(auth.uid(), 'ADMIN_DISPATCH') OR (public.has_role(auth.uid(), 'ADMIN_POLO') AND polo = public.get_admin_polo(auth.uid())));

CREATE TRIGGER trg_equipe_membros_override_touch
BEFORE UPDATE ON public.equipe_membros_override
FOR EACH ROW EXECUTE FUNCTION public.form_questions_touch();

CREATE OR REPLACE FUNCTION public.log_equipe_area()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.gerada THEN
      INSERT INTO public.equipe_area_logs (dia, prefixo, polo, acao, area_anterior, area_nova, gerada, usuario_id)
      VALUES (NEW.dia, NEW.prefixo, NEW.polo, 'EQUIPE_GERADA', NULL, NEW.area, NEW.gerada, auth.uid());
    ELSIF NEW.ajustado THEN
      INSERT INTO public.equipe_area_logs (dia, prefixo, polo, acao, area_anterior, area_nova, gerada, usuario_id)
      VALUES (NEW.dia, NEW.prefixo, NEW.polo, 'PREFIXO_AJUSTADO', NULL, NEW.area, NEW.gerada, auth.uid());
    ELSIF NEW.area IS NOT NULL THEN
      INSERT INTO public.equipe_area_logs (dia, prefixo, polo, acao, area_anterior, area_nova, gerada, usuario_id)
      VALUES (NEW.dia, NEW.prefixo, NEW.polo, 'AREA_DEFINIDA', NULL, NEW.area, NEW.gerada, auth.uid());
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.ajustado AND NOT OLD.ajustado THEN
      INSERT INTO public.equipe_area_logs (dia, prefixo, polo, acao, area_anterior, area_nova, gerada, usuario_id)
      VALUES (NEW.dia, NEW.prefixo, NEW.polo, 'PREFIXO_AJUSTADO', OLD.area, NEW.area, NEW.gerada, auth.uid());
    END IF;
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
END $function$;

REVOKE ALL ON FUNCTION public.log_equipe_area() FROM PUBLIC, anon, authenticated;