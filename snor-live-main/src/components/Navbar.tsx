import { Menu, X } from 'lucide-react';
import { useState } from 'react';

interface NavbarProps {
  user:            any;
  t:               any;
  toggleLanguage:  () => void;
  onShowAuth:      () => void;
  onShowProfile:   () => void;
}

export default function Navbar({ user, t, toggleLanguage, onShowAuth, onShowProfile }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass-dark">
      <div className="container mx-auto px-4 py-3 sm:px-6 lg:px-8 max-w-7xl">
        <div className="flex items-center justify-between">

          {/* Logo */}
          <div className="relative flex-shrink-0">
            <span className="text-xl font-bold font-syne gradient-text">Snor Live</span>
            <div className="glow-dot absolute -top-1 -right-2" />
          </div>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-6">
            {(['home','features','gems','pricing','download'] as const).map(k => (
              <a key={k} href={`#${k}`} className="text-text-gray hover:text-accent-cyan transition-colors text-sm">
                {t.nav[k]}
              </a>
            ))}
          </div>

          {/* Desktop actions */}
          <div className="hidden md:flex items-center gap-3">
            <button onClick={toggleLanguage} className="lang-switch text-sm font-medium">{t.lang}</button>
            {user ? (
              <button onClick={onShowProfile} className="btn-primary text-sm px-4 py-2">👤 بروفايلي</button>
            ) : (
              <>
                <button className="btn-secondary text-sm px-4 py-2" onClick={onShowAuth}>{t.nav.login}</button>
                <button className="btn-primary text-sm px-4 py-2"   onClick={onShowAuth}>{t.nav.signup}</button>
              </>
            )}
          </div>

          {/* Mobile actions */}
          <div className="flex md:hidden items-center gap-2">
            {user ? (
              <button onClick={onShowProfile} className="btn-primary text-xs px-3 py-2">👤 بروفايلي</button>
            ) : (
              <button onClick={onShowAuth} className="btn-primary text-xs px-3 py-2">{t.nav.login}</button>
            )}
            <button className="p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-3 pb-4 border-t border-white/10 pt-3 space-y-3">
            {(['home','features','gems','pricing','download'] as const).map(k => (
              <a key={k} href={`#${k}`}
                className="block text-text-gray hover:text-accent-cyan transition-colors py-1"
                onClick={() => setMobileMenuOpen(false)}>
                {t.nav[k]}
              </a>
            ))}
            <div className="flex items-center gap-2 pt-3 border-t border-white/10">
              <button onClick={toggleLanguage} className="lang-switch text-sm font-medium flex-1 text-center">{t.lang}</button>
              {!user && (
                <button className="btn-secondary text-xs px-3 py-2"
                  onClick={() => { onShowAuth(); setMobileMenuOpen(false); }}>
                  {t.nav.login}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
