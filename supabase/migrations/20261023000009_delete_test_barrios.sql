delete from public.barrios b
where b.id in (
  '56c1c15f-471b-41a0-aa3c-769844bea669',
  'b128a982-bdba-476a-b7a7-44b1ea55e130',
  'd88a7af3-e045-4d50-b885-ea4a5eef843a',
  '56dad71e-8fd4-4879-9970-bf633a6678a5',
  '6b1753b8-379e-4cb4-b676-a1e3c73294aa',
  'ac44f340-f953-4711-ab57-093ab481b85d',
  'd22c1a1d-b884-42ef-87c6-74aaf957de17'
)
and not exists (
  select 1 from public.inmuebles i where i.barrio_id = b.id
);
