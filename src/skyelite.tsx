import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Menu, X } from 'lucide-react';

declare global {
  interface Window { navigateTo: (screen: string) => void; }
  interface Navigator { connection?: { saveData?: boolean }; }
}
function Hero() {
  return (<div className="skyelite-hero relative min-h-[600px] flex items-center justify-center px-6 py-24 overflow-hidden border-b border-[#1E1B56]">
        
        <video id="hero-video" className="skyelite-video" muted loop playsInline autoPlay={!window.matchMedia("(prefers-reduced-motion: reduce)").matches && !navigator.connection?.saveData} preload="none" poster="images/hero_background.jpg" aria-hidden="true" tabIndex={-1}>
          <source data-src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_091828_e240eb17-6edc-4129-ad9d-98678e3fd238.mp4" type="video/mp4" />
        </video>
        <div className="hero-cloud-tint absolute inset-0" aria-hidden="true" />
        <div className="hero-cloud-bloom absolute inset-0" aria-hidden="true" />
        <div className="skyelite-shade absolute inset-0" aria-hidden="true" />
        <button id="hero-playback" className="skyelite-playback" type="button" aria-controls="hero-video" hidden>Reproduzir vídeo</button>
        
        <div className="skyelite-copy relative z-10 max-w-4xl text-center space-y-6 reveal-on-scroll">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#0D0B34]/90 border border-[#F59E0B]/40 text-xs font-semibold text-[#F59E0B] backdrop-blur-md shadow-lg shadow-[#F59E0B]/10">
            <span className="w-2 h-2 rounded-full bg-[#F59E0B] animate-ping"></span>
            Plataforma de Inteligência Aeronáutica com IA
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold font-heading text-white tracking-tight leading-tight">
            <span className="hero-title-line">Seus manuais a um</span><span className="hero-title-line">click de <span className="text-[#F59E0B] drop-shadow-[0_0_20px_rgba(245,158,11,0.6)]">distância</span></span>
          </h1>

          <p className="text-lg sm:text-xl text-[#94A3B8] max-w-2xl mx-auto font-light leading-relaxed">
            Plataforma moderna para consulta rápida de manuais de aviação, treinamentos interativos e resolução de panes em tempo real.
          </p>

          <div className="skyelite-actions pt-4 flex flex-wrap items-center justify-center gap-4">
            <button onClick={() => window.navigateTo("app-workspace")} className="px-8 py-4 rounded-xl bg-gradient-to-r from-[#F59E0B] to-[#E23B2E] text-white font-bold text-base shadow-xl shadow-[#F59E0B]/25 hover:scale-105 transition-all flex items-center gap-2.5">
              <i data-lucide="rocket" className="w-5 h-5"></i> Acessar Ferramentas
            </button>
            <button onClick={() => window.navigateTo("sobre-nos")} className="px-8 py-4 rounded-xl bg-[#0D0B34]/90 backdrop-blur-md border border-[#1E1B56] hover:border-[#F59E0B] text-white font-semibold text-base transition-all flex items-center gap-2">
              <i data-lucide="info" className="w-5 h-5 text-[#F59E0B]"></i> Conhecer o EasyManual
            </button>
          </div>

          
          <div className="skyelite-badges pt-8 grid grid-cols-2 sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
            <div className="p-3 rounded-xl bg-[#0D0B34]/80 border border-[#1E1B56] backdrop-blur-md text-left flex items-center gap-3">
              <i data-lucide="check-circle" className="w-5 h-5 text-[#F59E0B] shrink-0"></i>
              <div>
                <div className="text-xs font-bold text-white">100% Precisão</div>
                <div className="text-[10px] text-[#94A3B8]">Auditado por SMEs</div>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-[#0D0B34]/80 border border-[#1E1B56] backdrop-blur-md text-left flex items-center gap-3">
              <i data-lucide="zap" className="w-5 h-5 text-[#F59E0B] shrink-0"></i>
              <div>
                <div className="text-xs font-bold text-white">Busca em 2 Segundos</div>
                <div className="text-[10px] text-[#94A3B8]">Resolução de Panes</div>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-[#0D0B34]/80 border border-[#1E1B56] backdrop-blur-md text-left flex items-center gap-3 col-span-2 sm:col-span-1">
              <i data-lucide="shield" className="w-5 h-5 text-[#F59E0B] shrink-0"></i>
              <div>
                <div className="text-xs font-bold text-white">Frotas 121 & 135</div>
                <div className="text-[10px] text-[#94A3B8]">Airbus, Boeing, Embraer</div>
              </div>
            </div>
          </div>
        </div>
      </div>);
}

function MobileMenu() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); toggle.current?.focus(); }
    };
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('pointerdown', outside); };
  }, [open]);
  return <div ref={root}>
    <button ref={toggle} type="button" className="mobile-menu-toggle transition-colors" aria-label={open ? 'Fechar menu' : 'Abrir menu'} aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen(!open)}>
      {open ? <X size={22} /> : <Menu size={22} />}
    </button>
    {open && <nav id="mobile-navigation" aria-label="Navegação móvel" className="mobile-navigation">
      {([['Início','pagina-inicial'],['Sobre Nós','sobre-nos'],['Planos','planos'],['Workspace','app-workspace']] as const).map(([label,screen]) =>
        <button key={screen} className="transition-colors" onClick={() => { window.navigateTo(screen); setOpen(false); toggle.current?.focus(); }}>{label}</button>
      )}
    </nav>}
  </div>;
}
flushSync(() => {
  createRoot(document.getElementById('skyelite-hero-root')!).render(<Hero />);
  createRoot(document.getElementById('mobile-menu-root')!).render(<MobileMenu />);
});
