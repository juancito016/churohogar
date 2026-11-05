delete from public.barrios b
where b.id in (
  '2a8ac0cc-edb4-40ca-a7cf-3205fa3d736f',
  '77b48694-0e38-4afd-8410-003af62776ab'
)
and not exists (
  select 1 from public.inmuebles i where i.barrio_id = b.id
);
