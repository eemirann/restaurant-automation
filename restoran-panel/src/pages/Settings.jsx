import { useEffect, useState } from 'react';
import client from '../api/client';
import { useSettings } from '../context/SettingsContext';
import { useTheme } from '../context/ThemeContext';
import TableAreasManager from '../components/TableAreasManager';

// Hazır renk seçenekleri — kullanıcı isterse doğrudan tıklayıp seçebilir,
// istemezse aşağıdaki renk seçiciyle (input type=color) serbest seçim yapar.
const PRESET_COLORS = ['#FF4713', '#0090FF', '#00C853', '#D6336C', '#7C3AED', '#B8860B'];

const TABS = [
  { key: 'genel', label: 'Genel' },
  { key: 'gorunum', label: 'Görünüm' },
  { key: 'vergi', label: 'Vergi & Fatura' },
  { key: 'siparis', label: 'Sipariş & Ödeme' },
  { key: 'donanim', label: 'Donanım' },
  { key: 'masalar', label: 'Masa Alanları' },
  { key: 'sistem', label: 'Sistem' },
];

const inputClass = 'w-full border border-hairline rounded-sm px-3 py-2.5 font-body text-sm text-paper bg-charcoal ' +
  'focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember';

// Henüz yapılmayan (yol haritasındaki) özellikler için tutarlı bir not kutusu.
function ComingSoonNote({ children }) {
  return (
    <p className="font-mono text-[11px] text-slate border border-dashed border-hairline rounded-sm px-3 py-2.5 bg-charcoal/50">
      Sırada: {children}
    </p>
  );
}

