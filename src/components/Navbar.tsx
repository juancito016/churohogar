import React, { useState, useEffect } from 'react';
import { useNavigate, NavLink, useLocation } from 'react-router-dom';
import logoUrl from './imagenes/logo.webp';

export const Navbar: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isScrolled, setIsScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 20);
        };
        window.addEventListener('scroll', handleScroll);
        handleScroll();
        return () => window.removeEventListener('scroll', handleScroll);
    }, [location.pathname]);

    // Clases para enlaces: color guindo (#3C0811) activo y hover
    const linkClasses = ({ isActive }: { isActive: boolean }) => {
        return `font-sans font-bold text-xs md:text-sm uppercase tracking-[0.2em] transition-colors pb-1 border-b-2 ${isActive
                ? 'text-primary-dark border-primary-dark'
                : 'text-muted border-transparent hover:text-primary-dark hover:border-primary-dark/30'
            }`;
    };


    // En home sin scroll: fondo transparente. En otro caso: fondo beige con blur
    const showSolidBackground = isScrolled;

    return (
        <>
            {/* Placeholder to prevent layout shift when header becomes fixed */}
            <div className="h-[76px] md:h-[88px] w-full shrink-0"></div>
            <header
                className={`fixed w-full top-0 z-50 transition-all duration-500 ease-in-out ${showSolidBackground
                        ? 'bg-crema/90 backdrop-blur-md shadow-md'
                        : 'bg-transparent'
                    } ${isScrolled ? 'py-2' : 'py-4'}`}
            >
            <div className="max-w-[1400px] mx-auto px-6 md:px-12 flex justify-between items-center">

                {/* Logo Section */}
                <div
                    className="flex flex-col cursor-pointer shrink-0"
                    onDoubleClick={() => navigate('/admin')}
                    title="Doble clic para acceso interno"
                >
                    <img src={logoUrl} alt="Churo Hogar Logo" className="h-11 md:h-14 w-auto object-contain" />
                </div>

                {/* Desktop Nav */}
                <nav className="hidden lg:flex gap-8 items-center">
                    <NavLink to="/" className={linkClasses}>Inicio</NavLink>
                
                    <NavLink to="/guia" className={linkClasses}>Guía</NavLink>
                    <NavLink to="/contacto" className={linkClasses}>Contacto</NavLink>
                </nav>

                {/* Mobile Nav Button */}
                <div className="lg:hidden flex items-center">
                    <button
                        className="focus:outline-none transition p-1 text-muted hover:text-primary-dark"
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        aria-label="Alternar menú"
                    >
                        {isMenuOpen ? (
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        ) : (
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16m-7 6h7" />
                            </svg>
                        )}
                    </button>
                </div>
            </div>

            {/* Mobile Nav Menu Dropdown */}
            {isMenuOpen && (
                <div className="lg:hidden absolute w-full left-0 top-full bg-crema/95 backdrop-blur-3xl border-t border-gray-200 shadow-2xl transition-all duration-300">
                    <nav className="flex flex-col px-8 py-8 space-y-6">
                        <NavLink to="/" onClick={() => setIsMenuOpen(false)} className={linkClasses}>Inicio</NavLink>
                        <NavLink to="/guia" onClick={() => setIsMenuOpen(false)} className={linkClasses}>Guía</NavLink>
                        <NavLink to="/contacto" onClick={() => setIsMenuOpen(false)} className={linkClasses}>Contacto</NavLink>
                    </nav>
                </div>
            )}
        </header>
        </>
    );
};