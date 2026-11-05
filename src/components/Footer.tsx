import React from 'react';
import { Link } from 'react-router-dom';
import { FaFacebook, FaInstagram, FaWhatsapp } from 'react-icons/fa';
import { useBusinessConfig } from '../hooks/useBusinessConfig';
import logoUrl from './imagenes/logo.webp';

export const Footer: React.FC = () => {
    const { config } = useBusinessConfig();

    return (
        <footer className="bg-secondary text-white py-12 mt-12 border-t-4 border-primary">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-3 gap-8 text-center md:text-left">
                <div>
                    <img src={logoUrl} alt="Churo Hogar" className="h-24 md:h-28 w-auto object-contain mb-6 mx-auto md:mx-0 filter brightness-0 invert drop-shadow-md" />
                    <p className="text-gray-400 text-sm">El portal inmobiliario líder en Tarija. Encuentra el lugar perfecto para ti y tu familia con Churo Hogar.</p>
                </div>
                <div>
                    <h4 className="text-lg font-bold mb-4">Enlaces Rápidos</h4>
                    <ul className="space-y-1 text-gray-400 text-sm">
                        <li><Link to="/" className="inline-block py-3 hover:text-white transition">Inicio</Link></li>
                        <li><Link to="/quienes-somos" className="inline-block py-3 hover:text-white transition">Quiénes Somos</Link></li>
                        <li><Link to="/guia" className="inline-block py-3 hover:text-white transition">Guía</Link></li>
                        <li><Link to="/contacto" className="inline-block py-3 hover:text-white transition">Contacto</Link></li>
                    </ul>
                </div>
                <div>
                    <h4 className="text-lg font-bold mb-4 text-white">Síguenos</h4>
                    <div className="flex justify-center md:justify-start gap-4">
                        <a href="https://www.facebook.com/share/1B6fcdgzmE/" target="_blank" rel="noreferrer" aria-label="Facebook de Churo Hogar" className="h-12 w-12 bg-gray-800 rounded-full flex items-center justify-center hover:bg-[#1877F2] hover:scale-110 transition-all duration-300 text-white shadow-lg">
                            <FaFacebook size={24} aria-hidden="true" />
                        </a>
                        <a href="https://instagram.com" target="_blank" rel="noreferrer" aria-label="Instagram de Churo Hogar" className="h-12 w-12 bg-gray-800 rounded-full flex items-center justify-center hover:bg-[#E4405F] hover:scale-110 transition-all duration-300 text-white shadow-lg">
                            <FaInstagram size={24} aria-hidden="true" />
                        </a>
                        <a href={`https://wa.me/${config.whatsapp}`} target="_blank" rel="noreferrer" aria-label="WhatsApp de Churo Hogar" className="h-12 w-12 bg-gray-800 rounded-full flex items-center justify-center hover:bg-[#25D366] hover:scale-110 transition-all duration-300 text-white shadow-lg">
                            <FaWhatsapp size={24} aria-hidden="true" />
                        </a>
                    </div>
                </div>
            </div>
            <div className="mt-8 pt-8 border-t border-gray-800 text-center text-gray-400 text-sm">
                <p>© {new Date().getFullYear()} Churo Hogar. Todos los derechos reservados.</p>
                <p className="mt-3">
                    Desarrollada por <a href="https://dev-studio-tau.vercel.app/?fbclid=IwRlRTSAQUSpVleHRuA2FlbQIxMABzcnRjBmFwcF9pZAo2NjI4NTY4Mzc5AAEer9O8NAsN-wS7gding1YTwjkzFhqi-PO1DYCiAdk3Ptk6DEIBzoZD41zY6RU_aem__3IAkYPghlgVnkswhF9Qgg" target="_blank" className="text-accent underline hover:text-white font-black tracking-widest transition duration-300 drop-shadow-md text-base">DEV-Studio</a>
                </p>
            </div>
        </footer>
    );
};
