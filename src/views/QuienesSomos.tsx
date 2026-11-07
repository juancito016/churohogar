import React from 'react';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { Compass, CheckCircle, Zap } from 'lucide-react';
import { useSEO } from '../hooks/useSEO';

export const QuienesSomos: React.FC = () => {
    useSEO({
        title: 'Quiénes somos | Churo Hogar Inmobiliaria en Tarija',
        description: 'Conoce a Churo Hogar, la inmobiliaria que te ayuda a encontrar tu casa, departamento o terreno ideal en Tarija y Bolivia.',
        canonicalPath: '/quienes-somos',
    });
    return (
        <div className="min-h-screen flex flex-col font-sans selection:bg-red-900/10 selection:text-primary">
            <Navbar />

            <main className="flex-grow pt-12 pb-32 px-8 max-w-7xl mx-auto">

                {/* Header Premium */}
                <div className="text-center mb-10 md:mb-16 space-y-8">
                    <div className="inline-flex items-center gap-3 bg-red-900/5 text-primary px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-[0.5em] border border-red-900/10">
                        Nuestra Identidad
                    </div>

                    <h1 className="text-6xl md:text-[52px] lg:text-8xl font-serif font-black leading-[1.02] italic tracking-tighter text-gray-900">
                        Bienes raíces <br />
                        <span className="text-accent not-italic">con alma</span> boliviana.
                    </h1>

                    <p className="text-gray-400 text-lg font-medium max-w-2xl mx-auto leading-relaxed">
                        Revolucionando la forma de encontrar hogar en Bolivia con tecnología, transparencia y diseño.
                    </p>
                </div>

                {/* Misión & Visión */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-16 text-left mb-40">

                    {/* Misión */}
                    <div className="bg-white p-16 md:p-10 lg:p-16 rounded-[4rem] border border-gray-100 shadow-sm space-y-10 group hover:shadow-2xl transition-all duration-700">
                        <div className="w-16 h-16 bg-red-900/5 rounded-[1.5rem] flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                            <Compass size={32} />
                        </div>

                        <div className="space-y-6">
                            <h2 className="text-3xl md:text-2xl lg:text-3xl font-serif font-black text-gray-900">
                                Nuestra Misión
                            </h2>

                            <p className="text-gray-500 text-lg leading-relaxed font-medium">
                                En <span className="text-primary font-bold underline decoration-red-900/20 underline-offset-4">
                                    Churo Hogar
                                </span>, nuestra misión es democratizar, facilitar y brindar máxima transparencia al sector inmobiliario en Tarija y en toda Bolivia. Entendemos que buscar una propiedad es una de las decisiones más importantes de tu vida, por lo que hemos creado un ecosistema digital seguro y ágil.
                            </p>
                        </div>
                    </div>

                    {/* Visión */}
                    <div className="bg-ink-strong p-16 md:p-10 lg:p-16 rounded-[4rem] shadow-2xl space-y-10 text-white relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-red-900/10 rounded-full blur-[80px]" />

                        <div className="w-16 h-16 bg-white/10 rounded-[1.5rem] flex items-center justify-center text-accent group-hover:scale-110 transition-transform">
                            <CheckCircle size={32} />
                        </div>

                        <div className="space-y-6 relative z-10">
                            <h2 className="text-3xl md:text-2xl lg:text-3xl font-serif font-black">
                                Nuestra Visión
                            </h2>

                            <p className="text-white/60 text-lg leading-relaxed font-medium">
                                Buscamos convertirnos en el principal referente tecnológico en bienes raíces del país. Visualizamos un mercado boliviano donde compradores, vendedores e inquilinos se conectan sin barreras, respaldados por la innovación de <span className="text-white font-bold">DEV-Studio</span>.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Valores */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-12">

                    <div className="p-10 md:p-8 lg:p-10 rounded-[3rem] hover:bg-white hover:shadow-xl transition-all duration-500 border border-transparent hover:border-gray-50 group text-center">
                        <div className="w-20 h-20 md:w-16 md:h-16 lg:w-20 lg:h-20 bg-gray-50 rounded-[2rem] flex items-center justify-center mx-auto mb-8 group-hover:bg-crema transition-colors">
                            <CheckCircle className="text-accent" size={36} />
                        </div>
                        <h3 className="text-xl font-black mb-4 tracking-widest uppercase text-xs">
                            Confianza
                        </h3>
                        <p className="text-sm text-gray-400 font-medium leading-relaxed">
                            Datos verificados y transparencia total en cada publicación.
                        </p>
                    </div>

                    <div className="p-10 md:p-8 lg:p-10 rounded-[3rem] hover:bg-white hover:shadow-xl transition-all duration-500 border border-transparent hover:border-gray-50 group text-center">
                        <div className="w-20 h-20 md:w-16 md:h-16 lg:w-20 lg:h-20 bg-gray-50 rounded-[2rem] flex items-center justify-center mx-auto mb-8 group-hover:bg-crema transition-colors">
                            <Zap className="text-accent" size={36} />
                        </div>
                        <h3 className="text-xl font-black mb-4 tracking-widest uppercase text-xs">
                            Agilidad
                        </h3>
                        <p className="text-sm text-gray-400 font-medium leading-relaxed">
                            Filtros dinámicos que reducen tu tiempo de búsqueda significativamente.
                        </p>
                    </div>

                    <div className="p-10 md:p-8 lg:p-10 rounded-[3rem] hover:bg-white hover:shadow-xl transition-all duration-500 border border-transparent hover:border-gray-50 group text-center">
                        <div className="w-20 h-20 md:w-16 md:h-16 lg:w-20 lg:h-20 bg-gray-50 rounded-[2rem] flex items-center justify-center mx-auto mb-8 group-hover:bg-crema transition-colors">
                            <Compass className="text-accent" size={36} />
                        </div>
                        <h3 className="text-xl font-black mb-4 tracking-widest uppercase text-xs">
                            Innovación
                        </h3>
                        <p className="text-sm text-gray-400 font-medium leading-relaxed">
                            La experiencia digital inmobiliaria más avanzada en Bolivia.
                        </p>
                    </div>

                </div>

            </main>

            <Footer />
        </div>
    );
};