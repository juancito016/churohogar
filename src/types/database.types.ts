/**
 * ============================================
 * TIPOS BÁSICOS DE LA BASE DE DATOS
 * ============================================
 */

/**
 * TipoPropiedad
 * Define los tipos de inmuebles permitidos en el sistema
 * - Casa: Vivienda unifamiliar
 * - Lote: Terreno sin construir
 * - Departamento: Vivienda en edificio
 */
export type TipoPropiedad = 'Casa' | 'Lote' | 'Departamento';

/**
 * Moneda
 * Tipo de divisa para los precios de inmuebles
 * - Bs: Bolivianos
 * - USD: Dólares estadounidenses
 */
export type Moneda = 'Bs' | 'USD';

/**
 * Operacion
 * Eje independiente del tipo de inmueble:
 * - Venta: se publica en USD
 * - Alquiler: se publica en Bs (importe mensual)
 */
export type Operacion = 'Venta' | 'Alquiler';

/**
 * EstadoInmueble
 * Estado del inmueble en el mercado
 * - Disponible: Propiedad lista para ser comprada o alquilada
 * - Vendido: Propiedad ya fue transada
 * - Alquilado: Alquiler ya cerrado
 * - Vencido: La publicación pasó su fecha y ya no se muestra al público
 */
export type EstadoInmueble = 'Disponible' | 'Vendido' | 'Alquilado' | 'Vencido';

// ============================================
// INTERFACES DE UBICACIONES GEOGRÁFICAS
// ============================================

/**
 * Departamento
 * Representa una región o departamento de Bolivia
 * Nivel más alto de la jerarquía geográfica
 * 
 * @interface Departamento
 * @property {string} id - Identificador único del departamento (UUID)
 * @property {string} nombre - Nombre del departamento (ej: "La Paz", "Cochabamba")
 * 
 * @example
 * const depto: Departamento = {
 *   id: "550e8400-e29b-41d4-a716-446655440000",
 *   nombre: "La Paz"
 * }
 */
export interface Departamento {
    id: string;
    nombre: string;
}

/**
 * Ciudad
 * Representa una ciudad dentro de un departamento
 * Nivel medio de la jerarquía geográfica
 * 
 * @interface Ciudad
 * @property {string} id - Identificador único de la ciudad (UUID)
 * @property {string} nombre - Nombre de la ciudad (ej: "La Paz", "El Alto")
 * @property {string} departamento_id - ID del departamento al que pertenece la ciudad
 * 
 * @example
 * const ciudad: Ciudad = {
 *   id: "660e8400-e29b-41d4-a716-446655440001",
 *   nombre: "La Paz",
 *   departamento_id: "550e8400-e29b-41d4-a716-446655440000"
 * }
 */
export interface Ciudad {
    id: string;
    nombre: string;
    departamento_id: string;
}

/**
 * Barrio
 * Representa un barrio o zona específica dentro de una ciudad
 * Nivel más bajo de la jerarquía geográfica
 * 
 * @interface Barrio
 * @property {string} id - Identificador único del barrio (UUID)
 * @property {string} nombre - Nombre del barrio (ej: "Sopocachi", "San Miguel")
 * @property {string} ciudad_id - ID de la ciudad a la que pertenece el barrio
 * 
 * @example
 * const barrio: Barrio = {
 *   id: "770e8400-e29b-41d4-a716-446655440002",
 *   nombre: "Sopocachi",
 *   ciudad_id: "660e8400-e29b-41d4-a716-446655440001"
 * }
 */
export interface Barrio {
    id: string;
    nombre: string;
    ciudad_id: string;
}

// ============================================
// INTERFACES PRINCIPALES DE INMUEBLES
// ============================================

