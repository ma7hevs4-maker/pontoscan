CREATE TABLE public.app_settings (
  chave text PRIMARY KEY,
  valor boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_settings TO authenticated;
GRANT SELECT ON public.app_settings TO anon;
GRANT INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_settings read" ON public.app_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "app_settings dispatch insert" ON public.app_settings FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'ADMIN_DISPATCH'::app_role));
CREATE POLICY "app_settings dispatch update" ON public.app_settings FOR UPDATE TO authenticated USING (has_role(auth.uid(),'ADMIN_DISPATCH'::app_role)) WITH CHECK (has_role(auth.uid(),'ADMIN_DISPATCH'::app_role));
INSERT INTO public.app_settings (chave, valor) VALUES ('forms_enabled', true);