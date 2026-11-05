update public.inmuebles
set contacto = '59164303730'
where contacto is null or btrim(contacto) = '';
