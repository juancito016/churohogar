alter table public.inmuebles
  drop constraint if exists inmuebles_barrio_id_fkey;

alter table public.inmuebles
  add constraint inmuebles_barrio_id_fkey
  foreign key (barrio_id) references public.barrios(id) on delete restrict;

alter table public.inmuebles
  alter column barrio_id set not null;

notify pgrst, 'reload schema';
