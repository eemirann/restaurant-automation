import { useEffect, useState, useCallback } from 'react';
import client, { imageUrl } from '../api/client';

const money = (n) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(n) || 0);

const fmtDate = (v) => (v ? new Date(v).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

// ============================================================
// Kampanya/Combo yönetimi (Admin) — QR menüdeki karüselde gösterilen
// kampanyalar. CampaignType='Combo' olanlar bir ComboOffer'a (sabit
// fiyat + bileşen ürünler) bağlıdır (bkz. backend: controllers/
// campaignController.js).
// ============================================================
export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/campaigns');
      setCampaigns(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Kampanyalar getirilemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);
  useEffect(() => {
    client.get('/products').then((res) => setProducts(res.data)).catch(() => {});
  }, []);

  const handleDelete = async (campaign) => {
    if (!window.confirm(`"${campaign.Title}" kampanyası kaldırılsın mı?`)) return;
    setActionError('');
    try {
      await client.delete(`/campaigns/${campaign.CampaignId}`);
      fetchCampaigns();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Kampanya kaldırılamadı.');
    }
  };

  const now = Date.now();

  return (
    <div className="p-10">
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="font-mono text-xs tracking-[0.3em] text-ember uppercase mb-2">
            Müşteri QR Menüsü
          </p>
          <h1 className="font-display text-3xl font-semibold text-paper">Kampanyalar</h1>
          <p className="font-body text-sm text-slate mt-1">
            QR menünün üstündeki karüselde gösterilir. "Combo" tipi sepete eklenebilir sabit fiyatlı bir
            ürün paketidir; "Bilgi" tipi sadece bilgilendirme kartıdır.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="font-mono text-xs uppercase tracking-wide text-cream bg-ember hover:bg-ember/90 rounded-sm px-4 py-2.5 transition-colors shadow-sm shrink-0"
        >
          + Yeni Kampanya
        </button>
      </div>

      {(error || actionError) && (
        <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 mb-6">{error || actionError}</p>
      )}

      {loading ? (
        <p className="text-slate font-mono text-sm">Yükleniyor...</p>
      ) : campaigns.length === 0 ? (
        <div className="border border-dashed border-hairline rounded-sm p-10 text-center bg-panel/50">
          <p className="text-slate font-mono text-sm">Henüz kampanya yok.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((c) => {
            const withinDailyWindow = () => {
              if (!c.RecurringDailyStartTime || !c.RecurringDailyEndTime) return true;
              const nowTime = new Date().toTimeString().slice(0, 8);
              return nowTime >= c.RecurringDailyStartTime && nowTime <= c.RecurringDailyEndTime;
            };
            const isLive = c.IsActive && new Date(c.StartAt) <= now && new Date(c.EndAt) >= now && withinDailyWindow();
            return (
              <div key={c.CampaignId} className="border border-hairline rounded-sm bg-panel overflow-hidden">
                <div className="w-full aspect-video bg-hairline/40">
                  {c.ImageUrl ? (
                    <img src={imageUrl(c.ImageUrl)} alt={c.Title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-3xl">🖼️</div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={`font-mono text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border ${
                      c.CampaignType === 'Combo' ? 'border-azure/40 bg-azure/10 text-azure' : 'border-hairline text-slate'
                    }`}>
                      {c.CampaignType === 'Combo' ? 'Combo' : 'Bilgi'}
                    </span>
                    <span className={`font-mono text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border ${
                      isLive ? 'border-moss/40 bg-moss/10 text-moss' : 'border-hairline text-slate'
                    }`}>
                      {isLive ? 'Yayında' : c.IsActive ? 'Süre dışı' : 'Kapalı'}
                    </span>
                  </div>
                  <p className="text-paper font-semibold leading-tight mb-1">{c.Title}</p>
                  {c.CampaignType === 'Combo' && (
                    <p className="font-mono text-xs text-ember mb-1">{c.ComboName} · {money(c.ComboPrice)}</p>
                  )}
                  {c.Description && <p className="text-xs text-slate mb-2 line-clamp-2">{c.Description}</p>}
                  <p className="font-mono text-[10px] text-slate mb-1">
                    {fmtDate(c.StartAt)} → {fmtDate(c.EndAt)}
                  </p>
                  {c.RecurringDailyStartTime && c.RecurringDailyEndTime && (
                    <p className="font-mono text-[10px] text-azure mb-2">
                      ⏰ Her gün {c.RecurringDailyStartTime.slice(0, 5)} – {c.RecurringDailyEndTime.slice(0, 5)}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingCampaign(c)}
                      className="flex-1 font-mono text-[11px] uppercase tracking-wide text-slate hover:text-azure border border-hairline rounded-sm px-2.5 py-1.5 transition-colors"
                    >
                      Düzenle
                    </button>
                    <button
                      onClick={() => handleDelete(c)}
                      className="flex-1 font-mono text-[11px] uppercase tracking-wide text-ember hover:text-ember/80 border border-ember/40 rounded-sm px-2.5 py-1.5 transition-colors"
                    >
                      Kaldır
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreateModal && (
        <CampaignModal
          title="Yeni Kampanya"
          products={products}
          onClose={() => setShowCreateModal(false)}
          onSubmit={async (values) => {
            const res = await client.post('/campaigns', values);
            return res.data;
          }}
          onSaved={() => { setShowCreateModal(false); fetchCampaigns(); }}
        />
      )}

      {editingCampaign && (
        <CampaignModal
          title={`"${editingCampaign.Title}" — Düzenle`}
          initial={editingCampaign}
          products={products}
          onClose={() => setEditingCampaign(null)}
          onSubmit={async (values) => {
            const res = await client.put(`/campaigns/${editingCampaign.CampaignId}`, values);
            return res.data;
          }}
          onSaved={() => { setEditingCampaign(null); fetchCampaigns(); }}
        />
      )}
    </div>
  );
}

function toLocalInputValue(d) {
  if (!d) return '';
  const date = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// ============================================================
// Kampanya oluşturma/düzenleme formu — ProductModal.jsx ile aynı desen
// (görsel yükleme: önce kaydet, dönen CampaignId ile /campaigns/:id/image).
// ============================================================
function CampaignModal({ title, initial, products, onClose, onSubmit, onSaved }) {
  const [campaignTitle, setCampaignTitle] = useState(initial?.Title ?? '');
  const [description, setDescription] = useState(initial?.Description ?? '');
  const [startAt, setStartAt] = useState(toLocalInputValue(initial?.StartAt) || toLocalInputValue(new Date()));
  const [endAt, setEndAt] = useState(toLocalInputValue(initial?.EndAt));
  const [displayOrder, setDisplayOrder] = useState(initial?.DisplayOrder ?? 0);
  const [isActive, setIsActive] = useState(initial ? initial.IsActive !== false : true);
  const [campaignType, setCampaignType] = useState(initial?.CampaignType ?? 'Info');
  const [imageFile, setImageFile] = useState(null);
  const [recurringDailyStartTime, setRecurringDailyStartTime] = useState(initial?.RecurringDailyStartTime?.slice(0, 5) ?? '');
  const [recurringDailyEndTime, setRecurringDailyEndTime] = useState(initial?.RecurringDailyEndTime?.slice(0, 5) ?? '');

  const [comboName, setComboName] = useState(initial?.ComboName ?? '');
  const [comboPrice, setComboPrice] = useState(initial?.ComboPrice ?? '');
  const [comboItems, setComboItems] = useState(
    (initial?.ComboItems || []).map((i) => ({ ProductId: String(i.ProductId), Quantity: i.Quantity }))
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const addComboItem = () => setComboItems((prev) => [...prev, { ProductId: '', Quantity: 1 }]);
  const updateComboItem = (idx, patch) => setComboItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const removeComboItem = (idx) => setComboItems((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!campaignTitle.trim()) { setError('Başlık zorunludur.'); return; }
    if (!startAt || !endAt) { setError('Başlangıç/bitiş tarihi zorunludur.'); return; }
    if (new Date(endAt) <= new Date(startAt)) { setError('Bitiş, başlangıçtan sonra olmalıdır.'); return; }
    if ((recurringDailyStartTime && !recurringDailyEndTime) || (!recurringDailyStartTime && recurringDailyEndTime)) {
      setError('Günlük tekrar saatleri birlikte girilmeli veya ikisi de boş bırakılmalıdır.');
      return;
    }

    let comboPayload;
    if (campaignType === 'Combo') {
      if (!comboName.trim() || comboPrice === '' || Number(comboPrice) <= 0) {
        setError('Combo adı ve pozitif bir fiyat zorunludur.');
        return;
      }
      if (comboItems.length === 0 || comboItems.some((it) => !it.ProductId || !it.Quantity || Number(it.Quantity) <= 0)) {
        setError('Combo en az bir ürün içermeli, her ürün için geçerli bir adet girin.');
        return;
      }
      comboPayload = {
        Name: comboName.trim(),
        Price: Number(comboPrice),
        Items: comboItems.map((it) => ({ ProductId: Number(it.ProductId), Quantity: Number(it.Quantity) })),
      };
    }

    setSubmitting(true);
    try {
      const saved = await onSubmit({
        Title: campaignTitle.trim(),
        Description: description.trim() || undefined,
        StartAt: new Date(startAt).toISOString(),
        EndAt: new Date(endAt).toISOString(),
        DisplayOrder: Number(displayOrder) || 0,
        IsActive: isActive,
        CampaignType: campaignType,
        Combo: comboPayload,
        RecurringDailyStartTime: recurringDailyStartTime || '',
        RecurringDailyEndTime: recurringDailyEndTime || '',
      });

      const savedId = saved?.CampaignId ?? initial?.CampaignId;
      if (imageFile && savedId) {
        const formData = new FormData();
        formData.append('image', imageFile);
        await client.post(`/campaigns/${savedId}/image`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'İşlem başarısız oldu.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-ink/40 flex items-center justify-center px-4 z-50" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="bg-panel rounded-sm border border-hairline w-full max-w-xl max-h-[88vh] overflow-auto shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-hairline flex items-start justify-between">
          <div>
            <p className="font-mono text-xs tracking-[0.2em] text-ember uppercase mb-1">Kampanya</p>
            <h2 className="font-display text-xl font-semibold text-paper">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="font-mono text-xs text-slate hover:text-paper">
            Kapat ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Başlık</label>
            <input
              type="text"
              value={campaignTitle}
              onChange={(e) => setCampaignTitle(e.target.value)}
              className="w-full border border-hairline rounded-sm px-3 py-2.5 font-body text-paper
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Açıklama (opsiyonel)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full border border-hairline rounded-sm px-3 py-2.5 font-body text-sm text-paper
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Başlangıç</label>
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="w-full border border-hairline rounded-sm px-3 py-2.5 font-mono text-sm text-paper bg-charcoal
                           focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
              />
            </div>
            <div className="flex-1">
              <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Bitiş</label>
              <input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className="w-full border border-hairline rounded-sm px-3 py-2.5 font-mono text-sm text-paper bg-charcoal
                           focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
                Günlük Başlangıç Saati <span className="normal-case text-slate/70">(opsiyonel)</span>
              </label>
              <input
                type="time"
                value={recurringDailyStartTime}
                onChange={(e) => setRecurringDailyStartTime(e.target.value)}
                className="w-full border border-hairline rounded-sm px-3 py-2.5 font-mono text-sm text-paper bg-charcoal
                           focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
              />
            </div>
            <div className="flex-1">
              <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
                Günlük Bitiş Saati <span className="normal-case text-slate/70">(opsiyonel)</span>
              </label>
              <input
                type="time"
                value={recurringDailyEndTime}
                onChange={(e) => setRecurringDailyEndTime(e.target.value)}
                className="w-full border border-hairline rounded-sm px-3 py-2.5 font-mono text-sm text-paper bg-charcoal
                           focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
              />
            </div>
          </div>
          <p className="font-mono text-[10px] text-slate/70 -mt-2">
            Doldurulursa kampanya her gün sadece bu saat aralığında aktif olur (tarih aralığıyla birlikte). Boş bırakılırsa sürekli aktif kalır.
          </p>

          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
                Sıra <span className="normal-case text-slate/70">(küçük önce gösterilir)</span>
              </label>
              <input
                type="number"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(e.target.value)}
                className="w-full border border-hairline rounded-sm px-3 py-2.5 font-mono text-paper bg-charcoal
                           focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer pb-2.5">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="accent-ember w-4 h-4" />
              <span className="font-mono text-xs uppercase tracking-wide text-paper">Aktif</span>
            </label>
          </div>

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Tip</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCampaignType('Info')}
                className={`flex-1 font-mono text-xs uppercase tracking-wide px-3 py-2.5 rounded-sm border transition-colors ${
                  campaignType === 'Info' ? 'border-ember bg-ember/10 text-ember font-semibold' : 'border-hairline text-slate'
                }`}
              >
                Bilgi Kartı
              </button>
              <button
                type="button"
                onClick={() => setCampaignType('Combo')}
                className={`flex-1 font-mono text-xs uppercase tracking-wide px-3 py-2.5 rounded-sm border transition-colors ${
                  campaignType === 'Combo' ? 'border-ember bg-ember/10 text-ember font-semibold' : 'border-hairline text-slate'
                }`}
              >
                Combo (sepete eklenir)
              </button>
            </div>
          </div>

          {campaignType === 'Combo' && (
            <div className="space-y-3 border border-hairline rounded-sm p-3 bg-charcoal/50">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Combo Adı</label>
                  <input
                    type="text"
                    value={comboName}
                    onChange={(e) => setComboName(e.target.value)}
                    placeholder="ör. Kahve + Simit Menü"
                    className="w-full border border-hairline rounded-sm px-3 py-2.5 font-body text-sm text-paper bg-panel
                               focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
                  />
                </div>
                <div className="w-32">
                  <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Fiyat</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={comboPrice}
                    onChange={(e) => setComboPrice(e.target.value)}
                    className="w-full border border-hairline rounded-sm px-3 py-2.5 font-mono text-sm text-paper bg-panel
                               focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
                  />
                </div>
              </div>

              <div>
                <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Combo İçeriği</label>
                <div className="space-y-2">
                  {comboItems.map((item, idx) => (
                    <div key={idx} className="flex gap-2">
                      <select
                        value={item.ProductId}
                        onChange={(e) => updateComboItem(idx, { ProductId: e.target.value })}
                        className="flex-1 border border-hairline rounded-sm px-2.5 py-2 font-body text-sm text-paper bg-panel
                                   focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
                      >
                        <option value="">Ürün seçin</option>
                        {products.map((p) => (
                          <option key={p.ProductId} value={p.ProductId}>{p.Name}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="1"
                        value={item.Quantity}
                        onChange={(e) => updateComboItem(idx, { Quantity: e.target.value })}
                        className="w-20 border border-hairline rounded-sm px-2.5 py-2 font-mono text-sm text-paper bg-panel
                                   focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
                      />
                      <button
                        type="button"
                        onClick={() => removeComboItem(idx)}
                        className="w-9 h-9 flex items-center justify-center text-slate hover:text-ember shrink-0"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addComboItem}
                  className="mt-2 font-mono text-[11px] uppercase tracking-wide text-slate hover:text-ember border border-hairline rounded-sm px-3 py-1.5 transition-colors"
                >
                  + Ürün Ekle
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Görsel (opsiyonel)</label>
            <div className="flex items-center gap-3">
              {imageFile ? (
                <img src={URL.createObjectURL(imageFile)} alt="" className="w-14 h-14 object-cover rounded-sm border border-hairline" />
              ) : initial?.ImageUrl ? (
                <img src={imageUrl(initial.ImageUrl)} alt="" className="w-14 h-14 object-cover rounded-sm border border-hairline" />
              ) : (
                <div className="w-14 h-14 rounded-sm border border-dashed border-hairline flex items-center justify-center text-slate text-[10px] font-mono">
                  Yok
                </div>
              )}
              <input
                type="file"
                accept="image/png, image/jpeg, image/webp"
                onChange={(e) => setImageFile(e.target.files[0] || null)}
                className="flex-1 font-body text-xs text-paper file:mr-3 file:font-mono file:text-[11px] file:uppercase
                           file:border file:border-hairline file:rounded-sm file:px-2.5 file:py-1.5 file:bg-panel file:text-slate
                           hover:file:text-ember hover:file:border-ember"
              />
            </div>
          </div>

          {error && (
            <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3">{error}</p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-hairline flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-xs uppercase tracking-wide text-slate hover:text-paper
                       border border-hairline rounded-sm px-4 py-2.5 transition-colors"
          >
            Vazgeç
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="font-mono text-xs uppercase tracking-wide text-cream bg-ember
                       hover:bg-ember/90 disabled:opacity-50 rounded-sm px-4 py-2.5 transition-colors"
          >
            {submitting ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </form>
    </div>
  );
}
