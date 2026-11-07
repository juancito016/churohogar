import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import {
    FaWhatsapp, FaBed, FaBath, FaRulerCombined, FaMapMarkerAlt, FaExpandArrowsAlt,
    FaShareAlt, FaChevronLeft, FaChevronRight, FaTimes, FaCheckCircle
} from 'react-icons/fa';
import { getImageUrl } from '../utils/helpers';
import { Footer } from '../components/Footer';
import { useSimilarInmuebles } from '../hooks/useSimilarInmuebles';
import { useBusinessConfig } from '../hooks/useBusinessConfig';
import logoUrl from '../components/imagenes/logo.webp';

type ImagenLite = { url_storage: string; orden?: number | null };

const parseLatLng = (url?: string | null): { lat: number; lng: number } | null => {
    if (!url) return null;
    const patterns = [
        /@(-?\d+\.\d+),(-?\d+\.\d+)/,
        /[?&](?:q|query|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/,
        /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
        /\/place\/(-?\d+\.\d+),(-?\d+\.\d+)/,
        /\/(-?\d+\.\d+),(-?\d+\.\d+)/,
    ];
    for (const p of patterns) {
        const m = url.match(p);
        if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
    }
    return null;
};

const SITE_URL = 'https://churohogar.com';

const setMetaTag = (key: string, content: string) => {
    let el = document.head.querySelector(`meta[name="${key}"]`);
    if (!el) {
        el = document.createElement('meta');
        el.setAttribute('name', key);
        document.head.appendChild(el);
    }
    el.setAttribute('content', content);
};

const setMetaProperty = (key: string, content: string) => {
    let el = document.head.querySelector(`meta[property="${key}"]`);
    if (!el) {
        el = document.createElement('meta');
        el.setAttribute('property', key);
        document.head.appendChild(el);
    }
    el.setAttribute('content', content);
};

const setCanonical = (url: string | null) => {
    const existing = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;

    if (!url) {
        existing?.remove();
        return;
    }

    const el = existing ?? document.createElement('link');
    el.setAttribute('rel', 'canonical');
    el.setAttribute('href', url);
    if (!existing) document.head.appendChild(el);
};

const setJsonLd = (id: string, data: unknown | null) => {
    let el = document.getElementById(id) as HTMLScriptElement | null;
    if (data === null) {
        if (el) el.remove();
        return;
    }
    if (!el) {
        el = document.createElement('script');
        el.type = 'application/ld+json';
        el.id = id;
        document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(data);
};

export const PropertyDetail: React.FC = () => {
    const { slug } = useParams<{ slug: string }>();
    const [inmueble, setInmueble] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeIndex, setActiveIndex] = useState(0);
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [touchStartX, setTouchStartX] = useState<number | null>(null);
    const { similares } = useSimilarInmuebles(inmueble?.id);
    const { config } = useBusinessConfig();
    const navigate = useNavigate();
    const location = useLocation();
    const [menuOpen, setMenuOpen] = useState(false);

    const handleBack = () => {
        if (location.key !== 'default') {
            navigate(-1);
        } else {
            navigate('/');
        }
    };

    useEffect(() => {
        const fetchInmueble = async () => {
            if (!slug) return;

            const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(slug);

            let query = supabase
                .from('inmuebles')
                .select(`
          *,
          barrios (nombre, ciudades (nombre, departamentos (nombre))),
          imagenes (url_storage, orden)
        `);

            if (isUuid) {
                query = query.eq('id', slug);
            } else {
                query = query.eq('slug', slug);
            }

            query = query.is('deleted_at', null);

            const { data, error } = await query.single();

            if (!error && data) {
                setInmueble(data);
                setActiveIndex(0);

                const barrioNombre = data.barrios?.nombre || 'Barrio';
                const ciudadNombre = data.barrios?.ciudades?.nombre || 'Ciudad';

                const estadoPublicacion = data.estado as 'Disponible' | 'Vendido' | 'Alquilado' | 'Vencido';
                const noDisponible = estadoPublicacion !== 'Disponible';
                const esAlquilerData = data.operacion === 'Alquiler';
                const etiquetaEstado = estadoPublicacion === 'Vendido'
                    ? 'Vendido'
                    : estadoPublicacion === 'Alquilado'
                        ? 'Alquilado'
                        : 'Publicación vencida';

                // SEO TITLE DYNAMIC
                document.title = noDisponible
                    ? `${data.titulo} | ${etiquetaEstado} | ChuroHogar`
                    : `${data.tipo_propiedad} en ${esAlquilerData ? 'alquiler' : 'venta'} en ${barrioNombre}, ${ciudadNombre} | ChuroHogar`;

                if (noDisponible) {
                    setMetaTag('robots', 'noindex, follow');
                } else {
                    document.head.querySelector('meta[name="robots"]')?.remove();
                }

                const precio = Number(data.precio) || 0;
                const monedaIso = data.moneda === 'Bs' ? 'BOB' : 'USD';
                const primeraImagen = (data.imagenes || []).slice().sort((a: ImagenLite, b: ImagenLite) => (a.orden ?? 0) - (b.orden ?? 0))[0];

                const descripcionSeo = noDisponible
                    ? estadoPublicacion === 'Vendido'
                        ? `${data.titulo} en ${barrioNombre}, ${ciudadNombre}. Este inmueble ya no está disponible.`
                        : estadoPublicacion === 'Alquilado'
                            ? `${data.titulo} en ${barrioNombre}, ${ciudadNombre}. Este alquiler ya no está disponible.`
                            : `${data.titulo} en ${barrioNombre}, ${ciudadNombre}. Esta publicación venció y ya no está disponible.`
                    : `${data.tipo_propiedad} en ${esAlquilerData ? 'alquiler' : 'venta'} en ${barrioNombre}, ${ciudadNombre}. ${data.titulo}. Precio: ${data.moneda} ${precio.toLocaleString('es-BO')}${esAlquilerData ? ' al mes' : ''}. Contacta por WhatsApp con Churo Hogar.`;

                setMetaTag('description', descripcionSeo);

                const imagenSeo = primeraImagen ? getImageUrl(primeraImagen.url_storage) : null;
                const imagenAbsoluta = imagenSeo
                    ? imagenSeo.startsWith('http')
                        ? imagenSeo
                        : `${SITE_URL}${imagenSeo.startsWith('/') ? '' : '/'}${imagenSeo}`
                    : null;
                const urlSeo = `${SITE_URL}/inmueble/${data.slug || data.id}`;

                setMetaProperty('og:title', document.title);
                setMetaProperty('og:description', descripcionSeo);
                setMetaProperty('og:url', urlSeo);
                setMetaProperty('og:type', 'article');
                setMetaTag('twitter:card', 'summary_large_image');
                setMetaTag('twitter:title', document.title);
                setMetaTag('twitter:description', descripcionSeo);
                setCanonical(urlSeo);

                if (imagenAbsoluta) {
                    setMetaProperty('og:image', imagenAbsoluta);
                    setMetaTag('twitter:image', imagenAbsoluta);
                }

                setJsonLd('ld-inmueble', {
                    '@context': 'https://schema.org',
                    '@type': 'RealEstateListing',
                    name: data.titulo,
                    description: data.descripcion || undefined,
                    url: `${window.location.origin}/inmueble/${data.slug || data.id}`,
                    image: primeraImagen ? getImageUrl(primeraImagen.url_storage) : undefined,
                    address: {
                        '@type': 'PostalAddress',
                        addressLocality: ciudadNombre,
                        addressRegion: data.barrios?.ciudades?.departamentos?.nombre || undefined,
                        addressCountry: 'BO',
                    },
                    offers: {
                        '@type': 'Offer',
                        price: precio,
                        priceCurrency: monedaIso,
                        availability: data.estado === 'Disponible' ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
                        ...(esAlquilerData
                            ? {
                                businessFunction: 'http://purl.org/goodrelations/v1#LeaseOut',
                                priceSpecification: {
                                    '@type': 'UnitPriceSpecification',
                                    price: precio,
                                    priceCurrency: monedaIso,
                                    unitCode: 'MON',
                                },
                            }
                            : { businessFunction: 'http://purl.org/goodrelations/v1#Sell' }),
                    },
                });
            }
            setLoading(false);
        };

        fetchInmueble();

        return () => {
            document.title = 'Casas en Tarija | Venta de Inmuebles y Terrenos | Churo Hogar';
            document.head.querySelector('meta[name="robots"]')?.remove();
            setJsonLd('ld-inmueble', null);
            setCanonical(null);
            setMetaProperty('og:type', 'website');
            setMetaProperty('og:image', `${SITE_URL}/favicon.ico`);
            setMetaTag('twitter:image', `${SITE_URL}/favicon.ico`);
        };
    }, [slug]);

    const imagenes: ImagenLite[] = ((inmueble?.imagenes || []) as ImagenLite[]).slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    const total = imagenes.length;

    const goTo = useCallback((i: number) => {
        if (total === 0) return;
        setActiveIndex(((i % total) + total) % total);
    }, [total]);

    useEffect(() => {
        if (!lightboxOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setLightboxOpen(false);
            if (e.key === 'ArrowRight') goTo(activeIndex + 1);
            if (e.key === 'ArrowLeft') goTo(activeIndex - 1);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [lightboxOpen, activeIndex, goTo]);

    const onTouchStart = (e: React.TouchEvent) => setTouchStartX(e.touches[0].clientX);
    const onTouchEnd = (e: React.TouchEvent) => {
        if (touchStartX === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(dx) > 40) {
            if (dx < 0) goTo(activeIndex + 1);
            else goTo(activeIndex - 1);
        }
        setTouchStartX(null);
    };

    const formatearPrecio = (precio: number, moneda: string) => {
        return new Intl.NumberFormat('es-BO', {
            style: 'currency',
            currency: moneda === 'Bs' ? 'BOB' : 'USD'
        }).format(precio);
    };

    const contactarWhatsapp = () => {
        let phoneStr = inmueble.contacto ? inmueble.contacto.replace(/\D/g, '') : config.whatsapp;
        if (phoneStr && !phoneStr.startsWith('591') && phoneStr.length <= 8) {
            phoneStr = '591' + phoneStr;
        }

        const ubicacion = [
            inmueble.barrios?.nombre,
            inmueble.barrios?.ciudades?.nombre,
            inmueble.barrios?.ciudades?.departamentos?.nombre,
        ].filter(Boolean).join(', ');
        const enlace = `${window.location.origin}/inmueble/${inmueble.slug || inmueble.id}`;
        const mensaje = [
            config.mensajeWhatsapp,
            '',
            `*${inmueble.titulo}*`,
            `Tipo: ${inmueble.tipo_propiedad}`,
            `Operación: ${inmueble.operacion === 'Alquiler' ? 'Alquiler' : 'Venta'}`,
            `Precio: ${formatearPrecio(inmueble.precio, inmueble.moneda)}${esAlquiler ? ' al mes' : ''}`,
            `Ubicación: ${ubicacion}`,
            `Código: ${inmueble.slug || inmueble.id}`,
            `Enlace: ${enlace}`,
            '',
            '¿Me das más información?',
        ].join('\n');

        const url = `https://wa.me/${phoneStr}?text=${encodeURIComponent(mensaje)}`;
        window.open(url, '_blank');
    };

    const compartir = async () => {
        const url = window.location.href;
        const shareData = {
            title: inmueble.titulo,
            text: `${inmueble.tipo_propiedad} en ${inmueble.operacion === 'Alquiler' ? 'alquiler' : 'venta'} · ${formatearPrecio(inmueble.precio, inmueble.moneda)}${inmueble.operacion === 'Alquiler' ? ' /mes' : ''}`,
            url,
        };
        try {
            if (navigator.share) {
                await navigator.share(shareData);
            } else {
                await navigator.clipboard.writeText(url);
            }
        } catch {
            /* cancelado por el usuario */
        }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center text-accent font-bold animate-pulse">Cargando la mejor opción para ti...</div>;
    if (!inmueble) return <div className="min-h-screen flex items-center justify-center font-bold text-muted">Inmueble no encontrado</div>;

    const b = inmueble.barrios;
    const ubicacionCompleta = [b?.nombre, b?.ciudades?.nombre, b?.ciudades?.departamentos?.nombre].filter(Boolean).join(', ');
    const esLote = inmueble.tipo_propiedad === 'Lote';
    const vendido = inmueble.estado === 'Vendido';
    const alquilado = inmueble.estado === 'Alquilado';
    const vencido = inmueble.estado === 'Vencido';
    const noDisponible = vendido || alquilado || vencido;
    const esAlquiler = inmueble.operacion === 'Alquiler';
    const coords = parseLatLng(inmueble.map_url);
    const mapEmbedSrc = coords ? `https://www.google.com/maps?q=${coords.lat},${coords.lng}&z=16&output=embed` : null;

    const stats: { icon: React.ElementType; value: React.ReactNode; label: string }[] = [];
    if (!esLote) {
        stats.push({ icon: FaBed, value: inmueble.habitaciones || 0, label: 'Dormitorios' });
        stats.push({ icon: FaBath, value: inmueble.banos || 0, label: 'Baños' });
    }
    if (inmueble.superficie_construida) stats.push({ icon: FaExpandArrowsAlt, value: <>{inmueble.superficie_construida} <span className="text-lg">m²</span></>, label: 'Construidos' });
    if (inmueble.superficie_terreno) stats.push({ icon: FaRulerCombined, value: <>{inmueble.superficie_terreno} <span className="text-lg">m²</span></>, label: 'Terreno' });

    return (
        <div className="min-h-screen flex flex-col font-sans bg-crema pb-24 md:pb-0">
            {/* Nav Superior */}
            <div className="bg-white/80 backdrop-blur-md shadow-sm border-b border-white/40 sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <button onClick={handleBack} className="text-primary-dark hover:text-black font-black flex items-center gap-2 transition text-xs uppercase tracking-widest min-h-[44px] -ml-2 px-2">
                        ← Regresar
                    </button>
                    <nav className="hidden md:flex items-center gap-8">
                        <Link to="/" className="text-muted hover:text-primary-dark font-bold text-xs uppercase tracking-[0.2em] transition-colors">Inicio</Link>
                        <Link to="/guia" className="text-muted hover:text-primary-dark font-bold text-xs uppercase tracking-[0.2em] transition-colors">Guía</Link>
                        <Link to="/contacto" className="text-muted hover:text-primary-dark font-bold text-xs uppercase tracking-[0.2em] transition-colors">Contacto</Link>
                    </nav>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center cursor-pointer" onDoubleClick={() => navigate('/admin')}>
                            <img src={logoUrl} alt="ChuroHogar Logo" className="h-10 w-auto object-contain" />
                        </div>
                        <button
                            onClick={() => setMenuOpen(!menuOpen)}
                            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
                            aria-expanded={menuOpen}
                            className="md:hidden flex items-center justify-center w-11 h-11 -mr-2 text-primary-dark"
                        >
                            {menuOpen ? (
                                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            ) : (
                                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                            )}
                        </button>
                    </div>
                </div>

                {menuOpen && (
                    <nav className="md:hidden bg-white/95 backdrop-blur-md border-t border-gray-100 shadow-lg">
                        <div className="max-w-7xl mx-auto px-4 py-2 flex flex-col">
                            <Link to="/" onClick={() => setMenuOpen(false)} className="py-3 text-muted hover:text-primary-dark font-bold text-sm uppercase tracking-[0.2em] transition-colors">Inicio</Link>
                            <Link to="/guia" onClick={() => setMenuOpen(false)} className="py-3 text-muted hover:text-primary-dark font-bold text-sm uppercase tracking-[0.2em] transition-colors">Guía</Link>
                            <Link to="/contacto" onClick={() => setMenuOpen(false)} className="py-3 text-muted hover:text-primary-dark font-bold text-sm uppercase tracking-[0.2em] transition-colors">Contacto</Link>
                        </div>
                    </nav>
                )}
            </div>

            <main className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 flex-1">

                {/* Header Título & Precio */}
                <div className="flex flex-col md:flex-row md:items-end justify-between mb-6 gap-4">
                    <div className="flex-1">
                        <div className="flex items-center flex-wrap gap-2 mb-3">
                            <span className="inline-block px-3 py-1 bg-primary-dark/10 text-primary-dark font-bold text-sm rounded-lg uppercase tracking-wider">
                                {inmueble.tipo_propiedad}
                            </span>
                            {esAlquiler && !noDisponible && (
                                <span className="inline-block px-3 py-1 bg-accent-strong text-white font-black text-sm rounded-lg uppercase tracking-wider">
                                    En alquiler
                                </span>
                            )}
                            {vendido && (
                                <span className="inline-block px-3 py-1 bg-red-600 text-white font-black text-sm rounded-lg uppercase tracking-wider">
                                    Vendido
                                </span>
                            )}
                            {alquilado && (
                                <span className="inline-block px-3 py-1 bg-red-600 text-white font-black text-sm rounded-lg uppercase tracking-wider">
                                    Alquilado
                                </span>
                            )}
                            {vencido && (
                                <span className="inline-block px-3 py-1 bg-amber-500 text-white font-black text-sm rounded-lg uppercase tracking-wider">
                                    Publicación vencida
                                </span>
                            )}
                        </div>
                        <h1 className="text-3xl md:text-4xl font-extrabold text-primary-dark mb-2 leading-tight">
                            {inmueble.titulo}
                        </h1>
                        <p className="text-base text-muted flex items-center gap-2 font-medium">
                            <FaMapMarkerAlt className="text-accent shrink-0" /> {ubicacionCompleta}
                        </p>
                        {inmueble.publicado_at && (
                            <p className="text-sm text-muted mt-2">
                                Publicado el {new Intl.DateTimeFormat('es-BO', {
                                    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/La_Paz',
                                }).format(new Date(inmueble.publicado_at))}
                            </p>
                        )}
                    </div>
                    <div className="text-left md:text-right flex flex-col items-start md:items-end gap-4">
                        <div>
                            <div className="text-3xl md:text-4xl font-black text-primary-dark">
                                {formatearPrecio(inmueble.precio, inmueble.moneda)}
                                {esAlquiler && <span className="text-lg md:text-xl font-bold text-muted"> /mes</span>}
                            </div>
                            <p className="text-sm text-muted font-semibold uppercase tracking-widest mt-1">
                                {esAlquiler ? 'Precio de alquiler' : 'Precio de Venta'}
                            </p>
                        </div>
                        <button
                            onClick={compartir}
                            aria-label="Compartir propiedad"
                            className="inline-flex items-center gap-2 text-primary-dark hover:text-accent font-bold text-xs uppercase tracking-widest min-h-[44px] px-3 rounded-xl border border-primary-dark/15 hover:border-accent/40 transition-colors"
                        >
                            <FaShareAlt /> Compartir
                        </button>
                    </div>
                </div>

                {/* Contenido en dos columnas: galería y datos a la izquierda, contacto a la derecha */}
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px] gap-6 lg:gap-8 items-start">
                    {/* Columna izquierda: galería y datos del inmueble */}
                    <div className="min-w-0 space-y-8">
                        {/* Galería Fotográfica con swipe */}
                        <div className="bg-white/80 backdrop-blur-sm p-3 sm:p-4 rounded-3xl shadow-lg border border-white/40">
                            <div
                                className="relative rounded-2xl overflow-hidden bg-sand group select-none"
                                onTouchStart={onTouchStart}
                                onTouchEnd={onTouchEnd}
                            >
                                {total > 0 ? (
                                    <img
                                        src={getImageUrl(imagenes[activeIndex]?.url_storage)}
                                        alt={`${inmueble.titulo} - foto ${activeIndex + 1}`}
                                        className="w-full h-[260px] sm:h-[340px] lg:h-[380px] xl:h-[460px] object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-[260px] sm:h-[340px] lg:h-[380px] xl:h-[460px] flex items-center justify-center text-muted font-bold">Sin Imagen</div>
                                )}

                                {vendido && (
                                    <div className="absolute top-4 left-4 z-10 bg-red-600 text-white font-black uppercase tracking-widest text-xs px-4 py-2 rounded-full shadow-lg">
                                        Vendido
                                    </div>
                                )}

                                {alquilado && (
                                    <div className="absolute top-4 left-4 z-10 bg-red-600 text-white font-black uppercase tracking-widest text-xs px-4 py-2 rounded-full shadow-lg">
                                        Alquilado
                                    </div>
                                )}

                                {vencido && (
                                    <div className="absolute top-4 left-4 z-10 bg-amber-500 text-white font-black uppercase tracking-widest text-xs px-4 py-2 rounded-full shadow-lg">
                                        Publicación vencida
                                    </div>
                                )}

                                {total > 1 && (
                                    <div className="absolute top-4 right-4 bg-black/60 text-white text-xs font-bold px-3 py-1.5 rounded-full backdrop-blur-sm">
                                        {activeIndex + 1} / {total}
                                    </div>
                                )}

                                {total > 1 && (
                                    <>
                                        <button
                                            onClick={() => goTo(activeIndex - 1)}
                                            aria-label="Foto anterior"
                                            className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/85 hover:bg-white text-primary-dark p-2.5 rounded-full shadow-md transition md:opacity-0 md:group-hover:opacity-100"
                                        >
                                            <FaChevronLeft size={16} />
                                        </button>
                                        <button
                                            onClick={() => goTo(activeIndex + 1)}
                                            aria-label="Foto siguiente"
                                            className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/85 hover:bg-white text-primary-dark p-2.5 rounded-full shadow-md transition md:opacity-0 md:group-hover:opacity-100"
                                        >
                                            <FaChevronRight size={16} />
                                        </button>
                                    </>
                                )}

                                {total > 0 && (
                                    <button
                                        onClick={() => setLightboxOpen(true)}
                                        aria-label="Ver foto en pantalla completa"
                                        className="absolute bottom-3 right-3 bg-black/60 hover:bg-black text-white p-2.5 rounded-full backdrop-blur-sm transition"
                                    >
                                        <FaExpandArrowsAlt size={14} />
                                    </button>
                                )}
                            </div>

                            {/* Miniaturas */}
                            {total > 1 && (
                                <div className="flex gap-3 mt-4 overflow-x-auto pb-2 snap-x">
                                    {imagenes.map((img, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => goTo(idx)}
                                            aria-label={`Ir a la foto ${idx + 1}`}
                                            className={`h-20 w-20 shrink-0 sm:h-24 sm:w-24 snap-center rounded-xl overflow-hidden cursor-pointer border-4 transition-all ${activeIndex === idx ? 'border-accent scale-105 shadow-md' : 'border-transparent opacity-60 hover:opacity-100'}`}
                                        >
                                            <img src={getImageUrl(img.url_storage)} alt={`Miniatura ${idx + 1}`} className="w-full h-full object-cover" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Características */}
                        {stats.length > 0 && (
                            <div className={`grid grid-cols-2 ${stats.length >= 4 ? 'sm:grid-cols-4' : stats.length === 3 ? 'sm:grid-cols-3' : ''} gap-4`}>
                                {stats.map((s, i) => (
                                    <div key={i} className="bg-white/70 backdrop-blur-sm p-5 rounded-2xl shadow-md border border-white/40 flex flex-col items-center justify-center text-center">
                                        <s.icon className="text-3xl text-accent mb-3" />
                                        <span className="text-2xl font-black text-primary-dark">{s.value}</span>
                                        <span className="text-xs text-muted font-bold uppercase tracking-wider mt-1">{s.label}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Servicios y comodidades */}
                        {Array.isArray(inmueble.servicios) && inmueble.servicios.length > 0 && (
                            <div className="bg-white/80 backdrop-blur-sm p-8 rounded-3xl shadow-lg border border-white/40">
                                <h2 className="text-2xl font-black text-primary-dark mb-6">Servicios y comodidades</h2>
                                <div className="flex flex-wrap gap-2">
                                    {inmueble.servicios.map((s: string, i: number) => (
                                        <span key={i} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-sand/60 text-primary-dark font-semibold text-sm">
                                            <FaCheckCircle className="text-accent" /> {s}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* CTA móvil (antes de la descripción) */}
                        {noDisponible ? (
                            <div className="lg:hidden w-full bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center text-sm font-bold text-amber-900">
                                {vendido
                                    ? 'Este inmueble ya se vendió.'
                                    : alquilado
                                        ? 'Este alquiler ya no está disponible.'
                                        : 'Esta publicación venció y ya no está activa.'}
                            </div>
                        ) : (
                            <button
                                onClick={contactarWhatsapp}
                                className="lg:hidden w-full bg-accent-strong hover:bg-black text-white font-black py-4 px-6 rounded-2xl flex items-center justify-center gap-3 shadow-lg text-lg"
                            >
                                <FaWhatsapp size={26} /> Consultar por WhatsApp
                            </button>
                        )}

                        {/* Descripción */}
                        <div className="bg-white/80 backdrop-blur-sm p-8 rounded-3xl shadow-lg border border-white/40">
                            <h2 className="text-2xl font-black text-primary-dark mb-6">Descripción de la Propiedad</h2>
                            <p className="text-muted text-lg leading-relaxed whitespace-pre-line">
                                {inmueble.descripcion}
                            </p>
                        </div>
                    </div>

                    {/* Columna derecha: contacto y ubicación */}
                    <aside className="space-y-6">
                        <div className="hidden lg:block bg-primary-dark p-8 rounded-3xl shadow-xl text-white sticky top-24">
                            <h3 className="text-2xl font-bold mb-2">¿Te interesa?</h3>
                            <p className="text-white/80 mb-8 font-medium">Contáctanos directamente.</p>

                            {noDisponible ? (
                                <div className="bg-white/10 border border-white/20 rounded-2xl p-4 text-center text-sm font-bold">
                                    {vendido
                                    ? 'Este inmueble ya se vendió.'
                                    : alquilado
                                        ? 'Este alquiler ya no está disponible.'
                                        : 'Esta publicación venció y ya no está activa.'}
                                </div>
                            ) : (
                                <button
                                    onClick={contactarWhatsapp}
                                    className="w-full bg-accent-strong hover:bg-black text-white font-black py-4 px-5 rounded-2xl flex items-center justify-center gap-2.5 transition-transform transform hover:-translate-y-1 shadow-lg text-base whitespace-nowrap"
                                >
                                    <FaWhatsapp size={28} className="text-white" />
                                    Consultar por WhatsApp
                                </button>
                            )}
                            <p className="text-center text-xs text-white/60 mt-4 opacity-80">Certificado por ChuroHogar</p>
                        </div>

                        {/* Ubicación Detallada + Mapa */}
                        <div className="bg-white/80 backdrop-blur-sm p-6 rounded-3xl shadow-lg border border-white/40">
                            <h3 className="font-bold text-primary-dark mb-4 flex items-center gap-2">
                                <FaMapMarkerAlt className="text-accent" /> Ubicación Detallada
                            </h3>
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between border-b border-white/30 pb-2">
                                    <span className="text-muted">Departamento:</span>
                                    <span className="font-bold text-primary-dark">{b?.ciudades?.departamentos?.nombre}</span>
                                </div>
                                <div className="flex justify-between border-b border-white/30 pb-2">
                                    <span className="text-muted">Ciudad:</span>
                                    <span className="font-bold text-primary-dark">{b?.ciudades?.nombre}</span>
                                </div>
                                <div className="flex justify-between border-b border-white/30 pb-2">
                                    <span className="text-muted">Barrio:</span>
                                    <span className="font-bold text-accent-strong">{b?.nombre}</span>
                                </div>

                                {mapEmbedSrc && (
                                    <div className="mt-4 rounded-2xl overflow-hidden border border-white/40 shadow-inner">
                                        <iframe
                                            title="Mapa de ubicación"
                                            src={mapEmbedSrc}
                                            className="w-full h-56"
                                            loading="lazy"
                                            referrerPolicy="no-referrer-when-downgrade"
                                        />
                                    </div>
                                )}

                                {inmueble.map_url && inmueble.map_url.trim() !== '' && (
                                    <div className="mt-3">
                                        <a
                                            href={inmueble.map_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center justify-center gap-2 w-full bg-accent/10 hover:bg-accent/20 text-primary-dark font-semibold py-2.5 px-4 rounded-xl transition-colors min-h-[44px]"
                                        >
                                            <FaMapMarkerAlt size={14} />
                                            Ver ubicación en Google Maps
                                        </a>
                                    </div>
                                )}
                            </div>
                        </div>
                    </aside>
                </div>

                {/* Propiedades cercanas (misma operación; nunca mezcla venta y alquiler) */}
                {similares.length > 0 && (
                    <div className="mt-16">
                        <h2 className="text-2xl md:text-3xl font-black text-primary-dark mb-2">
                            {esAlquiler ? 'Alquileres cercanos' : 'Propiedades cercanas'}
                        </h2>
                        <p className="text-muted mb-6">
                            {esAlquiler
                                ? 'Otras opciones en alquiler en la misma zona, ciudad o departamento.'
                                : 'Opciones en la misma zona, ciudad o departamento.'}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {similares.map((s) => {
                                const ubic = [s.barrio_nombre, s.ciudad_nombre].filter(Boolean).join(', ');
                                return (
                                    <Link
                                        key={s.id}
                                        to={`/inmueble/${s.slug || s.id}`}
                                        className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-lg border border-white/40 overflow-hidden hover:shadow-xl transition-shadow group"
                                    >
                                        <div className="aspect-[4/3] bg-sand overflow-hidden">
                                            {s.imagen_path ? (
                                                <img src={getImageUrl(s.imagen_path)} alt={s.titulo} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-muted text-sm font-bold">Sin Imagen</div>
                                            )}
                                        </div>
                                        <div className="p-5">
                                            <p className="text-xl font-black text-primary-dark mb-1">
                                                {formatearPrecio(s.precio, s.moneda)}
                                                {s.operacion === 'Alquiler' && <span className="text-sm font-semibold text-muted"> /mes</span>}
                                            </p>
                                            <h3 className="font-bold text-gray-900 truncate">{s.titulo}</h3>
                                            <p className="text-sm text-muted flex items-center gap-1 mt-1">
                                                <FaMapMarkerAlt className="text-accent shrink-0" size={12} /> {ubic}
                                            </p>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                )}
            </main>

            {/* Barra CTA fija (móvil) */}
            <div
                className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-200 px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]"
                style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
            >
                <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                        <div className="text-lg font-black text-primary-dark truncate">
                            {formatearPrecio(inmueble.precio, inmueble.moneda)}
                            {esAlquiler && <span className="text-xs font-bold text-muted"> /mes</span>}
                        </div>
                        <div className="text-[10px] uppercase tracking-widest text-muted font-semibold">
                            {noDisponible
                                ? (vendido ? 'Vendido' : alquilado ? 'Alquilado' : 'Publicación vencida')
                                : (esAlquiler ? 'Precio de alquiler' : 'Precio de venta')}
                        </div>
                    </div>
                    {!noDisponible && (
                    <button
                        onClick={contactarWhatsapp}
                        className="shrink-0 bg-accent-strong hover:bg-black text-white font-black px-5 py-3 rounded-xl flex items-center gap-2 shadow-lg"
                    >
                        <FaWhatsapp size={20} /> WhatsApp
                    </button>
                    )}
                </div>
            </div>

            {/* Lightbox */}
            {lightboxOpen && total > 0 && (
                <div
                    className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center"
                    onClick={() => setLightboxOpen(false)}
                >
                    <button
                        className="absolute top-4 right-4 text-white/80 hover:text-white p-3"
                        aria-label="Cerrar"
                        onClick={(e) => { e.stopPropagation(); setLightboxOpen(false); }}
                    >
                        <FaTimes size={26} />
                    </button>
                    {total > 1 && (
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/80 text-sm font-bold">
                            {activeIndex + 1} / {total}
                        </div>
                    )}
                    <button
                        className="absolute left-3 md:left-8 text-white/70 hover:text-white p-3"
                        aria-label="Anterior"
                        onClick={(e) => { e.stopPropagation(); goTo(activeIndex - 1); }}
                    >
                        <FaChevronLeft size={30} />
                    </button>
                    <img
                        src={getImageUrl(imagenes[activeIndex]?.url_storage)}
                        alt={`${inmueble.titulo} - foto ${activeIndex + 1}`}
                        className="max-h-[85vh] max-w-[92vw] object-contain rounded-lg"
                        onClick={(e) => e.stopPropagation()}
                    />
                    <button
                        className="absolute right-3 md:right-8 text-white/70 hover:text-white p-3"
                        aria-label="Siguiente"
                        onClick={(e) => { e.stopPropagation(); goTo(activeIndex + 1); }}
                    >
                        <FaChevronRight size={30} />
                    </button>
                </div>
            )}

            <Footer />
        </div>
    );
};