export default function Settings() {
  const {
    RestaurantName, ThemeColor, ProductOptionsPopupEnabled, StockChartEnabled, KitchenAutoPrintEnabled,
    EArsivVatRate, PrinterPaperWidth, LoyaltyPointsRate, CafeNote, SocialInstagram, SocialFacebook, SocialX, SocialWhatsapp,
    ContactPhone, ContactAddress, TaxNumber, TaxOffice, BillingAddress,
    AutoBackupEnabled, AutoBackupRetentionDays,
    updateLocalSettings,
  } = useSettings();
  const { theme, toggleTheme } = useTheme();

  const [activeTab, setActiveTab] = useState('genel');

  const [name, setName] = useState(RestaurantName || '');
  const [color, setColor] = useState(ThemeColor || '#FF4713');
  const [popupEnabled, setPopupEnabled] = useState(ProductOptionsPopupEnabled !== false);
  const [stockChartEnabled, setStockChartEnabled] = useState(StockChartEnabled !== false);
  const [kitchenAutoPrintEnabled, setKitchenAutoPrintEnabled] = useState(KitchenAutoPrintEnabled !== false);
  const [vatRate, setVatRate] = useState(EArsivVatRate ?? 10);
  const [printerPaperWidth, setPrinterPaperWidth] = useState(PrinterPaperWidth ?? 80);
  const [loyaltyRate, setLoyaltyRate] = useState(LoyaltyPointsRate ?? 10);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(AutoBackupEnabled === true);
  const [autoBackupRetentionDays, setAutoBackupRetentionDays] = useState(AutoBackupRetentionDays ?? 7);

  const [cafeNote, setCafeNote] = useState(CafeNote || '');
  const [instagram, setInstagram] = useState(SocialInstagram || '');
  const [facebook, setFacebook] = useState(SocialFacebook || '');
  const [xHandle, setXHandle] = useState(SocialX || '');
  const [whatsapp, setWhatsapp] = useState(SocialWhatsapp || '');
  const [contactPhone, setContactPhone] = useState(ContactPhone || '');
  const [contactAddress, setContactAddress] = useState(ContactAddress || '');

  const [taxNumber, setTaxNumber] = useState(TaxNumber || '');
  const [taxOffice, setTaxOffice] = useState(TaxOffice || '');
  const [billingAddress, setBillingAddress] = useState(BillingAddress || '');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Context ilk yüklendiğinde (async fetch tamamlanınca) formu güncelle
  useEffect(() => { setName(RestaurantName || ''); }, [RestaurantName]);
  useEffect(() => { setColor(ThemeColor || '#FF4713'); }, [ThemeColor]);
  useEffect(() => { setPopupEnabled(ProductOptionsPopupEnabled !== false); }, [ProductOptionsPopupEnabled]);
  useEffect(() => { setStockChartEnabled(StockChartEnabled !== false); }, [StockChartEnabled]);
  useEffect(() => { setKitchenAutoPrintEnabled(KitchenAutoPrintEnabled !== false); }, [KitchenAutoPrintEnabled]);
  useEffect(() => { setVatRate(EArsivVatRate ?? 10); }, [EArsivVatRate]);
  useEffect(() => { setPrinterPaperWidth(PrinterPaperWidth ?? 80); }, [PrinterPaperWidth]);
  useEffect(() => { setLoyaltyRate(LoyaltyPointsRate ?? 10); }, [LoyaltyPointsRate]);
  useEffect(() => { setAutoBackupEnabled(AutoBackupEnabled === true); }, [AutoBackupEnabled]);
  useEffect(() => { setAutoBackupRetentionDays(AutoBackupRetentionDays ?? 7); }, [AutoBackupRetentionDays]);
  useEffect(() => { setCafeNote(CafeNote || ''); }, [CafeNote]);
  useEffect(() => { setInstagram(SocialInstagram || ''); }, [SocialInstagram]);
  useEffect(() => { setFacebook(SocialFacebook || ''); }, [SocialFacebook]);
  useEffect(() => { setXHandle(SocialX || ''); }, [SocialX]);
  useEffect(() => { setWhatsapp(SocialWhatsapp || ''); }, [SocialWhatsapp]);
  useEffect(() => { setContactPhone(ContactPhone || ''); }, [ContactPhone]);
  useEffect(() => { setContactAddress(ContactAddress || ''); }, [ContactAddress]);
  useEffect(() => { setTaxNumber(TaxNumber || ''); }, [TaxNumber]);
  useEffect(() => { setTaxOffice(TaxOffice || ''); }, [TaxOffice]);
  useEffect(() => { setBillingAddress(BillingAddress || ''); }, [BillingAddress]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (!name.trim()) { setError('Restoran adı zorunludur.'); return; }
    if (vatRate === '' || Number(vatRate) < 0 || Number(vatRate) > 100) {
      setError('KDV oranı 0-100 arasında olmalıdır.');
      return;
    }
    if (autoBackupRetentionDays === '' || Number(autoBackupRetentionDays) < 1 || Number(autoBackupRetentionDays) > 365) {
      setError('Saklama süresi 1-365 gün arasında olmalıdır.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await client.put('/settings', {
        RestaurantName: name.trim(),
        ThemeColor: color,
        ProductOptionsPopupEnabled: popupEnabled,
        StockChartEnabled: stockChartEnabled,
        KitchenAutoPrintEnabled: kitchenAutoPrintEnabled,
        EArsivVatRate: Number(vatRate),
        PrinterPaperWidth: Number(printerPaperWidth),
        LoyaltyPointsRate: Number(loyaltyRate),
        AutoBackupEnabled: autoBackupEnabled,
        AutoBackupRetentionDays: Number(autoBackupRetentionDays),
        CafeNote: cafeNote.trim() || null,
        SocialInstagram: instagram.trim() || null,
        SocialFacebook: facebook.trim() || null,
        SocialX: xHandle.trim() || null,
        SocialWhatsapp: whatsapp.trim() || null,
        ContactPhone: contactPhone.trim() || null,
        ContactAddress: contactAddress.trim() || null,
        TaxNumber: taxNumber.trim() || null,
        TaxOffice: taxOffice.trim() || null,
        BillingAddress: billingAddress.trim() || null,
      });
      updateLocalSettings(res.data);
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Ayarlar kaydedilemedi.');
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Masa Alanları sekmesi (kendi verisi, ayrı uç: /table-areas) ----
  const [areas, setAreas] = useState([]);
  const fetchAreas = () => client.get('/table-areas', { params: { all: '1' } }).then((res) => setAreas(res.data)).catch(() => {});
  useEffect(() => { fetchAreas(); }, []);

  // ---- e-Fatura sağlayıcı ayarları (ayrı, sadece-Admin uç — API anahtarı
  // taşıdığı için GENEL /settings'ten (herkese açık) BİLEREK ayrı tutuluyor) ----
  const [providerLoaded, setProviderLoaded] = useState(false);
  const [providerName, setProviderName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [environment, setEnvironment] = useState('sandbox');
  const [providerSubmitting, setProviderSubmitting] = useState(false);
  const [providerError, setProviderError] = useState('');
  const [providerSuccess, setProviderSuccess] = useState(false);

  useEffect(() => {
    client.get('/invoice-provider-settings')
      .then((res) => {
        setProviderName(res.data.ProviderName || '');
        setApiKey(res.data.ApiKey || '');
        setEnvironment(res.data.Environment || 'sandbox');
      })
      .catch(() => {})
      .finally(() => setProviderLoaded(true));
  }, []);

  const handleProviderSubmit = async () => {
    setProviderError('');
    setProviderSuccess(false);
    setProviderSubmitting(true);
    try {
      await client.put('/invoice-provider-settings', {
        ProviderName: providerName.trim() || null,
        ApiKey: apiKey.trim() || null,
        Environment: environment,
      });
      setProviderSuccess(true);
    } catch (err) {
      setProviderError(err.response?.data?.error || 'Sağlayıcı ayarları kaydedilemedi.');
    } finally {
      setProviderSubmitting(false);
    }
  };

  // ---- Otomatik Yedekleme sekmesi (son yedekler listesi + anlık yedek tetikleme) ----
  const [backups, setBackups] = useState([]);
  const fetchBackups = () => client.get('/settings/backups').then((res) => setBackups(res.data)).catch(() => {});
  useEffect(() => { fetchBackups(); }, []);

  const [backupNowLoading, setBackupNowLoading] = useState(false);
  const [backupNowError, setBackupNowError] = useState('');

  const handleBackupNow = async () => {
    setBackupNowError('');
    setBackupNowLoading(true);
    try {
      await client.post('/settings/backup-now');
      await fetchBackups();
    } catch (err) {
      setBackupNowError(err.response?.data?.error || 'Yedekleme başarısız.');
    } finally {
      setBackupNowLoading(false);
    }
  };

  const formatBackupSize = (bytes) => {
    if (bytes === null || bytes === undefined) return '—';
    const mb = bytes / (1024 * 1024);
    return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
  };

  const formatBackupDate = (iso) =>
    iso ? new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div className="p-10">
      <div className="mb-8">
        <p className="font-mono text-xs tracking-[0.3em] text-ember uppercase mb-2">
          Panel · Genel
        </p>
        <h1 className="font-display text-3xl font-semibold text-paper">Ayarlar</h1>
        <p className="font-body text-sm text-slate mt-1">
          Kaydedince tüm kullanıcılar için anında uygulanır.
        </p>
      </div>

      <div className="border border-hairline rounded-sm bg-panel overflow-hidden flex items-start">
        {/* Sol: dikey sekme listesi */}
        <div className="w-56 shrink-0 border-r border-hairline py-3 self-stretch">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`w-full text-left font-mono text-xs uppercase tracking-wide px-5 py-3 border-l-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-ember text-ember font-semibold bg-ember/5'
                  : 'border-transparent text-slate hover:text-paper hover:bg-hairline/30'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Sağ: geniş içerik paneli */}
        <div className="flex-1 min-w-0 p-8 max-w-4xl">
          {activeTab === 'masalar' ? (
            <TableAreasManager areas={areas} onChanged={fetchAreas} />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {activeTab === 'genel' && (
                <>
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
                      className={`max-w-sm ${inputClass}`}
                    />
                    <p className="font-mono text-[11px] text-slate mt-1.5">
                      Sidebar başlığında ve giriş ekranında görünür.
                    </p>
                  </div>

                  <ComingSoonNote>
                    Logo yükleme (sidebar, giriş ekranı, QR menü üstü ve fişlerde kullanılacak) ve
                    Açılış/Kapanış Saati (QR menüde "şu an kapalı" göstermek için).
                  </ComingSoonNote>

                  <div className="pt-2 border-t border-hairline">
                    <p className="font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
                      Müşteri QR Menüsü · Bilgi Paneli
                    </p>
                    <p className="font-mono text-[11px] text-slate mb-4">
                      Müşteri QR menüsünde sol üstteki ☰ butonuna basınca açılan panelde görünür: kafe adı
                      altında bir not, sosyal medya linkleri ve iletişim bilgisi. Boş bırakılan alanlar
                      hiç gösterilmez.
                    </p>

                    <div className="space-y-4">
                      <div>
                        <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
                          Kafe Notu
                        </label>
                        <textarea
                          value={cafeNote}
                          onChange={(e) => setCafeNote(e.target.value)}
                          rows={2}
                          maxLength={300}
                          placeholder="ör. Özenle kavrulmuş kahveler, ev yapımı tatlılar."
                          className={inputClass}
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Instagram</label>
                          <input type="text" value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="https://instagram.com/..." className={inputClass} />
                        </div>
                        <div>
                          <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Facebook</label>
                          <input type="text" value={facebook} onChange={(e) => setFacebook(e.target.value)} placeholder="https://facebook.com/..." className={inputClass} />
                        </div>
                        <div>
                          <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">X (Twitter)</label>
                          <input type="text" value={xHandle} onChange={(e) => setXHandle(e.target.value)} placeholder="https://x.com/..." className={inputClass} />
                        </div>
                        <div>
                          <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">WhatsApp Numarası</label>
                          <input type="text" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="905551234567" className={inputClass} />
                        </div>
                        <div>
                          <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Telefon</label>
                          <input type="text" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+90 555 000 00 00" className={inputClass} />
                        </div>
                        <div>
                          <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Adres</label>
                          <input type="text" value={contactAddress} onChange={(e) => setContactAddress(e.target.value)} placeholder="Mah. Sk. No, İlçe/Şehir" className={inputClass} />
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'gorunum' && (
                <>
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
                    <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-2">
                      Tema
                    </label>
                    <button
                      type="button"
                      onClick={toggleTheme}
                      className="flex items-center gap-3 border border-hairline rounded-sm px-4 py-2.5 hover:border-ember transition-colors"
                    >
                      <span
                        className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${theme === 'dark' ? 'bg-ember' : 'bg-hairline'}`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-cream shadow-sm transition-transform ${
                            theme === 'dark' ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </span>
                      <span className="font-mono text-xs uppercase tracking-wide text-paper">
                        {theme === 'dark' ? 'Koyu Mod' : 'Açık Mod'}
                      </span>
                    </button>
                    <p className="font-mono text-[11px] text-slate mt-2">
                      Bu tarayıcıda saklanır (sidebar'daki anahtarla aynıdır).
                    </p>
                  </div>

                  <ComingSoonNote>
                    Panel dili (TR/EN) — müşteri QR menüsüne eklediğimiz sistemin personel paneline
                    taşınması; panelin tamamının çevrilmesi gerektiğinden ayrı bir iş olarak planlanıyor.
                  </ComingSoonNote>
                </>
              )}

              {activeTab === 'vergi' && (
                <>
                  <div>
                    <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
                      e-Arşiv KDV Oranı (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={vatRate}
                      onChange={(e) => setVatRate(e.target.value)}
                      className="w-32 border border-hairline rounded-sm px-3 py-2.5 font-mono text-paper bg-charcoal
                                 focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
                    />
                    <p className="font-mono text-[11px] text-slate mt-1.5">
                      Fatura kesilirken menü fiyatının bu oranda KDV içerdiği varsayılır (yeme-içme için
                      Türkiye'de yaygın oran %10'dur).
                    </p>
                  </div>

                  <div className="pt-2 border-t border-hairline grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Vergi No</label>
                      <input type="text" value={taxNumber} onChange={(e) => setTaxNumber(e.target.value)} placeholder="1234567890" className={inputClass} />
                    </div>
                    <div>
                      <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Vergi Dairesi</label>
                      <input type="text" value={taxOffice} onChange={(e) => setTaxOffice(e.target.value)} placeholder="ör. Kadıköy V.D." className={inputClass} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Fatura Adresi</label>
                      <input type="text" value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} placeholder="Fatura kesiminde kullanılacak açık adres" className={inputClass} />
                    </div>
                  </div>
                  <p className="font-mono text-[11px] text-slate">
                    Bu bilgiler e-Arşiv faturasında satıcı (işletme) bilgisi olarak kullanılacak — gerçek
                    bir entegratöre bağlanınca zorunlu hale gelir. Şu an test/mock fatura üretiliyor
                    (bkz. Faturalar sayfası).
                  </p>

                  {/* e-Fatura sağlayıcı — ayrı uç, ayrı kaydet (API anahtarı taşıdığı için) */}
                  <div className="pt-4 border-t border-hairline">
                    <p className="font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
                      e-Fatura Sağlayıcı
                    </p>
                    <p className="font-mono text-[11px] text-slate mb-4">
                      Foriba, Uyumsoft, Nesbilgi gibi bir entegratörle anlaştığınızda buraya girin.
                      Henüz gerçek bir API çağrısında kullanılmıyor (utils/invoiceProvider.js hâlâ mock) —
                      entegratör netleşince bu ayarları okuyacak şekilde bağlanacak. Güvenlik nedeniyle bu
                      bölüm ayrı kaydedilir (genel ayarlarla birlikte gönderilmez).
                    </p>

                    {!providerLoaded ? (
                      <p className="font-mono text-xs text-slate">Yükleniyor...</p>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Sağlayıcı Adı</label>
                            <input type="text" value={providerName} onChange={(e) => setProviderName(e.target.value)} placeholder="ör. Foriba" className={inputClass} />
                          </div>
                          <div>
                            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Ortam</label>
                            <select
                              value={environment}
                              onChange={(e) => setEnvironment(e.target.value)}
                              className={`${inputClass} bg-charcoal`}
                            >
                              <option value="sandbox">Test (Sandbox)</option>
                              <option value="production">Canlı (Production)</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">API Anahtarı</label>
                          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="••••••••" className={inputClass} autoComplete="off" />
                        </div>

                        {providerError && (
                          <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3">{providerError}</p>
                        )}
                        {providerSuccess && !providerError && (
                          <p className="text-moss text-sm font-medium border-l-2 border-moss pl-3">Sağlayıcı ayarları kaydedildi.</p>
                        )}

                        <button
                          type="button"
                          onClick={handleProviderSubmit}
                          disabled={providerSubmitting}
                          className="font-mono text-xs uppercase tracking-wide text-cream bg-ember
                                     hover:bg-ember/90 disabled:opacity-40 rounded-sm px-4 py-2.5 transition-colors"
                        >
                          {providerSubmitting ? 'Kaydediliyor...' : 'Sağlayıcı Ayarlarını Kaydet'}
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}

              {activeTab === 'siparis' && (
                <>
                  <div>
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
                          pop-up'ı açılır. Kapatırsan ürünler her zaman doğrudan sepete eklenir.
                        </span>
                      </span>
                    </label>
                  </div>

                  <div className="pt-2 border-t border-hairline">
                    <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
                      Sadaklık Puanı Oranı (100 TL başına puan)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={loyaltyRate}
                      onChange={(e) => setLoyaltyRate(e.target.value)}
                      className="w-32 border border-hairline rounded-sm px-3 py-2.5 font-mono text-paper bg-charcoal
                                 focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
                    />
                    <p className="font-mono text-[11px] text-slate mt-1.5">
                      Müşteri QR menüsünde checkout'ta kullanıcı adı girip sipariş verirse (kimlik
                      doğrulaması yok, sadece bir kullanıcı adı), sipariş onaylandığında bu orana göre
                      puan kazanır. Ürünlere "Ürünler" sayfasından puan karşılığı (LoyaltyPointCost)
                      atayabilirsiniz — personel Masalar ekranından bu puanla ürünü ücretsiz ekleyebilir.
                    </p>
                  </div>

                  <ComingSoonNote>
                    Para Birimi (çoklu restoran/ülke kurulumu düşünülüyorsa), Servis Ücreti (%/sabit,
                    ödeme ekranına eklenir) ve hazır Bahşiş Seçenekleri (ödeme ekranında yüzdelik butonlar).
                  </ComingSoonNote>
                </>
              )}

              {activeTab === 'donanim' && (
                <>
                  <div>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={kitchenAutoPrintEnabled}
                        onChange={(e) => setKitchenAutoPrintEnabled(e.target.checked)}
                        className="accent-ember w-4 h-4 mt-0.5 shrink-0"
                      />
                      <span>
                        <span className="block font-mono text-xs uppercase tracking-wide text-slate">
                          Otomatik Mutfak Fişi Yazdırma
                        </span>
                        <span className="block font-mono text-[11px] text-slate mt-1">
                          Açıkken, sipariş verildiğinde mutfak fişi otomatik olarak yazdırılır (Tables
                          ekranı). Kapatırsan yazdırma tetiklenmez.
                        </span>
                      </span>
                    </label>
                  </div>

                  <div className="pt-2 border-t border-hairline">
                    <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
                      Fiş Kağıt Genişliği
                    </label>
                    <div className="flex gap-2">
                      {[58, 80].map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => setPrinterPaperWidth(w)}
                          className={`font-mono text-xs uppercase tracking-wide px-4 py-2 rounded-sm border transition-colors ${
                            printerPaperWidth === w ? 'border-ember bg-ember/10 text-ember font-semibold' : 'border-hairline text-slate hover:text-paper'
                          }`}
                        >
                          {w}mm
                        </button>
                      ))}
                    </div>
                    <p className="font-mono text-[11px] text-slate mt-2">
                      Müşteri fişi ve mutfak fişi yazdırmada kullanılan termal kağıt genişliği (bkz.
                      utils/print.js). Çoğu masaüstü termal yazıcı 80mm'dir.
                    </p>
                  </div>

                  <ComingSoonNote>
                    Birden fazla yazıcı tanımlama (hangisi mutfak fişi, hangisi müşteri fişi basacak) —
                    şu an tek bir tarayıcı yazdırma diyaloğu kullanılıyor, gerçek ağ/USB yazıcı
                    entegrasyonu ayrı bir iş.
                  </ComingSoonNote>
                </>
              )}

              {activeTab === 'sistem' && (
                <>
                  <div>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={stockChartEnabled}
                        onChange={(e) => setStockChartEnabled(e.target.checked)}
                        className="accent-ember w-4 h-4 mt-0.5 shrink-0"
                      />
                      <span>
                        <span className="block font-mono text-xs uppercase tracking-wide text-slate">
                          Stok Grafiği
                        </span>
                        <span className="block font-mono text-[11px] text-slate mt-1">
                          Açıkken, Stok sayfasında üst kısımda büyük bir çubuk grafik ve her ürün
                          satırında küçük bir çubuk görünür.
                        </span>
                      </span>
                    </label>
                  </div>

                  <div className="pt-2 border-t border-hairline">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoBackupEnabled}
                        onChange={(e) => setAutoBackupEnabled(e.target.checked)}
                        className="accent-ember w-4 h-4 mt-0.5 shrink-0"
                      />
                      <span>
                        <span className="block font-mono text-xs uppercase tracking-wide text-slate">
                          Otomatik Yedekleme
                        </span>
                        <span className="block font-mono text-[11px] text-slate mt-1">
                          Açıkken, her gece 03:00'te veritabanının tam bir yedeği (.bak) alınır.
                          Belirtilen saklama süresinden eski yedekler otomatik silinir.
                        </span>
                      </span>
                    </label>

                    <div className="mt-4">
                      <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
                        Saklama Süresi (gün)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        step="1"
                        value={autoBackupRetentionDays}
                        onChange={(e) => setAutoBackupRetentionDays(e.target.value)}
                        className="w-32 border border-hairline rounded-sm px-3 py-2.5 font-mono text-paper bg-charcoal
                                   focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
                      />
                      <p className="font-mono text-[11px] text-slate mt-1.5">
                        Bu günden eski .bak dosyaları diskten silinir.
                      </p>
                    </div>

                    <div className="mt-4">
                      {backupNowError && (
                        <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 mb-3">{backupNowError}</p>
                      )}
                      <button
                        type="button"
                        onClick={handleBackupNow}
                        disabled={backupNowLoading}
                        className="font-mono text-xs uppercase tracking-wide text-cream bg-ember
                                   hover:bg-ember/90 disabled:opacity-40 rounded-sm px-4 py-2.5 transition-colors"
                      >
                        {backupNowLoading ? 'Yedekleniyor...' : 'Şimdi Yedekle'}
                      </button>
                    </div>

                    <div className="mt-5">
                      <p className="font-mono text-xs uppercase tracking-wide text-slate mb-2">Son Yedekler</p>
                      {backups.length === 0 ? (
                        <p className="font-mono text-[11px] text-slate border border-dashed border-hairline rounded-sm px-3 py-2.5 bg-charcoal/50">
                          Henüz yedek alınmamış.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {backups.map((b) => (
                            <div key={b.Id} className="flex items-center justify-between font-mono text-[11px] text-slate border border-hairline rounded-sm px-3 py-2">
                              <span className="text-paper truncate">{b.FileName}</span>
                              <span className="shrink-0 ml-3">{formatBackupDate(b.CreatedAt)}</span>
                              <span className="shrink-0 ml-3 w-16 text-right">{formatBackupSize(b.SizeBytes)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

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
          )}
        </div>
      </div>
    </div>
  );
}
