import { useEffect, useState } from 'react';
import client from '../api/client';
import { useSettings } from '../context/SettingsContext';

// Hazır renk seçenekleri — kullanıcı isterse doğrudan tıklayıp seçebilir,
// istemezse aşağıdaki renk seçiciyle (input type=color) serbest seçim yapar.
const PRESET_COLORS = ['#FF4713', '#0090FF', '#00C853', '#D6336C', '#7C3AED', '#B8860B'];

export default function Settings() {
  const { RestaurantName, ThemeColor, ProductOptionsPopupEnabled, updateLocalSettings } = useSettings();

  const [name, setName] = useState(RestaurantName || '');
  const [color, setColor] = useState(ThemeColor || '#FF4713');
  const [popupEnabled, setPopupEnabled] = useState(ProductOptionsPopupEnabled !== false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Context ilk yüklendiğinde (async fetch tamamlanınca) formu güncelle
  useEffect(() => { setName(RestaurantName || ''); }, [RestaurantName]);
  useEffect(() => { setColor(ThemeColor || '#FF4713'); }, [ThemeColor]);
  useEffect(() => { setPopupEnabled(ProductOptionsPopupEnabled !== false); }, [ProductOptionsPopupEnabled]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (!name.trim()) { setError('Restoran adı zorunludur.'); return; }

    setSubmitting(true);
    try {
      const res = await client.put('/settings', {
        RestaurantName: name.trim(),
        ThemeColor: color,
        ProductOptionsPopupEnabled: popupEnabled,
      });
      updateLocalSettings(res.data);
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Ayarlar kaydedilemedi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-10 max-w-2xl">
      <div className="mb-8">
        <p className="font-mono text-xs tracking-[0.3em] text-ember uppercase mb-2">
          Panel · Genel
        </p>
        <h1 className="font-display text-3xl font-semibold text-paper">Ayarlar</h1>
        <p className="font-body text-sm text-slate mt-1">
          Restoran adı ve vurgu rengi — tüm kullanıcılar için ortaktır, kaydedince anında uygulanır.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="border border-hairline rounded-sm bg-panel p-6 space-y-6">
        <div>
          <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
            Restoran Adı
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ör. Kafe Emirhan"
            maxLength={100}
            className="w-full max-w-sm border border-hairline rounded-sm px-3 py-2.5 font-body text-paper bg-charcoal
                       focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
          />
          <p className="font-mono text-[11px] text-slate mt-1.5">
            Sidebar başlığında ve giriş ekranında görünür.
          </p>
        </div>

        <div>
          <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
            Vurgu Rengi
          </label>
          <div className="flex items-center gap-3 mb-3">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-12 h-10 rounded-sm border border-hairline cursor-pointer bg-transparent"
            />
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="#FF4713"
              maxLength={7}
              className="w-32 border border-hairline rounded-sm px-3 py-2 font-mono text-sm uppercase text-paper bg-charcoal
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {PRESET_COLORS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setColor(preset)}
                title={preset}
                className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
                  color.toUpperCase() === preset ? 'border-paper' : 'border-hairline'
                }`}
                style={{ backgroundColor: preset }}
              />
            ))}
          </div>
          <p className="font-mono text-[11px] text-slate mt-2.5">
            Butonlar, aktif menü öğesi ve vurgu metinlerinde kullanılır (mevcut: <span style={{ color }}>{color}</span>).
          </p>
        </div>

        <div className="pt-2 border-t border-hairline">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={popupEnabled}
              onChange={(e) => setPopupEnabled(e.target.checked)}
              className="accent-ember w-4 h-4 mt-0.5 shrink-0"
            />
            <span>
              <span className="block font-mono text-xs uppercase tracking-wide text-slate">
                Ürün Seçenekleri Pop-up'ı
              </span>
              <span className="block font-mono text-[11px] text-slate mt-1">
                Açıkken, sipariş ekranında ekstra/şurubu olan bir ürüne tıklandığında seçim
                pop-up'ı açılır. Kapatırsan ürünler her zaman doğrudan sepete eklenir, pop-up
                hiç açılmaz (ekstra/şurup bağlı ürünlerde bile).
              </span>
            </span>
          </label>
        </div>

        {error && (
          <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3">{error}</p>
        )}
        {success && !error && (
          <p className="text-moss text-sm font-medium border-l-2 border-moss pl-3">Ayarlar kaydedildi.</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="font-mono text-sm uppercase tracking-wide text-cream bg-ember
                     hover:bg-ember/90 active:bg-ember/80 disabled:opacity-40 disabled:cursor-not-allowed
                     rounded-sm px-6 py-3 transition-colors shadow-sm"
        >
          {submitting ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
      </form>
    </div>
  );
}
