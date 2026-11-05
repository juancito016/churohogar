import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { useSEO } from '../hooks/useSEO';

export const NotFound: React.FC = () => {
    useSEO({ title: 'Página no encontrada | Churo Hogar' });

    useEffect(() => {
        const existing = document.head.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
        const previous = existing?.content ?? null;

        if (existing) {
            existing.content = 'noindex, follow';
        } else {
            const meta = document.createElement('meta');
            meta.name = 'robots';
            meta.content = 'noindex, follow';
            document.head.appendChild(meta);
        }

        return () => {
            if (existing) {
                if (previous !== null) existing.content = previous;
                else existing.remove();
            } else {
                document.head.querySelector('meta[name="robots"]')?.remove();
            }
        };
    }, []);

    return (
        <div className="min-h-screen flex flex-col font-sans">
            <Navbar />

            <main className="flex-grow flex flex-col items-center justify-center text-center px-6 py-24">
                <p className="text-8xl md:text-9xl font-serif font-black italic tracking-tighter text-primary-dark">404</p>
                <h1 className="mt-4 text-2xl md:text-4xl font-black uppercase tracking-[0.2em] text-gray-900">Página no encontrada</h1>
                <p className="mt-4 text-muted max-w-md font-medium leading-relaxed">
                    La página que buscas no existe o fue movida. Vuelve al inicio para seguir explorando propiedades en Tarija.
                </p>
                <Link
                    to="/"
                    className="mt-10 inline-flex items-center justify-center bg-primary-dark hover:bg-black text-white font-black uppercase tracking-[0.25em] text-xs px-8 min-h-[48px] rounded-full transition-colors"
                >
                    Volver al inicio
                </Link>
            </main>

            <Footer />
        </div>
    );
};
