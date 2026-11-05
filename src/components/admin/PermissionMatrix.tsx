/**
 * ADM-41 — Matriz de permisos por rol.
 * Los permisos se agrupan por categoría y se marcan con checkboxes.
 */

import React, { useMemo } from 'react';
import type { PermisoAdmin } from '../../types/rbac';

interface PermissionMatrixProps {
    permisos: PermisoAdmin[];
    seleccionados: string[];
    onChange: (siguientes: string[]) => void;
    disabled?: boolean;
}

export const PermissionMatrix: React.FC<PermissionMatrixProps> = ({
    permisos,
    seleccionados,
    onChange,
    disabled = false,
}) => {
    const grupos = useMemo(() => {
        const mapa = new Map<string, PermisoAdmin[]>();

        permisos.forEach(permiso => {
            const lista = mapa.get(permiso.grupo) ?? [];
            lista.push(permiso);
            mapa.set(permiso.grupo, lista);
        });

        return Array.from(mapa.entries());
    }, [permisos]);

    const toggle = (clave: string) => {
        if (disabled) return;

        onChange(
            seleccionados.includes(clave)
                ? seleccionados.filter(item => item !== clave)
                : [...seleccionados, clave]
        );
    };

    const toggleGrupo = (claves: string[], marcar: boolean) => {
        if (disabled) return;

        const resto = seleccionados.filter(clave => !claves.includes(clave));
        onChange(marcar ? [...resto, ...claves] : resto);
    };

    return (
        <div className="space-y-4">
            {grupos.map(([grupo, items]) => {
                const elegidos = items.filter(item => seleccionados.includes(item.clave));
                const todos = elegidos.length === items.length;

                return (
                    <fieldset
                        key={grupo}
                        disabled={disabled}
                        className="rounded-2xl border border-admin-border p-4 disabled:opacity-60"
                    >
                        <legend className="px-2 text-sm font-black text-admin-text">{grupo}</legend>

                        <div className="mb-3 flex items-center justify-between gap-3">
                            <span className="text-xs font-semibold text-admin-muted">
                                {elegidos.length} de {items.length}
                            </span>
                            {!disabled && (
                                <button
                                    type="button"
                                    onClick={() => toggleGrupo(items.map(item => item.clave), !todos)}
                                    className="text-xs font-bold text-admin-accent hover:underline"
                                >
                                    {todos ? 'Quitar todos' : 'Marcar todos'}
                                </button>
                            )}
                        </div>

                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                            {items.map(item => (
                                <label
                                    key={item.clave}
                                    className="flex cursor-pointer items-start gap-2 rounded-lg px-1 py-1 text-sm hover:bg-admin-surface-2"
                                >
                                    <input
                                        type="checkbox"
                                        checked={seleccionados.includes(item.clave)}
                                        onChange={() => toggle(item.clave)}
                                        disabled={disabled}
                                        className="mt-0.5 h-4 w-4 shrink-0 accent-admin-accent"
                                    />
                                    <span>
                                        <span className="font-semibold text-admin-text">{item.descripcion}</span>
                                        <code className="block text-[11px] text-admin-muted">{item.clave}</code>
                                    </span>
                                </label>
                            ))}
                        </div>
                    </fieldset>
                );
            })}
        </div>
    );
};
