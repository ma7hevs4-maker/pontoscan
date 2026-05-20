CREATE OR REPLACE FUNCTION public.validar_registro()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  ultima public.etapa_enum;
BEGIN
  NEW."timestamp" := now();

  SELECT etapa INTO ultima
    FROM public.registros
   WHERE usuario_id = NEW.usuario_id
     AND ("timestamp" AT TIME ZONE 'America/Sao_Paulo')::date
         = (now() AT TIME ZONE 'America/Sao_Paulo')::date
   ORDER BY "timestamp" DESC LIMIT 1;

  IF ultima IS NOT NULL AND ultima = NEW.etapa THEN
    RAISE EXCEPTION 'Etapa % já registrada hoje', NEW.etapa;
  END IF;

  IF NEW.etapa = 'POS_DDS' AND (ultima IS NULL OR ultima <> 'PONTO') THEN
    RAISE EXCEPTION 'POS_DDS exige PONTO prévio no dia';
  END IF;

  IF NEW.etapa = 'SAIDA_BASE' AND (ultima IS NULL OR ultima <> 'POS_DDS') THEN
    RAISE EXCEPTION 'SAIDA_BASE exige POS_DDS prévio';
  END IF;

  RETURN NEW;
END $function$;