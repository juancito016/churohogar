export type InmuebleTextSource = {
    titulo?: string | null;
    descripcion?: string | null;
    tipo_propiedad?: string | null;
    operacion?: string | null;
    precio?: number | string | null;
    moneda?: string | null;
    superficie_terreno?: number | string | null;
    superficie_construida?: number | string | null;
    habitaciones?: number | string | null;
    banos?: number | string | null;
    servicios?: string[] | null;
    barrio?: string | null;
    ciudad?: string | null;
    departamento?: string | null;
    barrios?: {
        nombre?: string | null;
        ciudades?: {
            nombre?: string | null;
            departamentos?: {
                nombre?: string | null;
            } | null;
        } | null;
    } | null;
};

const cleanText = (value?: string | null) =>
    (value ?? '').replace(/\s+/g, ' ').trim();

const toPositiveNumber = (value?: number | string | null) => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
};

const formatNumber = (value: number) =>
    Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));

const normalizeServicios = (servicios?: string[] | null) => {
    const unique = new Map<string, string>();

    for (const servicio of servicios ?? []) {
        const value = cleanText(servicio);
        if (!value) continue;

        const key = value.toLocaleLowerCase('es');
        if (!unique.has(key)) unique.set(key, value);
    }

    return [...unique.entries()]
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([, value]) => value);
};

export const buildInmuebleText = (inmueble: InmuebleTextSource) => {
    const lines: string[] = [];

    const titulo = cleanText(inmueble.titulo);
    if (titulo) lines.push(titulo);

    const tipo = cleanText(inmueble.tipo_propiedad);
    if (tipo) lines.push(`Tipo de inmueble: ${tipo}`);

    const operacion = cleanText(inmueble.operacion);
    if (operacion) lines.push(`Operación: ${operacion}`);

    const barrio = cleanText(inmueble.barrio ?? inmueble.barrios?.nombre);
    const ciudad = cleanText(inmueble.ciudad ?? inmueble.barrios?.ciudades?.nombre);
    const departamento = cleanText(
        inmueble.departamento ?? inmueble.barrios?.ciudades?.departamentos?.nombre
    );
    const ubicacion = [barrio, ciudad, departamento].filter(Boolean).join(', ');
    if (ubicacion) lines.push(`Ubicación: ${ubicacion}, Bolivia`);

    const precio = toPositiveNumber(inmueble.precio);
    if (precio !== null) {
        const moneda = cleanText(inmueble.moneda) || 'USD';
        const alMes = operacion.toLocaleLowerCase('es') === 'alquiler' ? ' al mes' : '';
        lines.push(`Precio: ${formatNumber(precio)} ${moneda}${alMes}`);
    }

    const terreno = toPositiveNumber(inmueble.superficie_terreno);
    if (terreno !== null) lines.push(`Terreno: ${formatNumber(terreno)} m²`);

    const construido = toPositiveNumber(inmueble.superficie_construida);
    if (construido !== null) lines.push(`Construido: ${formatNumber(construido)} m²`);

    const habitaciones = toPositiveNumber(inmueble.habitaciones);
    if (habitaciones !== null) lines.push(`Habitaciones: ${formatNumber(habitaciones)}`);

    const banos = toPositiveNumber(inmueble.banos);
    if (banos !== null) lines.push(`Baños: ${formatNumber(banos)}`);

    const servicios = normalizeServicios(inmueble.servicios);
    if (servicios.length > 0) lines.push(`Servicios: ${servicios.join(', ')}`);

    const descripcion = cleanText(inmueble.descripcion);
    if (descripcion) lines.push(`Descripción: ${descripcion}`);

    return lines.join('\n');
};
