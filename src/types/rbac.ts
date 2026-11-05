/**
 * ADM-41 — Tipos del sistema de accesos (RBAC).
 * Los nombres llegan en snake_case desde las RPC; los hooks los normalizan.
 */

export type RolDeUsuario = {
    id: string;
    nombre: string;
    esSistema: boolean;
};

export type UsuarioAdmin = {
    userId: string;
    email: string;
    nombre: string | null;
    activo: boolean;
    roles: RolDeUsuario[];
    inmuebles: number;
    ultimoAcceso: string | null;
    creadoAt: string;
    esYo: boolean;
};

export type RolAdmin = {
    id: string;
    nombre: string;
    descripcion: string | null;
    esSistema: boolean;
    permisos: string[];
    usuarios: number;
};

export type PermisoAdmin = {
    clave: string;
    grupo: string;
    descripcion: string;
};

export type NuevoUsuario = {
    email: string;
    password: string;
    nombre: string;
    roleIds: string[];
};

/** `legacy` mantiene el comportamiento anterior si la RPC de permisos no responde. */
export const puedeHacer = (permisos: string[], clave: string, legacy = false) =>
    legacy || permisos.includes(clave);
