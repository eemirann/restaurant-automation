import { useLanguage } from '../i18n';

// Sağ üstte sabit duran TR/EN dil değiştirici — tüm görünümlerde (Menü/Sepet/Çağır) görünür.
export default function LanguageToggle() {
  const { lang, toggleLang } = useLanguage();

  return (
    <button
      type="button"
      onClick={toggleLang}
      className="fixed top-3 right-3 z-50 flex items-center rounded-full border border-hairline bg-panel/90
                 backdrop-blur px-1 py-1 font-mono text-[10px] font-semibold tracking-wide shadow-lg"
      aria-label="Dil değiştir / Switch language"
    >
      <span className={`rounded-full px-2 py-1 transition-colors ${lang === 'tr' ? 'bg-ember text-cream' : 'text-slate'}`}>TR</span>
      <span className={`rounded-full px-2 py-1 transition-colors ${lang === 'en' ? 'bg-ember text-cream' : 'text-slate'}`}>EN</span>
    </button>
  );
}
