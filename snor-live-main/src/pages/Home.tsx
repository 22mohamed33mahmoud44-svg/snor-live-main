import { useEffect, useRef, useState } from 'react';
import {
  Video, PlayCircle, Star, ChevronRight,
  Download, ExternalLink, Instagram,
} from 'lucide-react';

interface HomeProps {
  lang:       'ar' | 'en';
  t:          any;
  user:       any;
  onShowAuth: () => void;
  onStartRandomMatch: () => void;
  onOpenBuyCoins?: () => void; // 🆕 مرجع لفتح شاشة الشحن مباشرة من اللونج بايدج
}

export default function Home({ lang, t, user, onShowAuth, onStartRandomMatch, onOpenBuyCoins }: HomeProps) {

  // ── PWA Install ──
  const deferredPrompt = useRef<any>(null);
  const [pwaReady,     setPwaReady]     = useState(false);
  const [pwaInstalled, setPwaInstalled] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); deferredPrompt.current = e; setPwaReady(true); };
    const onInstalled = () => { setPwaInstalled(true); setPwaReady(false); deferredPrompt.current = null; };
    globalThis.addEventListener('beforeinstallprompt', handler);
    globalThis.addEventListener('appinstalled', onInstalled);
    if (globalThis.matchMedia('(display-mode: standalone)').matches) setPwaInstalled(true);
    return () => {
      globalThis.removeEventListener('beforeinstallprompt', handler);
      globalThis.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt.current) {
      alert(lang === 'ar'
        ? 'على iPhone: اضغط زر المشاركة ← ثم "أضف إلى الشاشة الرئيسية"'
        : 'On iPhone: tap Share → then "Add to Home Screen"');
      return;
    }
    deferredPrompt.current.prompt();
    const { outcome } = await deferredPrompt.current.userChoice;
    if (outcome === 'accepted') { setPwaInstalled(true); setPwaReady(false); }
    deferredPrompt.current = null;
  };

  // ── Scroll animations ──
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => e.isIntersecting && e.target.classList.add('visible')),
      { threshold: 0.1 },
    );
    document.querySelectorAll('.fade-in-scroll').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // دالة الشراء الذكية المربوطة بالـ Webhook (حل مشاكل الربط المالي)
  const handlePurchasePackage = (_packageId: string) => {
    if (!user) {
      onShowAuth();
      return;
    }
    if (onOpenBuyCoins) {
      onOpenBuyCoins();
    } else {
      // لو معندوش وبيرندر السيرفر، يوجهه لتاب الرصيد بالداشبورد
      globalThis.location.hash = "#pricing";
    }
  };

  const InstallButton = ({ className = '' }: { className?: string }) => (
    <button type="button" onClick={handleInstall} disabled={pwaInstalled}
      className={`btn-primary flex items-center justify-center gap-2 ${className}`}>
      <Download size={18} />
      {pwaInstalled ? t.download.installedMsg : pwaReady ? t.download.installBtn : t.download.installBtn}
    </button>
  );

  const SectionHeader = ({ ar, en }: { ar: string; en: string }) => (
    <div className="text-center mb-12 md:mb-16 fade-in-scroll max-w-3xl mx-auto">
      <h2 className="text-4xl md:text-5xl font-bold mb-4 font-cairo">
        <span className="gradient-text">{ar}</span>
      </h2>
      <p className="text-xl text-text-gray font-inter">{en}</p>
    </div>
  );

  const FloatingGem = ({ className }: { className?: string }) => (
    <div className={`floating-gem ${className}`}>
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 bg-gradient-to-br from-diamond via-accent-cyan to-accent-blue rounded-sm rotate-45 transform animate-pulse-glow" />
        <div className="absolute inset-1 bg-gradient-to-br from-white/40 to-transparent rounded-sm rotate-45" />
      </div>
    </div>
  );

  return (
    <>
      <div className="gradient-mesh" aria-hidden="true" />

      {/* ── Hero ── */}
      <section id="home" className="min-h-screen flex items-center pt-16 md:pt-20 lg:pt-24">
        <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8 max-w-7xl">
          <div className="flex flex-col lg:grid lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:items-center">
            <div className="fade-in-scroll order-1 lg:order-2 text-center lg:text-right mb-6 lg:mb-0 lg:pr-6">
              <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 mb-5">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-sm text-text-gray font-cairo">🔴 الآن على الهواء</span>
              </div>
              <h1 className="font-bold leading-tight mb-5 font-cairo" style={{ fontSize: 'clamp(2rem, 8vw, 4.5rem)' }}>
                <span className="gradient-text">{lang === 'ar' ? 'بث مباشر. شات فيديو.' : 'Live Stream. Video Chat.'}</span>
                <br />
                <span className="text-white">{lang === 'ar' ? 'بلا حدود.' : 'No Limits.'}</span>
              </h1>
              <p className="text-text-gray mb-8 font-inter text-base md:text-lg">
                {lang === 'ar' ? 'تواصل مع العالم في ثوانٍ عشوائياً وآمناً' : 'Connect with the world in seconds securely'}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 mb-10 md:mb-0 lg:justify-start">
                <button type="button" className="btn-primary text-base py-4 flex items-center justify-center gap-2 w-full sm:w-auto sm:px-8 lg:min-w-[220px]"
                  onClick={() => user ? onStartRandomMatch() : onShowAuth()}>
                  🎥 {t.hero.cta}<ChevronRight size={18} />
                </button>
                <InstallButton className="text-base py-4 w-full sm:w-auto sm:px-8 lg:min-w-[220px]" />
              </div>
            </div>
            <div className="relative flex justify-center items-center fade-in-scroll order-2 lg:order-1 mb-8 lg:mb-0">
              <div className="relative">
                <FloatingGem className="absolute -top-8 -left-16 hidden md:block" />
                <FloatingGem className="absolute top-16 -right-16 animate-float-slow hidden md:block" />
                <div className="phone-mockup w-[240px] sm:w-[280px] md:w-[320px] relative mx-auto">
                  <div className="phone-screen h-[380px] sm:h-[440px] md:h-[520px] relative">
                    <div className="absolute inset-0 bg-gradient-to-b from-accent-purple/20 to-primary">
                      <img src="https://images.pexels.com/photos/3764119/pexels-photo-3764119.jpeg?auto=compress&cs=tinysrgb&w=400"
                        alt="Live Stream" className="w-full h-full object-cover opacity-90" />
                    </div>
                    <div className="absolute top-3 left-3 flex items-center gap-2 bg-red-600 px-2 py-1 rounded-lg">
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                      <span className="text-white text-xs font-bold">{t.hero.live}</span>
                    </div>
                    <div className="absolute top-3 right-3 flex items-center gap-1 glass px-2 py-1 rounded-lg">
                      <Video size={12} className="text-accent-cyan" />
                      <span className="text-white text-xs">23.4K</span>
                    </div>
                    <div className="absolute bottom-16 left-3 flex gap-2">
                      <span className="text-2xl animate-bounce-slow">💎</span>
                      <span className="text-2xl animate-bounce-slow" style={{ animationDelay: '0.2s' }}>⚡</span>
                      <span className="text-2xl animate-bounce-slow" style={{ animationDelay: '0.4s' }}>❤️</span>
                    </div>
                    <div className="absolute bottom-3 left-3 right-3 glass rounded-xl p-2">
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent-cyan to-accent-blue flex items-center justify-center text-base">👩</div>
                        <div>
                          <div className="text-white text-sm font-semibold">سارة أحمد</div>
                          <div className="text-text-gray text-xs">💎 12.5K</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="order-3 mt-8 grid grid-cols-2 md:grid-cols-4 gap-4 fade-in-scroll max-w-5xl mx-auto">
            {[
              { num: '+500K', label: t.stats.users },
              { num: '+80',   label: t.stats.countries },
              { num: '99%',   label: t.stats.verified },
              { num: '24/7',  label: t.stats.live },
            ].map(s => (
              <div key={s.num} className="text-center bg-white/5 rounded-2xl py-4 px-2">
                <div className="stat-number text-2xl md:text-3xl">{s.num}</div>
                <div className="text-text-gray text-xs mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-20">
        <div className="container mx-auto px-4">
          <SectionHeader ar={t.features.title} en={t.features.titleEn} />
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {t.features.items.map((f: any, i: number) => (
              <div key={i} className="neon-border rounded-2xl p-6 transition-all duration-300 fade-in-scroll">
                <div className="feature-icon w-14 h-14 mb-5"><f.icon className="w-7 h-7 text-accent-cyan" /></div>
                <h3 className="text-lg font-bold mb-2 font-cairo">{f.titleAr}</h3>
                <p className="text-text-gray font-inter text-sm mb-1">{f.titleEn}</p>
                <p className="text-text-gray text-sm mt-3 font-tajawal">{f.descAr}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Gems ── */}
      <section id="gems" className="py-20 relative overflow-hidden">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative z-10">
          <SectionHeader ar={t.gems.title} en={t.gems.titleEn} />
          <div className="grid md:grid-cols-3 gap-6 mb-14">
            {t.gems.steps.map((step: any, i: number) => (
              <div key={i} className="fade-in-scroll flex flex-col items-center text-center">
                <div className="step-number mb-5"><step.icon className="w-6 h-6 text-white" /></div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-diamond text-xl">💎</span>
                  <h3 className="text-lg font-bold font-cairo">{step.titleAr}</h3>
                </div>
                <p className="text-text-gray text-sm font-tajawal">{step.descAr}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
            {t.gems.packages.map((pkg: any, i: number) => {
              // تحديد الـ ID الفعلي المربوط بـ جدول الأسعار والـ Webhook
              const pkgIds = ['pkg_100', 'pkg_500', 'pkg_1000', 'pkg_1000'];
              const currentPkgId = pkgIds[i % pkgIds.length];

              return (
                <div key={i} className={`gem-package relative glass rounded-2xl p-5 fade-in-scroll ${pkg.popular ? 'ring-2 ring-diamond' : ''}`}>
                  {pkg.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-accent-blue to-accent-purple px-3 py-0.5 rounded-full text-xs font-bold whitespace-nowrap">
                      ⭐ {t.gems.mostValue}
                    </div>
                  )}
                  <div className="text-center">
                    <div className="text-4xl mb-3 gem-sparkle">💎</div>
                    <div className="text-2xl font-bold gradient-text mb-1">{pkg.gems.toLocaleString()}</div>
                    <div className="text-text-gray text-xs mb-3">{t.gems.gemsText}</div>
                    <div className="text-xl font-bold text-white mb-3">{pkg.price} <span className="text-xs text-text-gray">{t.gems.currency}</span></div>
                    {/* تشغيل دالة الدفع الحقيقية والمؤمنة بالـ Webhook عند الضغط */}
                    <button type="button" onClick={() => handlePurchasePackage(currentPkgId)} className={`w-full py-2.5 rounded-lg font-semibold text-sm ${pkg.popular ? 'btn-primary' : 'btn-secondary'}`}>{t.pricing.selectPlan}</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-center glass rounded-xl p-4 inline-flex items-center gap-3 mx-auto fade-in-scroll">
            <span className="text-diamond text-lg">💎</span>
            <span className="text-white font-tajawal text-sm">{t.gems.conversionAr}</span>
          </div>
        </div>
      </section>

      {/* ── Monetization ── */}
      <section className="py-20 bg-gradient-to-b from-primary via-accent-purple/10 to-primary">
        <div className="container mx-auto px-4">
          <SectionHeader ar={t.monetization.title} en={t.monetization.titleEn} />
          <div className="grid md:grid-cols-3 gap-6">
            {t.monetization.items.map((item: any, i: number) => (
              <div key={i} className="glass rounded-2xl p-6 fade-in-scroll">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-diamond/20 to-accent-purple/20 flex items-center justify-center mb-5">
                  <item.icon className="w-7 h-7 text-diamond" />
                </div>
                <h3 className="text-lg font-bold mb-2 font-cairo">{item.titleAr}</h3>
                <p className="text-text-gray text-sm font-tajawal">{item.descAr}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <SectionHeader ar={t.howItWorks.title} en={t.howItWorks.titleEn} />
          <div className="grid md:grid-cols-3 gap-10">
            {t.howItWorks.steps.map((step: any, i: number) => (
              <div key={i} className="text-center fade-in-scroll">
                <div className="flex justify-center mb-5"><div className="step-number">{i + 1}</div></div>
                <h3 className="text-lg font-bold mb-2 font-cairo">{step.ar}</h3>
                <p className="text-text-gray font-inter text-sm">{step.en}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="py-20 bg-gradient-to-b from-primary via-accent-blue/5 to-primary">
        <div className="container mx-auto px-4">
          <SectionHeader ar={t.testimonials.title} en={t.testimonials.titleEn} />
          <div className="grid md:grid-cols-3 gap-6">
            {t.testimonials.items.map((item: any, i: number) => (
              <div key={i} className="glass rounded-2xl p-6 fade-in-scroll">
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, j) => (
                    <Star key={j} className={`w-4 h-4 ${j < item.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600'}`} />
                  ))}
                </div>
                <p className="text-text-gray mb-5 font-tajawal text-sm leading-relaxed">"{lang === 'ar' ? item.text : item.textEn}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent-cyan to-accent-purple flex items-center justify-center text-lg">{item.name.charAt(0)}</div>
                  <div>
                    <div className="font-semibold font-cairo text-sm">{item.name}</div>
                    <div className="text-text-gray text-xs">{lang === 'ar' ? item.role : item.roleEn}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-20">
        <div className="container mx-auto px-4">
          <SectionHeader ar={t.pricing.title} en={t.pricing.titleEn} />
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <div className="glass rounded-2xl p-6 fade-in-scroll">
              <div className="text-center mb-5"><span className="text-3xl">🆓</span><h3 className="text-xl font-bold mt-3 font-cairo">{t.pricing.free.title}</h3></div>
              <div className="text-center mb-6"><span className="text-4xl font-bold">{t.pricing.free.price}</span></div>
              <ul className="space-y-2 mb-6">{t.pricing.free.features.map((f: string, i: number) => <li key={i} className="flex items-center gap-2 text-text-gray text-sm"><div className="w-1.5 h-1.5 rounded-full bg-accent-cyan" /><span className="font-tajawal">{f}</span></li>)}</ul>
              <button type="button" onClick={() => handlePurchasePackage('pkg_100')} className="w-full btn-secondary">{t.pricing.selectPlan}</button>
            </div>
            <div className="relative neon-border rounded-2xl p-6 scale-105 fade-in-scroll">
              <div className="popular-badge">{t.pricing.popular}</div>
              <div className="text-center mb-5"><span className="text-3xl">⭐</span><h3 className="text-xl font-bold mt-3 font-cairo">{t.pricing.pro.title}</h3></div>
              <div className="text-center mb-6"><span className="text-4xl font-bold gradient-text">{t.pricing.pro.price}</span><span className="text-text-gray text-sm ml-1">{lang === 'ar' ? t.pricing.pro.period : t.pricing.pro.periodEn}</span></div>
              <ul className="space-y-2 mb-6">{t.pricing.pro.features.map((f: string, i: number) => <li key={i} className="flex items-center gap-2 text-text-gray text-sm"><div className="w-1.5 h-1.5 rounded-full bg-diamond" /><span className="font-tajawal">{f}</span></li>)}</ul>
              <button type="button" onClick={() => handlePurchasePackage('pkg_500')} className="w-full btn-primary">{t.pricing.selectPlan}</button>
            </div>
            <div className="glass rounded-2xl p-6 fade-in-scroll">
              <div className="text-center mb-5"><span className="text-3xl">👑</span><h3 className="text-xl font-bold mt-3 font-cairo">{t.pricing.vip.title}</h3></div>
              <div className="text-center mb-6"><span className="text-4xl font-bold">{t.pricing.vip.price}</span><span className="text-text-gray text-sm ml-1">{lang === 'ar' ? t.pricing.vip.period : t.pricing.vip.periodEn}</span></div>
              <ul className="space-y-2 mb-6">{t.pricing.vip.features.map((f: string, i: number) => <li key={i} className="flex items-center gap-2 text-text-gray text-sm"><div className="w-1.5 h-1.5 rounded-full bg-accent-purple" /><span className="font-tajawal">{f}</span></li>)}</ul>
              <button type="button" onClick={() => handlePurchasePackage('pkg_1000')} className="w-full btn-secondary">{t.pricing.selectPlan}</button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Download ── */}
      <section id="download" className="py-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-accent-blue/20 via-accent-purple/20 to-diamond/20 blur-3xl" />
        <div className="container mx-auto px-4 relative z-10 text-center max-w-xl mx-auto fade-in-scroll">
          <h2 className="text-4xl font-bold mb-4 font-cairo"><span className="gradient-text">{t.download.title}</span></h2>
          <p className="text-text-gray mb-10 font-tajawal">{t.download.subtitle}</p>
          <div className="flex flex-col items-center gap-4 mb-8">
            <InstallButton className="text-lg py-4 px-10 w-full sm:w-auto" />
            {pwaInstalled && <p className="text-text-gray text-sm font-tajawal">{lang === 'ar' ? 'التطبيق مثبّت على جهازك ✅' : 'App is installed on your device ✅'}</p>}
          </div>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a href="#" className="glass rounded-xl px-6 py-4 flex items-center gap-3 hover:bg-white/10 transition-all">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center"><PlayCircle className="w-6 h-6 text-primary" /></div>
              <div className="text-right"><div className="text-xs text-text-gray">Download on the</div><div className="font-semibold">{t.download.appStore}</div></div>
              <ExternalLink className="w-4 h-4 text-text-gray" />
            </a>
            <a href="#" className="glass rounded-xl px-6 py-4 flex items-center gap-3 hover:bg-white/10 transition-all">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center"><Download className="w-6 h-6 text-primary" /></div>
              <div className="text-right"><div className="text-xs text-text-gray">Get it on</div><div className="font-semibold">{t.download.playStore}</div></div>
              <ExternalLink className="w-4 h-4 text-text-gray" />
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-10 border-t border-white/10">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl font-bold font-syne gradient-text">Snor Live</span>
                <div className="glow-dot" />
              </div>
              <p className="text-text-gray text-sm font-tajawal">منصة البث المباشر والشات فيديو</p>
              <div className="flex gap-3 mt-4">
                <a href="#" className="glass rounded-lg p-2 hover:bg-white/10 transition-all"><Instagram className="w-4 h-4 text-text-gray" /></a>
                <a href="#" className="glass rounded-lg p-2 hover:bg-white/10 transition-all">
                  <svg className="w-4 h-4 text-text-gray" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                </a>
              </div>
            </div>
            <div>
              <h4 className="font-bold mb-3 font-cairo text-sm">{t.footer.sections.product.ar}</h4>
              <ul className="space-y-2">{(['features','gems','pricing'] as const).map(k => <li key={k}><a href={`#${k}`} className="text-text-gray text-sm hover:text-accent-cyan transition-colors">{t.nav[k]}</a></li>)}</ul>
            </div>
            <div>
              <h4 className="font-bold mb-3 font-cairo text-sm">{t.footer.sections.company.ar}</h4>
              <ul className="space-y-2">{[lang==='ar'?'من نحن':'About', lang==='ar'?'وظائف':'Careers'].map(l => <li key={l}><a href="#" className="text-text-gray text-sm hover:text-accent-cyan">{l}</a></li>)}</ul>
            </div>
            <div>
              <h4 className="font-bold mb-3 font-cairo text-sm">{t.footer.sections.support.ar}</h4>
              <ul className="space-y-2">{[lang==='ar'?'مركز المساعدة':'Help Center', lang==='ar'?'تواصل معنا':'Contact'].map(l => <li key={l}><a href="#" className="text-text-gray text-sm hover:text-accent-cyan">{l}</a></li>)}</ul>
            </div>
          </div>
          <div className="pt-6 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-3">
            <p className="text-text-gray text-xs">© 2026 Snor Live. {t.footer.rights}.</p>
            <div className="flex gap-4">
              <a href="#" className="text-text-gray text-xs hover:text-accent-cyan">{lang==='ar'?'سياسة الخصوصية':'Privacy'}</a>
              <a href="#" className="text-text-gray text-xs hover:text-accent-cyan">{lang==='ar'?'شروط الخدمة':'Terms'}</a>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}