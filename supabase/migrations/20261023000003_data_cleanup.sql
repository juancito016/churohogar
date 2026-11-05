update public.barrios b
set nombre = v.nuevo
from (
  values
    ('san blas', 'San Blas'),
    ('san blas2', 'San Blas 2'),
    ('mira flores', 'Miraflores'),
    ('tablada', 'Tablada'),
    ('tablada sud', 'Tablada Sud'),
    ('6 de junnio', '6 de Junio'),
    ('fatima', 'Fátima'),
    ('27 de mayo', '27 de Mayo'),
    ('azucarero', 'Azucarero'),
    ('moto mendez', 'Moto Méndez')
) as v(anterior, nuevo),
public.ciudades c,
public.departamentos d
where c.id = b.ciudad_id
  and d.id = c.departamento_id
  and d.nombre = 'Tarija'
  and lower(b.nombre) = v.anterior;

insert into public.ciudades (departamento_id, nombre)
select d.id, 'San Lorenzo'
from public.departamentos d
where d.nombre = 'Tarija'
  and not exists (
    select 1
    from public.ciudades c
    where c.departamento_id = d.id
      and lower(c.nombre) = 'san lorenzo'
  );

insert into public.barrios (ciudad_id, nombre)
select c.id, v.nombre
from (
  values
    ('Tarija', 'Las Panosas'),
    ('Tarija', 'El Molino'),
    ('Tarija', 'Aranjuez'),
    ('Tarija', 'La Pampa'),
    ('Tarija', 'San Roque'),
    ('Tarija', 'Juan XXIII'),
    ('Tarija', 'San Martín'),
    ('Tarija', 'El Tejar'),
    ('Tarija', 'Senac'),
    ('Tarija', 'Guadalquivir'),
    ('Yacuiba', 'San José de Pocitos'),
    ('Yacuiba', 'La Cruz'),
    ('Yacuiba', 'El Carmen'),
    ('Yacuiba', 'Los Lapachos'),
    ('Yacuiba', 'San Francisco'),
    ('Bermejo', 'Centro'),
    ('Bermejo', 'San José'),
    ('Bermejo', 'La Florida'),
    ('Bermejo', 'Las Palmas'),
    ('San Lorenzo', 'Centro'),
    ('San Lorenzo', 'San Antonio'),
    ('San Lorenzo', 'La Loma')
) as v(ciudad, nombre)
join public.ciudades c on lower(c.nombre) = lower(v.ciudad)
join public.departamentos d on d.id = c.departamento_id and d.nombre = 'Tarija'
where not exists (
  select 1
  from public.barrios b
  where b.ciudad_id = c.id
    and lower(b.nombre) = lower(v.nombre)
);

insert into public.inmuebles (
  slug, titulo, descripcion, tipo_propiedad, precio, moneda,
  superficie_terreno, superficie_construida, habitaciones, banos,
  servicios, estado, barrio_id, admin_id, contacto, map_url
)
select
  v.slug,
  v.titulo,
  v.descripcion,
  v.tipo::public.tipo_propiedad_enum,
  v.precio,
  v.moneda::public.moneda_enum,
  v.superficie_terreno,
  v.superficie_construida,
  v.habitaciones,
  v.banos,
  v.servicios::jsonb,
  'Disponible'::public.estado_inmueble_enum,
  b.id,
  '2ee5e1cf-6de3-4692-b6e4-99498cf01abe'::uuid,
  null,
  v.map_url
