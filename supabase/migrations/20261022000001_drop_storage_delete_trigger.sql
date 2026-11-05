-- Supabase bloquea el borrado directo en storage.objects con storage.protect_delete().
-- El trigger anterior fallaba silenciosamente y dejaba el archivo físico huérfano.
-- El borrado de archivos se hace ahora desde el cliente con la Storage API.

drop trigger if exists trigger_delete_photo_on_storage on public.imagenes;
drop function if exists public.delete_storage_object();

notify pgrst, 'reload schema';
