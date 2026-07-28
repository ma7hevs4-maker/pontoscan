
DO $$ BEGIN
  CREATE TYPE public.tipo_incidente_enum AS ENUM ('ATENDIMENTO_INDIVIDUAL','ORDEM_2','IMPRODUTIVO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.origem_incidente_enum AS ENUM ('INSOURCING','PARCEIRA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.incidentes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  prefixo text NOT NULL,
  polo_eletricista public.polo_enum,
  polo_prefixo public.polo_enum,
  polo_geo public.polo_enum,
  origem public.origem_incidente_enum NOT NULL DEFAULT 'INSOURCING',
  tipo public.tipo_incidente_enum NOT NULL,
  numero_incidente text NOT NULL,
  latitude double precision,
  longitude double precision,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  fotos text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_incidentes_created_at ON public.incidentes (created_at DESC);
CREATE INDEX idx_incidentes_usuario ON public.incidentes (usuario_id);
CREATE INDEX idx_incidentes_polos ON public.incidentes (polo_eletricista, polo_prefixo, polo_geo);

GRANT SELECT, INSERT ON public.incidentes TO authenticated;
GRANT ALL ON public.incidentes TO service_role;

ALTER TABLE public.incidentes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "incidentes own insert" ON public.incidentes
FOR INSERT TO authenticated
WITH CHECK (usuario_id = auth.uid());

CREATE POLICY "incidentes read" ON public.incidentes
FOR SELECT TO authenticated
USING (
  usuario_id = auth.uid()
  OR has_role(auth.uid(), 'ADMIN_DISPATCH'::app_role)
  OR (
    has_role(auth.uid(), 'ADMIN_POLO'::app_role)
    AND (
      polo_eletricista = get_admin_polo(auth.uid())
      OR polo_prefixo = get_admin_polo(auth.uid())
      OR polo_geo = get_admin_polo(auth.uid())
    )
  )
);

-- Storage policies: pasta = usuario_id do uploader; leitura por autenticados
CREATE POLICY "incidentes-fotos auth read" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'incidentes-fotos');

CREATE POLICY "incidentes-fotos auth upload" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'incidentes-fotos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
