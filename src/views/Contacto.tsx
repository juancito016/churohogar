import React, { useState } from 'react';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { Mail, User, ArrowRight } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import { useSEO } from '../hooks/useSEO';
import { useBusinessConfig } from '../hooks/useBusinessConfig';

export const Contacto: React.FC = () => {
    useSEO({
        title: 'Contacto | Churo Hogar Inmobiliaria en Tarija',
        description: 'Escríbenos por WhatsApp o correo para comprar, vender o alquilar tu inmueble en Tarija y Bolivia. Atención personalizada.',
        canonicalPath: '/contacto',
    });
    const { config } = useBusinessConfig();
    const [formData, setFormData] = useState({ nombre: '', email: '', mensaje: '' });
    const telefonoMostrado = config.whatsapp.startsWith('591')
        ? `+591 ${config.whatsapp.slice(3)}`
        : `+${config.whatsapp}`;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const mensaje = `Hola, soy ${formData.nombre}. Mi correo es ${formData.email}. Te escribo de Churo Hogar: ${formData.mensaje}`;
        const defaultPhone = config.whatsapp.replace(/\D/g, '');
        window.open(`https://wa.me/${defaultPhone}?text=${encodeURIComponent(mensaje)}`, '_blank');
    };

    return (
        <div className="min-h-screen flex flex-col font-sans selection:bg-red-900/10 selection:text-primary">
            <Navbar />

            <main className="flex-grow pt-12 pb-32 px-8 max-w-7xl mx-auto">

                {/* Header Premium */}
                <div className="text-center mb-16 space-y-8">
                    <h1 className="text-6xl md:text-8xl font-serif font-black leading-[1.03] italic tracking-tighter text-gray-900">
                        Hablemos de tu futuro <br />
                        <span className="text-primary-dark not-italic">hogar.</span>
                    </h1>

                    <p className="text-gray-400 text-lg font-medium max-w-2xl mx-auto leading-relaxed">
                        Nuestro equipo en Bolivia está listo para brindarte una asesoría personalizada, segura y transparente.
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-24 items-start">

                    {/* Formulario Premium */}
                    <div className="lg:col-span-7 bg-white p-12 md:p-20 rounded-[4rem] shadow-[0_64px_96px_-32px_rgba(0,0,0,0.08)] border border-gray-50 space-y-12 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-40 h-40 bg-red-900/5 rounded-full -translate-y-1/2 translate-x-1/2" />

                        <div className="space-y-2">
                            <h2 className="text-4xl font-serif font-black text-gray-900 tracking-tight">
                                Envíanos un mensaje
                            </h2>
                            <p className="text-gray-400 font-medium">
                                Te responderemos lo antes posible.
                            </p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-10">

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                                <div className="space-y-3">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-4">
                                        Nombre Completo
                                    </label>
                                    <div className="relative">
                                        <User className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-300" size={20} />
                                        <input
                                            required
                                            type="text"
                                            name="nombre"
                                            value={formData.nombre}
                                            onChange={handleChange}
                                            className="w-full bg-gray-50 border-none rounded-[1.5rem] py-6 pl-16 pr-8 text-sm font-bold focus:ring-4 focus:ring-red-900/5 transition-all outline-none"
                                            placeholder="Tu nombre"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-4">
                                        Email de Contacto
                                    </label>
                                    <div className="relative">
                                        <Mail className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-300" size={20} />
                                        <input
                                            required
                                            type="email"
                                            name="email"
                                            value={formData.email}
                                            onChange={handleChange}
                                            className="w-full bg-gray-50 border-none rounded-[1.5rem] py-6 pl-16 pr-8 text-sm font-bold focus:ring-4 focus:ring-red-900/5 transition-all outline-none"
                                            placeholder="correo@ejemplo.com"
                                        />
                                    </div>
                                </div>

                            </div>

                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-4">
                                    Tu Mensaje
                                </label>
                                <textarea
                                    required
                                    rows={5}
                                    name="mensaje"
                                    value={formData.mensaje}
                                    onChange={handleChange}
                                    className="w-full bg-gray-50 border-none rounded-[2rem] p-8 text-sm font-bold focus:ring-4 focus:ring-red-900/5 transition-all outline-none resize-none"
                                    placeholder="Cuéntanos qué necesitas..."
                                />
                            </div>

                            <button
                                type="submit"
                                className="w-full bg-primary hover:bg-black text-white font-black py-8 rounded-[2rem] shadow-2xl shadow-red-900/20 uppercase tracking-[0.3em] transition-all active:scale-95 text-xs flex items-center justify-center gap-4 group"
                            >
                                Enviar Solicitud
                                <ArrowRight size={18} className="group-hover:translate-x-2 transition-transform" />
                            </button>

                        </form>
                    </div>

                    {/* Vías Directas */}
                    <div className="lg:col-span-5 space-y-10">

                        <div className="space-y-6">
                            <h2 className="text-4xl font-serif font-black italic tracking-tighter">
                                Medios directos
                            </h2>
                            <p className="text-gray-400 text-lg font-medium leading-relaxed">
                                Si prefieres atención inmediata, contáctanos por nuestros canales directos.
                            </p>
                        </div>

                        <a
                            href={`https://wa.me/${config.whatsapp}`}
                            target="_blank"
                            rel="noreferrer"
                            className="group bg-emerald-500 hover:bg-primary text-white p-8 rounded-[3rem] flex items-center justify-between shadow-2xl shadow-emerald-500/10 transition-all duration-500 transform hover:scale-[1.02]"
                        >
                            <div className="flex items-center gap-8">
                                <div className="w-16 h-16 bg-white/20 rounded-[1.5rem] flex items-center justify-center backdrop-blur-md">
                                    <FaWhatsapp size={32} />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-1">
                                        WhatsApp Business
                                    </p>
                                    <p className="text-2xl font-black tracking-tight">
                                        {telefonoMostrado}
                                    </p>
                                </div>
                            </div>
                            <ArrowRight size={24} className="group-hover:translate-x-2 transition-transform" />
                        </a>

                        

                    </div>

                </div>

            </main>

            <Footer />
        </div>
    );
};