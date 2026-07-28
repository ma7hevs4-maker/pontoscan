
-- 1) Revoke EXECUTE on SECURITY DEFINER helpers from anon/public
REVOKE EXECUTE ON FUNCTION public.get_user_polo(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_polo(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_has_registro_no_polo(uuid, public.polo_enum) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_polo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_polo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_registro_no_polo(uuid, public.polo_enum) TO authenticated;

-- 2) Validate prefixo_override format
ALTER TABLE public.registros
  ADD CONSTRAINT registros_prefixo_override_format
  CHECK (prefixo_override IS NULL OR (
    length(prefixo_override) <= 12 AND prefixo_override ~ '^[A-Z]{2}[0-9]{3}[A-Z]{3}-[A-Z]$'
  )) NOT VALID;

-- 3) Restrict incident photo reads to uploader (folder = user id) or admins
DROP POLICY IF EXISTS "incidentes-fotos auth read" ON storage.objects;
CREATE POLICY "incidentes-fotos read owner or admin"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'incidentes-fotos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'ADMIN_DISPATCH'::public.app_role)
    OR public.has_role(auth.uid(), 'ADMIN_POLO'::public.app_role)
  )
);
