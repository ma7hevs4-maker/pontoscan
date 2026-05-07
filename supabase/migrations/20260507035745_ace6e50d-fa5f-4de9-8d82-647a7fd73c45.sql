
-- Enums
CREATE TYPE public.polo_enum AS ENUM ('Magé','Niterói','São Gonçalo','Serrana','Sul','Campos','Lagos','Macaé','Noroeste');
CREATE TYPE public.app_role AS ENUM ('ELETRICISTA','ADMIN_POLO','ADMIN_DISPATCH');
CREATE TYPE public.etapa_enum AS ENUM ('PONTO','POS_DDS','SAIDA_BASE');

-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  prefixo TEXT NOT NULL UNIQUE,
  polo public.polo_enum NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT prefixo_format CHECK (prefixo ~ '^[A-Z]{2}[0-9]{3}[A-Z]{3}-[A-Z]$')
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- user_roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  polo public.polo_enum,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role, polo)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- bases
CREATE TABLE public.bases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  polo public.polo_enum NOT NULL,
  codigo_qr TEXT NOT NULL UNIQUE,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  raio_metros INTEGER NOT NULL DEFAULT 200,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bases ENABLE ROW LEVEL SECURITY;

-- registros
CREATE TABLE public.registros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  base_id UUID REFERENCES public.bases(id) ON DELETE SET NULL,
  etapa public.etapa_enum NOT NULL,
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT now(),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.registros ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_registros_usuario ON public.registros(usuario_id);
CREATE INDEX idx_registros_base ON public.registros(base_id);
CREATE INDEX idx_registros_timestamp ON public.registros("timestamp");
CREATE INDEX idx_registros_etapa ON public.registros(etapa);

-- Security definer helpers
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role)
$$;

CREATE OR REPLACE FUNCTION public.get_user_polo(_user_id UUID)
RETURNS public.polo_enum LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT polo FROM public.profiles WHERE id=_user_id
$$;

CREATE OR REPLACE FUNCTION public.get_admin_polo(_user_id UUID)
RETURNS public.polo_enum LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT polo FROM public.user_roles WHERE user_id=_user_id AND role='ADMIN_POLO' LIMIT 1
$$;

-- RLS profiles
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid()
    OR public.has_role(auth.uid(),'ADMIN_DISPATCH')
    OR (public.has_role(auth.uid(),'ADMIN_POLO') AND polo = public.get_admin_polo(auth.uid())));
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());

-- RLS user_roles (read only — managed via service role)
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'ADMIN_DISPATCH'));

-- RLS bases
CREATE POLICY "bases read" ON public.bases FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "bases admin write" ON public.bases FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'ADMIN_DISPATCH')
    OR (public.has_role(auth.uid(),'ADMIN_POLO') AND polo = public.get_admin_polo(auth.uid())))
  WITH CHECK (public.has_role(auth.uid(),'ADMIN_DISPATCH')
    OR (public.has_role(auth.uid(),'ADMIN_POLO') AND polo = public.get_admin_polo(auth.uid())));

-- RLS registros
CREATE POLICY "registros own read" ON public.registros FOR SELECT TO authenticated
  USING (usuario_id = auth.uid()
    OR public.has_role(auth.uid(),'ADMIN_DISPATCH')
    OR (public.has_role(auth.uid(),'ADMIN_POLO')
        AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=usuario_id AND p.polo = public.get_admin_polo(auth.uid()))));
CREATE POLICY "registros own insert" ON public.registros FOR INSERT TO authenticated
  WITH CHECK (usuario_id = auth.uid());

-- Validation trigger: server timestamp + flow rules
CREATE OR REPLACE FUNCTION public.validar_registro()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  ultima public.etapa_enum;
BEGIN
  -- Sempre usar timestamp do servidor
  NEW."timestamp" := now();

  SELECT etapa INTO ultima
    FROM public.registros
   WHERE usuario_id = NEW.usuario_id
     AND "timestamp"::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date
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
END $$;

CREATE TRIGGER trg_validar_registro BEFORE INSERT ON public.registros
  FOR EACH ROW EXECUTE FUNCTION public.validar_registro();

-- View vw_tempos
CREATE VIEW public.vw_tempos
WITH (security_invoker=true) AS
SELECT
  r.usuario_id,
  p.nome,
  p.prefixo,
  p.polo,
  (r."timestamp" AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
  MIN(r."timestamp") FILTER (WHERE r.etapa='PONTO') AS ponto,
  MIN(r."timestamp") FILTER (WHERE r.etapa='POS_DDS') AS pos_dds,
  MIN(r."timestamp") FILTER (WHERE r.etapa='SAIDA_BASE') AS saida_base,
  EXTRACT(EPOCH FROM (MIN(r."timestamp") FILTER (WHERE r.etapa='POS_DDS') - MIN(r."timestamp") FILTER (WHERE r.etapa='PONTO')))/60 AS tempo_ponto_pos_dds,
  EXTRACT(EPOCH FROM (MIN(r."timestamp") FILTER (WHERE r.etapa='SAIDA_BASE') - MIN(r."timestamp") FILTER (WHERE r.etapa='POS_DDS')))/60 AS tempo_pos_dds_saida
FROM public.registros r
JOIN public.profiles p ON p.id = r.usuario_id
GROUP BY r.usuario_id, p.nome, p.prefixo, p.polo, (r."timestamp" AT TIME ZONE 'America/Sao_Paulo')::date;

-- Trigger: criar profile + role ELETRICISTA no signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.raw_user_meta_data ? 'prefixo' THEN
    INSERT INTO public.profiles (id, nome, prefixo, polo)
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data->>'nome',
      NEW.raw_user_meta_data->>'prefixo',
      (NEW.raw_user_meta_data->>'polo')::public.polo_enum
    );
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'ELETRICISTA');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
