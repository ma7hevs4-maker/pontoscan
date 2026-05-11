ALTER TABLE public.registros DROP CONSTRAINT registros_usuario_id_fkey;
ALTER TABLE public.registros
  ADD CONSTRAINT registros_usuario_id_fkey
  FOREIGN KEY (usuario_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
NOTIFY pgrst, 'reload schema';