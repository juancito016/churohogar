-- Script SQL para Supabase de la plataforma Churo Hogar
-- Se crearán las tablas, enums y RLS.

-- ENUMS
CREATE TYPE tipo_propiedad_enum AS ENUM ('Casa', 'Lote');
CREATE TYPE moneda_enum AS ENUM ('Bs', 'USD');
CREATE TYPE estado_inmueble_enum AS ENUM ('Disponible', 'Vendido');

-- UBICACION: DEPARTAMENTOS
CREATE TABLE public.departamentos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre text NOT NULL
);

-- UBICACION: CIUDADES
CREATE TABLE public.ciudades (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre text NOT NULL,
  departamento_id uuid REFERENCES public.departamentos(id) ON DELETE CASCADE
);

-- UBICACION: BARRIOS
CREATE TABLE public.barrios (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre text NOT NULL,
  ciudad_id uuid REFERENCES public.ciudades(id) ON DELETE CASCADE
);

-- INMUEBLES
CREATE TABLE public.inmuebles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo text NOT NULL,
  descripcion text NOT NULL,
  tipo_propiedad tipo_propiedad_enum NOT NULL,
  precio numeric NOT NULL,
  moneda moneda_enum NOT NULL,
  superficie_terreno numeric,
  superficie_construida numeric,
  habitaciones integer DEFAULT 0,
  banos integer DEFAULT 0,
  servicios jsonb DEFAULT '[]'::jsonb,
  estado estado_inmueble_enum DEFAULT 'Disponible',
  barrio_id uuid REFERENCES public.barrios(id) ON DELETE SET NULL,
  admin_id uuid NOT NULL, -- referencia a auth.users (ID del admin)
  creado_at timestamp with time zone DEFAULT now()
);

-- IMAGENES
CREATE TABLE public.imagenes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  inmueble_id uuid REFERENCES public.inmuebles(id) ON DELETE CASCADE,
  url_storage text NOT NULL,
  orden integer DEFAULT 0
);

-- CONFIGURACIÓN DE RLS (Row Level Security)
ALTER TABLE public.departamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ciudades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barrios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inmuebles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imagenes ENABLE ROW LEVEL SECURITY;

-- Políticas de lectura pública: Cualquiera puede ver los datos
CREATE POLICY "Public Read Departamentos" ON public.departamentos FOR SELECT USING (true);
CREATE POLICY "Public Read Ciudades" ON public.ciudades FOR SELECT USING (true);
CREATE POLICY "Public Read Barrios" ON public.barrios FOR SELECT USING (true);
CREATE POLICY "Public Read Inmuebles" ON public.inmuebles FOR SELECT USING (true);
CREATE POLICY "Public Read Imagenes" ON public.imagenes FOR SELECT USING (true);

-- Políticas de escritura: Solo usuarios autenticados (tu admin_id)
-- En este caso verificamos si el usuario actual que invoca la consulta es el creador o está autenticado.
-- Para simplificar, permitimos CRUD solo si el usuario que inserta/modifica tiene sesión iniciada.

CREATE POLICY "Auth Insert Departamentos" ON public.departamentos FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth Update Departamentos" ON public.departamentos FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Auth Delete Departamentos" ON public.departamentos FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Auth Insert Ciudades" ON public.ciudades FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth Update Ciudades" ON public.ciudades FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Auth Delete Ciudades" ON public.ciudades FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Auth Insert Barrios" ON public.barrios FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth Update Barrios" ON public.barrios FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Auth Delete Barrios" ON public.barrios FOR DELETE USING (auth.role() = 'authenticated');

-- Para inmuebles forzamos que el auth.uid() coincida con el admin_id (el creador)
CREATE POLICY "Admin Insert Inmuebles" ON public.inmuebles FOR INSERT WITH CHECK (auth.uid() = admin_id);
CREATE POLICY "Admin Update Inmuebles" ON public.inmuebles FOR UPDATE USING (auth.uid() = admin_id);
CREATE POLICY "Admin Delete Inmuebles" ON public.inmuebles FOR DELETE USING (auth.uid() = admin_id);

CREATE POLICY "Auth Insert Imagenes" ON public.imagenes FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth Update Imagenes" ON public.imagenes FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Auth Delete Imagenes" ON public.imagenes FOR DELETE USING (auth.role() = 'authenticated');

-- NOTA: Además se necesita un Storage Bucket para las imágenes en Supabase.
-- Nombre recomendado: 'inmuebles' (Público) con RLS permitiendo INSERT al usuario autenticado.


-- Permitir que usuarios autenticados suban archivos
CREATE POLICY "Permitir subida a usuarios autenticados" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (bucket_id = 'fotos-inmuebles');

-- Permitir que usuarios autenticados borren archivos (ESTA ES LA QUE TE FALTA)
CREATE POLICY "Permitir borrado a usuarios autenticados" 
ON storage.objects FOR DELETE 
TO authenticated 
USING (bucket_id = 'fotos-inmuebles');



-- 1. Creamos una función que se encargue de la lógica de borrado
CREATE OR REPLACE FUNCTION public.delete_storage_object()
RETURNS TRIGGER AS $$
BEGIN
  -- Esta línea le dice a Supabase que busque el archivo por su nombre y lo borre
  -- El path se extrae de la columna 'url_storage' de tu tabla imagenes
  DELETE FROM storage.objects 
  WHERE bucket_id = 'fotos-inmuebles' 
  AND name = OLD.url_storage;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Creamos el Trigger que se activa CADA VEZ que borras una fila en 'imagenes'
CREATE TRIGGER trigger_delete_photo_on_storage
AFTER DELETE ON public.imagenes
FOR EACH ROW
EXECUTE FUNCTION public.delete_storage_object();


-- Añade el campo para el contacto directo de cada inmueble
ALTER TABLE public.inmuebles 
ADD COLUMN whatsapp_contacto text;

-- INDICES PARA BUSQUEDAS RAPIDAS Y FILTROS (Tipos y Precio)
CREATE INDEX IF NOT EXISTS idx_inmuebles_tipo_propiedad ON inmuebles(tipo_propiedad);
CREATE INDEX IF NOT EXISTS idx_inmuebles_precio ON inmuebles(precio);
