/**
 * PropertyCard Component
 *
 * Tarjeta compacta que muestra un inmueble con:
 * - Imagen portada (lazy, aspect-ratio fijo)
 * - Precio formateado
 * - Tipo de propiedad + nº de fotos
 * - Características (habitaciones, baños, superficie)
 * - Ubicación (ciudad, departamento)
 * - Botón de contacto WhatsApp
 * - Interacción: enlace real al detalle (SEO + click medio)
 */

import React from 'react';
import { FaWhatsapp, FaBed, FaBath, FaRulerCombined, FaCamera } from 'react-icons/fa';
import { MdStar } from 'react-icons/md';
import type { Inmueble } from '../types/database.types';
import { useBusinessConfig } from '../hooks/useBusinessConfig';

/**
 * Props para el componente PropertyCard
 *
 * @interface PropertyCardProps
 * @property {Inmueble & { portadaUrl?: string }} inmueble - Objeto del inmueble a mostrar
 *           Contiene todos los datos del inmueble + URL de imagen portada
 *
 * @description
 * La propiedad `portadaUrl` es opcional y contiene la URL de la primera imagen.
 * Si no existe, se muestra un placeholder "Sin Imagen"
 */
interface BarrioRelacion {
    ciudades?: {
        nombre?: string;
        departamentos?: { nombre?: string };
    };
}

interface ImagenRelacion {
    url_storage: string;
    orden?: number | null;
}

interface PropertyCardProps {
    inmueble: Inmueble & { portadaUrl?: string; imagenes?: ImagenRelacion[]; barrios?: BarrioRelacion };
}

export const PropertyCard: React.FC<PropertyCardProps> = ({ inmueble }) => {
    const { config } = useBusinessConfig();
    const esAlquiler = inmueble.operacion === 'Alquiler';

    const formatearPrecio = (precio: number, moneda: string) => {
        return new Intl.NumberFormat('es-BO', { style: 'currency', currency: moneda === 'Bs' ? 'BOB' : 'USD' }).format(precio);
    };

    const contactarWhatsapp = (e: React.MouseEvent) => {
        e.stopPropagation();
        let phoneStr = inmueble.contacto ? inmueble.contacto.replace(/\D/g, '') : config.whatsapp;
        if (phoneStr && !phoneStr.startsWith('591') && phoneStr.length <= 8) {
            phoneStr = '591' + phoneStr;
        }
        if (!phoneStr) phoneStr = config.whatsapp;

        const precio = `${formatearPrecio(inmueble.precio, inmueble.moneda)}${esAlquiler ? ' al mes' : ''}`;
        const slug = (inmueble as { slug?: string }).slug || inmueble.id;
        const enlace = `${window.location.origin}/inmueble/${slug}`;
        const mensaje = `¡Hola Churo Hogar! Me interesa el inmueble "${inmueble.titulo}" que vi en la web ${esAlquiler ? 'en alquiler' : 'en venta'} por ${precio}.\n${enlace}\n¿Me das más info?`;
        const url = `https://wa.me/${phoneStr}?text=${encodeURIComponent(mensaje)}`;
        window.open(url, '_blank');
    };

    const b = inmueble.barrios;
    const ciudad = b?.ciudades?.nombre;
    const depto = b?.ciudades?.departamentos?.nombre;
    const ubicacionStr = (ciudad && depto) ? `${ciudad}, ${depto}` : '';
    const totalFotos = (inmueble.imagenes || []).length;
    const href = `/inmueble/${inmueble.slug || inmueble.id}`;

    return (
        <article className="group bg-white/80 backdrop-blur-sm rounded-2xl border border-white/40 shadow-lg overflow-hidden col-span-1 flex flex-col h-full transform transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:bg-white/90">
            <a
                href={href}
                className="flex flex-col flex-1 min-w-0"
            >
                <div className="w-full aspect-[4/3] relative bg-sand flex-shrink-0 overflow-hidden">
                    {inmueble.portadaUrl ? (
                        <img
                            src={inmueble.portadaUrl}
                            alt={inmueble.titulo}
                            loading="lazy"
                            decoding="async"
                            className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-105"
                        />
                    ) : (
                        <div className="flex items-center justify-center w-full h-full text-muted font-medium">Sin Imagen</div>
                    )}
                    <div className="absolute top-3 right-3 bg-primary-dark/80 backdrop-blur-sm text-white text-xs font-bold px-3 py-1 rounded-full shadow">
                        {inmueble.tipo_propiedad}
                    </div>
                    {(inmueble.destacado || esAlquiler) && (
                        <div className="absolute top-3 left-3 flex flex-col gap-1 items-start">
                            {inmueble.destacado && (
                                <span
                                    className="relative inline-flex -rotate-6 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3"
                                    title="Inmueble destacado"
                                    aria-label="Inmueble destacado"
                                >
                                    {/* Halo blanco: separa la estrella de cualquier foto. */}
                                    <MdStar
                                        size={40}
                                        className="absolute -left-[3px] -top-[3px] text-white drop-shadow-[0_3px_5px_rgba(0,0,0,0.35)]"
                                        aria-hidden
                                    />
                                    <MdStar
                                        size={34}
                                        className="relative text-[#FFB000] drop-shadow-[0_1px_2px_rgba(120,70,0,0.45)]"
                                        aria-hidden
                                    />
                                </span>
                            )}
                            {esAlquiler && (
                                <div className="bg-accent-strong/90 backdrop-blur-sm text-white text-xs font-bold px-3 py-1 rounded-full shadow">
                                    En alquiler
                                </div>
                            )}
                        </div>
                    )}
                    {totalFotos > 1 && (
                        <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm text-white text-xs font-semibold px-2.5 py-1 rounded-full shadow flex items-center gap-1">
                            <FaCamera size={11} /> {totalFotos}
                        </div>
                    )}
                </div>
                <div className="p-5 flex-1 flex flex-col">
                    <h3 className="text-primary-dark text-2xl font-bold mb-1">
                        {formatearPrecio(inmueble.precio, inmueble.moneda)}
                        {esAlquiler && <span className="text-sm font-semibold text-muted"> /mes</span>}
                    </h3>
                    <h4 className="text-primary-dark font-semibold mb-1 line-clamp-2 min-h-[2.75rem]">{inmueble.titulo}</h4>
                    {ubicacionStr && <p className="text-xs text-muted mb-2 font-medium">{ubicacionStr}</p>}

                    <div className="flex text-muted text-sm mb-1 gap-4">
                        {inmueble.habitaciones > 0 && (
                            <div className="flex items-center gap-1"><FaBed size={14} /> {inmueble.habitaciones}</div>
                        )}
                        {inmueble.banos > 0 && (
                            <div className="flex items-center gap-1"><FaBath size={14} /> {inmueble.banos}</div>
                        )}
                        {inmueble.superficie_terreno && (
                            <div className="flex items-center gap-1"><FaRulerCombined size={14} /> {inmueble.superficie_terreno} m²</div>
                        )}
                    </div>
                </div>
            </a>
            <div className="px-5 pb-5">
                <button
                    onClick={contactarWhatsapp}
                    className="w-full bg-accent-strong hover:bg-primary-dark text-white font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition duration-300 shadow-md hover:shadow-lg"
                >
                    <FaWhatsapp size={20} className="text-white" />
                    Consultar
                </button>
            </div>
        </article>
    );
};