/**
 * Inmueble
 * Representa una propiedad o inmueble en el sistema
 * Contiene todos los detalles del inmueble: descripción, precio, ubicación, características
 * 
 * @interface Inmueble
 * @property {string} id - Identificador único del inmueble (UUID)
 * @property {string} titulo - Título o nombre del inmueble (ej: "Casa moderna en Sopocachi")
 * @property {string} descripcion - Descripción detallada del inmueble
 * @property {TipoPropiedad} tipo_propiedad - Tipo de propiedad (Casa, Lote, Departamento)
 * @property {number} precio - Valor del inmueble
 * @property {Moneda} moneda - Moneda en que está el precio (Bs o USD)
 * @property {number} [superficie_terreno] - Superficie del terreno en m² (opcional)
 * @property {number} [superficie_construida] - Superficie construida en m² (opcional)
 * @property {number} habitaciones - Cantidad de habitaciones
 * @property {number} banos - Cantidad de baños
 * @property {string[]} servicios - Array de servicios disponibles (gas, agua, electricidad, internet, etc.)
 * @property {EstadoInmueble} estado - Estado actual del inmueble (Disponible o Vendido)
 * @property {string} [barrio_id] - ID del barrio donde se ubica el inmueble (opcional)
 * @property {string} admin_id - ID del administrador/vendedor que creó el inmueble
 * @property {string | null} [contacto] - Número de teléfono de contacto (opcional)
 * @property {string} creado_at - Fecha de creación en formato ISO (ej: "2024-05-02T10:30:00Z")
 * 
 * @example
 * const inmueble: Inmueble = {
 *   id: "880e8400-e29b-41d4-a716-446655440003",
 *   titulo: "Casa moderna en Sopocachi",
 *   descripcion: "Casa de 3 pisos con jardín",
 *   tipo_propiedad: "Casa",
 *   precio: 250000,
 *   moneda: "USD",
 *   superficie_terreno: 500,
 *   superficie_construida: 300,
 *   habitaciones: 4,
 *   banos: 3,
 *   servicios: ["gas", "agua", "electricidad", "internet"],
 *   estado: "Disponible",
 *   barrio_id: "770e8400-e29b-41d4-a716-446655440002",
 *   admin_id: "550e8400-e29b-41d4-a716-446655440010",
 *   contacto: "70012345",
 *   creado_at: "2024-05-02T10:30:00Z"
 * }
 */
export interface Inmueble {
    id: string;
    titulo: string;
    descripcion: string;
    tipo_propiedad: TipoPropiedad;
    operacion: Operacion;
    precio: number;
    moneda: Moneda;
    superficie_terreno?: number;
    superficie_construida?: number;
    habitaciones: number;
    banos: number;
    servicios: string[]; // jsonb will be parsed as string[] or similar
    estado: EstadoInmueble;
    barrio_id?: string;
    admin_id: string;
    contacto?: string | null;
    map_url?: string | null;
    slug?: string;
    creado_at: string; // ISO String
    /** Cuándo salió al público (se actualiza al crear, reactivar o renovar). */
    publicado_at?: string | null;
    /** Fin de la publicación; `null` = permanente. */
    expira_at?: string | null;
    /** Verdadero si el inmueble se muestra primero en el listado (Destacado). */
    destacado?: boolean;
    updated_at?: string; // ISO String
    deleted_at?: string | null; // ISO String; null si está activo
}

/**
 * Imagen
 * Representa una imagen asociada a un inmueble
 * Cada inmueble puede tener múltiples imágenes ordenadas
 * 
 * @interface Imagen
 * @property {string} id - Identificador único de la imagen (UUID)
 * @property {string} inmueble_id - ID del inmueble al que pertenece la imagen
 * @property {string} url_storage - URL de la imagen almacenada en Supabase Storage
 * @property {number} orden - Orden de visualización de la imagen (1, 2, 3, etc.)
 *                             La imagen con orden 1 es la portada principal
 * 
 * @example
 * const imagen: Imagen = {
 *   id: "990e8400-e29b-41d4-a716-446655440004",
 *   inmueble_id: "880e8400-e29b-41d4-a716-446655440003",
 *   url_storage: "https://stg.supabase.co/storage/v1/object/public/inmuebles/123/imagen-1.jpg",
 *   orden: 1
 * }
 */
export interface Imagen {
    id: string;
    inmueble_id: string;
    url_storage: string;
    orden: number;
}
