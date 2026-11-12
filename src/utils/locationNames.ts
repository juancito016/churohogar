/**
 * Comparación de nombres de ubicaciones (departamentos, ciudades y barrios).
 *
 * Refleja la regla de la base (`public.normalize_nombre`): minúsculas, sin
 * tildes y con los espacios colapsados. Así el formulario puede avisar de un
 * duplicado antes de enviar el insert y el índice único nunca sorprende.
 */

export const normalizeLocationName = (valor: string) =>
    (valor ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

/** Deja el nombre listo para guardar: sin extremos y con espacios simples. */
export const formatLocationName = (valor: string) =>
    (valor ?? '').replace(/\s+/g, ' ').trim();

/** Distancia de Levenshtein, para avisar de un nombre casi idéntico. */
const distanciaEdicion = (a: string, b: string) => {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    let previa = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const actual = [i];
        for (let j = 1; j <= b.length; j++) {
            actual[j] = Math.min(
                previa[j] + 1,
                actual[j - 1] + 1,
                previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
        }
        previa = actual;
    }
    return previa[b.length];
};

/**
 * Devuelve el nombre existente más parecido al escrito, si está a un typo de
 * distancia. Sirve para avisar antes de crear un barrio casi duplicado
 * (“San Blass” frente a “San Blas”). Los nombres muy cortos exigen coincidencia
 * exacta porque a 3-4 letras todo se parece a todo.
 */
export const findSimilarLocationName = (existentes: string[], valor: string): string | null => {
    const clave = normalizeLocationName(valor);
    if (clave.length < 4) return null;

    const umbral = clave.length <= 8 ? 1 : 2;
    let mejor: { nombre: string; distancia: number } | null = null;

    existentes.forEach(nombre => {
        const otra = normalizeLocationName(nombre);
        if (!otra || otra === clave) return;
        // Un sufijo o una palabra más (“Tablada” / “Tabladita”, “San Blas” /
        // “San Blas 2”) suele ser otro barrio real, no un typo.
        if (Math.abs(otra.length - clave.length) > 1) return;
        const distancia = distanciaEdicion(clave, otra);
        if (distancia <= umbral && (!mejor || distancia < mejor.distancia)) {
            mejor = { nombre, distancia };
        }
    });

    return (mejor as { nombre: string } | null)?.nombre ?? null;
};
