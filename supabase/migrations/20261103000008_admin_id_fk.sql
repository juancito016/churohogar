-- FK de auditoría del creador (`inmuebles.admin_id`).
--
-- Hasta ahora `admin_id` era solo un uuid suelto: si se borraba la cuenta del
-- administrador, los inmuebles quedaban apuntando a un usuario inexistente.
-- Se enlaza con `auth.users` y, al borrar la cuenta, el inmueble se conserva
-- sin dueño (`ON DELETE SET NULL`) en vez de bloquear el borrado o perderse.
--
-- `admin_id` pasa a admitir NULL por el `SET NULL`; el alta desde el panel
-- sigue exigiendo `admin_id = auth.uid()` por la política RLS de INSERT.

alter table public.inmuebles
    alter column admin_id drop not null;

alter table public.inmuebles
    drop constraint if exists inmuebles_admin_id_fkey;

alter table public.inmuebles
    add constraint inmuebles_admin_id_fkey
    foreign key (admin_id) references auth.users (id)
    on delete set null;

create index if not exists idx_inmuebles_admin_id
    on public.inmuebles (admin_id);

comment on column public.inmuebles.admin_id is
    'Administrador que creó el inmueble (auditoría). Queda NULL si se borra la cuenta.';
