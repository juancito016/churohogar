-- F4-08 — Red de seguridad de los embeddings.
--
-- Reindexa cada hora los inmuebles que no tienen vector o cuyo contenido cambió
-- sin pasar por el panel. NO usa `force`: solo toca los pendientes, así que en
-- régimen normal no gasta cuota de Gemini.
--
-- Antes de aplicar hay que crear dos secretos en Vault (no se versionan aquí):
--
--   select vault.create_secret('<service_role>', 'embedding_sync_token',
--                              'Token para el cron de embeddings');
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url',
--                              'URL del proyecto para el cron');
--
-- Si faltan, la función solo deja un aviso y no rompe nada.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.enqueue_embedding_sync()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    token    text;
    base_url text;
begin
    select decrypted_secret into token
    from vault.decrypted_secrets
    where name = 'embedding_sync_token';

    select decrypted_secret into base_url
    from vault.decrypted_secrets
    where name = 'project_url';

    if token is null or base_url is null then
        raise warning 'enqueue_embedding_sync: faltan embedding_sync_token / project_url en Vault; no se encola nada.';
        return;
    end if;

    perform net.http_post(
        url := base_url || '/functions/v1/sync-embeddings',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || token
        ),
        body := jsonb_build_object('limit', 100, 'batch_size', 5),
        timeout_milliseconds := 120000
    );
end;
$$;

comment on function public.enqueue_embedding_sync() is
    'F4-08: encola un reindexado de los embeddings pendientes (lo llama pg_cron).';

revoke all on function public.enqueue_embedding_sync() from public;
revoke all on function public.enqueue_embedding_sync() from anon;
revoke all on function public.enqueue_embedding_sync() from authenticated;

-- Idempotente: si el job ya existe, se reemplaza.
do $$
begin
    if exists (select 1 from cron.job where jobname = 'sync-embeddings-horario') then
        perform cron.unschedule('sync-embeddings-horario');
    end if;
end;
$$;

-- Cada hora, al minuto 7 (fuera de los picos redondos).
select cron.schedule(
    'sync-embeddings-horario',
    '7 * * * *',
    $$ select public.enqueue_embedding_sync(); $$
);