from (
  values
    (
      'casa-san-blas-tarija',
      'Casa familiar en San Blas',
      'Casa familiar de 3 dormitorios en San Blas, con patio, garaje y ambientes luminosos. Se encuentra a pocas cuadras del centro de Tarija y cuenta con agua, electricidad, gas y alcantarillado. Ubicación referencial sujeta a confirmación.',
      'Casa', 165000, 'USD', 420, 220, 3, 2,
      '["agua","electricidad","gas","alcantarillado","internet"]',
      'Tarija', 'San Blas',
      'https://www.google.com/maps/search/?api=1&query=Barrio%20San%20Blas%2C%20Tarija%2C%20Bolivia'
    ),
    (
      'lote-las-panosas-tarija',
      'Lote urbano en Las Panosas',
      'Lote urbano de 500 m² en Las Panosas, en zona residencial consolidada y con acceso vehicular. Ideal para construir una vivienda familiar o un proyecto de inversión. Cuenta con agua y electricidad en el sector. Ubicación referencial sujeta a confirmación.',
      'Lote', 55000, 'USD', 500, null, 0, 0,
      '["agua","electricidad"]',
      'Tarija', 'Las Panosas',
      'https://www.google.com/maps/search/?api=1&query=Barrio%20Las%20Panosas%2C%20Tarija%2C%20Bolivia'
    ),
    (
      'departamento-miraflores-tarija',
      'Departamento en Miraflores',
      'Departamento de 2 dormitorios en Miraflores, con balcón, cocina equipada y un baño completo. El edificio se encuentra cerca de comercios, transporte y áreas verdes. Servicios de agua, electricidad y gas disponibles. Ubicación referencial sujeta a confirmación.',
      'Departamento', 78000, 'USD', null, 95, 2, 2,
      '["agua","electricidad","gas","alcantarillado"]',
      'Tarija', 'Miraflores',
      'https://www.google.com/maps/search/?api=1&query=Barrio%20Miraflores%2C%20Tarija%2C%20Bolivia'
    ),
    (
      'casa-el-molino-tarija',
      'Casa con jardín en El Molino',
      'Casa de 4 dormitorios en El Molino, con jardín, garaje para dos vehículos y espacio para ampliar. Zona tranquila y cercana a colegios y transporte público. Incluye agua, electricidad, gas e internet. Ubicación referencial sujeta a confirmación.',
      'Casa', 195000, 'USD', 600, 280, 4, 3,
      '["agua","electricidad","gas","alcantarillado","internet"]',
      'Tarija', 'El Molino',
      'https://www.google.com/maps/search/?api=1&query=Barrio%20El%20Molino%2C%20Tarija%2C%20Bolivia'
    ),
    (
      'casa-san-jose-de-pocitos-yacuiba',
      'Casa en San José de Pocitos',
      'Casa de 3 dormitorios en San José de Pocitos, Yacuiba, con patio y garaje. Se ubica cerca de la frontera y de servicios comerciales, ideal para familias o inversión. Cuenta con agua, electricidad y alcantarillado. Ubicación referencial sujeta a confirmación.',
      'Casa', 72000, 'USD', 400, 180, 3, 2,
      '["agua","electricidad","alcantarillado"]',
      'Yacuiba', 'San José de Pocitos',
      'https://www.google.com/maps/search/?api=1&query=Barrio%20San%20Jos%C3%A9%20de%20Pocitos%2C%20Yacuiba%2C%20Bolivia'
    ),
    (
      'lote-la-cruz-yacuiba',
      'Lote en La Cruz',
      'Lote de 600 m² en La Cruz, Yacuiba, con acceso a calle y espacio para construcción. Zona en crecimiento, apta para vivienda o inversión a mediano plazo. Servicios básicos disponibles en el sector. Ubicación referencial sujeta a confirmación.',
      'Lote', 28000, 'USD', 600, null, 0, 0,
      '["agua","electricidad"]',
      'Yacuiba', 'La Cruz',
      'https://www.google.com/maps/search/?api=1&query=Barrio%20La%20Cruz%2C%20Yacuiba%2C%20Bolivia'
    ),
    (
      'casa-centro-bermejo',
      'Casa céntrica en Bermejo',
      'Casa de 3 dormitorios en el centro de Bermejo, con patio, garaje y ambientes amplios. Cerca de comercios, transporte y servicios públicos. Incluye agua, electricidad, gas y alcantarillado. Ubicación referencial sujeta a confirmación.',
      'Casa', 65000, 'USD', 350, 200, 3, 2,
      '["agua","electricidad","gas","alcantarillado"]',
      'Bermejo', 'Centro',
      'https://www.google.com/maps/search/?api=1&query=Centro%2C%20Bermejo%2C%20Tarija%2C%20Bolivia'
    ),
    (
      'lote-la-florida-bermejo',
      'Lote en La Florida',
      'Lote de 450 m² en La Florida, Bermejo, con acceso vehicular y terreno plano. Ideal para construir una vivienda familiar o desarrollar un emprendimiento. Agua y electricidad disponibles en la zona. Ubicación referencial sujeta a confirmación.',
      'Lote', 22000, 'USD', 450, null, 0, 0,
      '["agua","electricidad"]',
      'Bermejo', 'La Florida',
      'https://www.google.com/maps/search/?api=1&query=Barrio%20La%20Florida%2C%20Bermejo%2C%20Bolivia'
    ),
    (
      'casa-centro-san-lorenzo',
      'Casa en el centro de San Lorenzo',
      'Casa de 3 dormitorios en el centro de San Lorenzo, con patio, garaje y buena iluminación natural. Se encuentra cerca de la plaza principal y de servicios básicos. Incluye agua, electricidad y alcantarillado. Ubicación referencial sujeta a confirmación.',
      'Casa', 58000, 'USD', 500, 160, 3, 2,
      '["agua","electricidad","alcantarillado"]',
      'San Lorenzo', 'Centro',
      'https://www.google.com/maps/search/?api=1&query=Centro%2C%20San%20Lorenzo%2C%20Tarija%2C%20Bolivia'
    ),
    (
      'lote-san-antonio-san-lorenzo',
      'Lote en San Antonio',
      'Lote de 700 m² en San Antonio, San Lorenzo, con acceso a camino y entorno tranquilo. Apto para vivienda familiar, cultivo o inversión. Cuenta con agua y electricidad en el sector. Ubicación referencial sujeta a confirmación.',
      'Lote', 25000, 'USD', 700, null, 0, 0,
      '["agua","electricidad"]',
      'San Lorenzo', 'San Antonio',
      'https://www.google.com/maps/search/?api=1&query=Barrio%20San%20Antonio%2C%20San%20Lorenzo%2C%20Tarija%2C%20Bolivia'
    )
) as v(
  slug, titulo, descripcion, tipo, precio, moneda,
  superficie_terreno, superficie_construida, habitaciones, banos,
  servicios, ciudad, barrio, map_url
)
join public.ciudades c on lower(c.nombre) = lower(v.ciudad)
join public.departamentos d on d.id = c.departamento_id and d.nombre = 'Tarija'
join public.barrios b on b.ciudad_id = c.id and lower(b.nombre) = lower(v.barrio)
where not exists (
  select 1 from public.inmuebles i where i.slug = v.slug
);
