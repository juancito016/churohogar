import React, { useState } from 'react';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { ChevronDown } from 'lucide-react';
import { useSEO } from '../hooks/useSEO';

export const FAQ: React.FC = () => {
    useSEO({
        title: 'Guía para comprar y vender inmuebles en Tarija | Churo Hogar',
        description: 'Requisitos legales, documentación y pasos para comprar o vender una casa, departamento o terreno en Tarija y Bolivia.',
        canonicalPath: '/guia',
    });
    const [open, setOpen] = useState<number | null>(0);

    const toggle = (index: number) => {
        setOpen(open === index ? null : index);
    };

    const faqs = [
        {
            category: "Requisitos Legales para Venta",
            items: [
                {
                    q: "Folio Real Actualizado",
                    a: "Es el documento emitido por Derechos Reales que certifica el derecho propietario vigente. Debe estar actualizado y libre de gravámenes como hipotecas o embargos."
                },
                {
                    q: "Certificado Alodial",
                    a: "Certifica que la propiedad está libre de gravámenes y lista para transferencia. Se tramita en Derechos Reales."
                },
                {
                    q: "Impuestos al Día",
                    a: "Se deben presentar comprobantes del pago del Impuesto Municipal a la Propiedad de Bienes Inmuebles y cancelar el IMT (3% del valor de venta)."
                }
            ]
        },
        {
            category: "Documentación Técnica",
            items: [
                {
                    q: "Planimetría y Uso de Suelo",
                    a: "Documento emitido por la Alcaldía que certifica el uso permitido del inmueble y sus medidas oficiales."
                },
                {
                    q: "Catastro Municipal",
                    a: "Garantiza que la propiedad está registrada oficialmente en el municipio correspondiente."
                }
            ]
        }
    ];

    return (
        <div className="min-h-screen flex flex-col font-sans selection:bg-red-900/10 selection:text-primary">
            <Navbar />

            <main className="flex-grow pt-12 pb-32 px-8 max-w-7xl mx-auto">

                {/* Header Premium */}
                <div className="text-center mb-24 space-y-8">
                    <div className="inline-block px-8 py-3 bg-amber-500/5 text-accent rounded-full text-[10px] font-black uppercase tracking-[0.5em] border border-amber-500/10">
                        Centro de Ayuda
                    </div>

                    <h1 className="text-6xl md:text-8xl font-serif font-black italic tracking-tighter leading-[1.03] text-gray-900">
                        Guía legal <br />
                        <span className="text-primary-dark not-italic">y técnica</span>
                    </h1>

                    <p className="text-gray-400 text-lg font-medium max-w-xl mx-auto leading-relaxed">
                        Todo lo que necesitas saber antes de comprar o vender una propiedad en Bolivia.
                    </p>
                </div>

                {/* FAQ Sections */}
                <div className="space-y-16">
                    {faqs.map((section, sectionIndex) => (
                        <div key={sectionIndex} className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm hover:shadow-md transition-shadow p-12">

                            <h2 className="text-sm font-black uppercase tracking-[0.3em] text-primary mb-10">
                                {section.category}
                            </h2>

                            <div className="space-y-6">
                                {section.items.map((faq, i) => {
                                    const index = sectionIndex * 10 + i;
                                    const isOpen = open === index;

                                    return (
                                        <div key={index} className="border-b border-gray-50 pb-6">
                                            <button
                                                id={`faq-btn-${index}`}
                                                aria-expanded={isOpen}
                                                aria-controls={`faq-panel-${index}`}
                                                onClick={() => toggle(index)}
                                                className="w-full flex justify-between items-center text-left gap-4 min-h-[44px] py-2"
                                            >
                                                <span className="text-sm font-black uppercase tracking-[0.15em] text-gray-800">
                                                    {faq.q}
                                                </span>
                                                <ChevronDown
                                                    size={22}
                                                    aria-hidden="true"
                                                    className={`shrink-0 transition-transform duration-500 ${isOpen ? 'rotate-180 text-primary' : 'text-gray-300'}`}
                                                />
                                            </button>

                                            <div
                                                id={`faq-panel-${index}`}
                                                role="region"
                                                aria-labelledby={`faq-btn-${index}`}
                                                aria-hidden={!isOpen}
                                                className={`transition-all duration-500 ease-in-out overflow-hidden ${isOpen ? 'max-h-[600px] opacity-100 mt-4' : 'max-h-0 opacity-0'}`}
                                            >
                                                <p className="text-gray-500 text-base leading-relaxed font-medium">
                                                    {faq.a}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                {/* CTA Final 
                <div className="mt-24 bg-ink-strong p-16 rounded-[3rem] text-center text-white relative overflow-hidden shadow-2xl">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-red-900/10 rounded-full blur-[100px]" />

                    <h3 className="text-3xl font-serif font-black mb-6 tracking-tight">
                        ¿Tienes una situación especial?
                    </h3>

                    <p className="text-white/60 mb-10 max-w-lg mx-auto font-medium">
                        Problemas por herencias, deudas bancarias o documentación incompleta. Nuestro equipo puede asesorarte paso a paso.
                    </p>

                    <a
                        href="/contacto"
                        className="inline-block bg-primary hover:bg-black text-white px-12 py-5 rounded-[2rem] font-black uppercase tracking-[0.3em] text-xs transition-all active:scale-95 shadow-xl shadow-red-900/20"
                    >
                        Quiero Asesoría Legal
                    </a>
                </div>*/}

            </main>

            <Footer />
        </div>
    );
};