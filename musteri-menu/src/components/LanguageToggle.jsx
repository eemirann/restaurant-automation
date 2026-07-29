import { useLanguage } from '../i18n';

// Sağ üstte sabit duran TR/EN dil değiştirici — tüm görünümlerde (Menü/Sepet/Çağır) görünür.
export default function LanguageToggle() {
  const { lang, toggleLang } = useLanguage();

  return (
    <button
      type="button"
      onClick={toggleLang}
      className="fixed top-4 right-4 z-50 flex items-center rounded-full bg-white/90
                 backdrop-blur px-1 py-1 text-[10px] font-semibold tracking-wide shadow-card"
      aria-label="Dil değiştir / Switch language"
    >
      <span className={`rounded-full px-2.5 py-1.5 transition-colors ${lang === 'tr' ? 'bg-ink text-paper' : 'text-muted'}`}>TR</span>
      <span className={`rounded-full px-2.5 py-1.5 transition-colors ${lang === 'en' ? 'bg-ink text-paper' : 'text-muted'}`}>EN</span>
    </button>
  );
}
