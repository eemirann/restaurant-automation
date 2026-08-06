import { useEffect, useState, useCallback } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

// Rezervasyon durumu (DB/API kontratı: Active/Cancelled/Expired) -> Türkçe etiket + renk.
// 'Expired' backend'de otomatik (lazy) işaretlenir — gerçek bir zamanlanmış görev yok,
// her listeleme/oluşturma isteğinde süresi geçmiş 'Active' kayıtlar güncellenir.
const STATUS_CONFIG = {
  Active: { label: 'Aktif', dot: 'bg-moss', border: 'border-moss/40', bg: 'bg-moss/5' },
  Cancelled: { label: 'İptal Edildi', dot: 'bg-slate', border: 'border-slate/30', bg: 'bg-slate/5' },
  Expired: { label: 'Süresi Doldu', dot: 'bg-amber-500', border: 'border-amber-500/40', bg: 'bg-amber-500/15' },
};

const FILTERS = [
  { value: '', label: 'Tümü' },
  { value: 'Active', label: 'Aktif' },
  { value: 'Cancelled', label: 'İptal Edildi' },
  { value: 'Expired', label: 'Süresi Doldu' },
];

const dateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '—';

// <input type="datetime-local"> için yerel saat dilimine göre "YYYY-MM-DDTHH:mm" üretir.
const toLocalInputValue = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const DAY_NAMES = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Verilen tarihin içinde bulunduğu haftanın Pazartesi'sini döner.
const startOfWeek = (date) => {
  const d = startOfDay(date);
  const dow = d.getDay(); // 0=Pazar, 1=Pazartesi, ...
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return d;
};

const addDays = (date, n) => {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
};

const shortDate = (date) =>
  date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });

const timeOnly = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '—';

export default function Reservations() {
  const { user } = useAuth();
  const canManage = ['Cashier', 'Admin'].includes(user?.role);

  const [reservations, setReservations] = useState([]);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [actionError, setActionError] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'calendar'
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  const fetchReservations = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/reservations', { params: filter ? { status: filter } : {} });
      setReservations(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Rezervasyonlar getirilemedi.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchReservations(); }, [fetchReservations]);

  useEffect(() => {
    client.get('/tables').then((res) => setTables(res.data)).catch(() => {});
  }, []);

  const tableNumber = (tableId) => tables.find((t) => t.TableId === tableId)?.TableNumber ?? tableId;

  const cancelReservation = async (reservation) => {
    if (!window.confirm(`${reservation.CustomerName} adına yapılan rezervasyon iptal edilsin mi?`)) return;
    setActionError('');
    try {
      await client.patch(`/reservations/${reservation.ReservationId}/cancel`);
      fetchReservations();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Rezervasyon iptal edilemedi.');
    }
  };

  const counts = reservations.reduce((acc, r) => {
    acc[r.Status] = (acc[r.Status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-10">
      {/* Başlık */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="font-mono text-xs tracking-[0.3em] text-ember uppercase mb-2">
            Masalar · Rezervasyon
          </p>
          <h1 className="font-display text-3xl font-semibold text-paper">Rezervasyonlar</h1>
          <p className="font-body text-sm text-slate mt-1">
            Manuel sistemdir — rezervasyon oluşturmak masa durumunu otomatik değiştirmez, masayı ayrıca Rezerve olarak işaretlemeniz gerekir.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchReservations}
            className="font-mono text-xs uppercase tracking-wide text-slate hover:text-ember
                       border border-hairline rounded-sm px-3 py-2 transition-colors"
          >
            ↻ Yenile
          </button>
          {canManage && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="font-mono text-xs uppercase tracking-wide text-cream bg-ember
                         hover:bg-ember/90 rounded-sm px-4 py-2 transition-colors"
            >
              + Yeni Rezervasyon
            </button>
          )}
        </div>
      </div>

      {/* Durum özeti */}
      <div className="flex flex-wrap gap-6 mb-6 font-mono text-xs text-slate">
        <span><span className="text-paper font-semibold">{reservations.length}</span> toplam</span>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full inline-block ${cfg.dot}`} />
            {counts[key] || 0} {cfg.label.toLowerCase()}
          </span>
        ))}
      </div>

      {/* Filtre sekmeleri + görünüm anahtarı */}
      <div className="flex items-center justify-between gap-4 mb-6 border-b border-hairline">
        <div className="flex gap-1 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`font-mono text-xs uppercase tracking-wide px-4 py-2.5 border-b-2 transition-colors whitespace-nowrap ${
                filter === f.value
                  ? 'border-ember text-paper font-semibold'
                  : 'border-transparent text-slate hover:text-paper'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 shrink-0 mb-2">
          {[
            { key: 'list', label: 'Liste' },
            { key: 'calendar', label: 'Takvim' },
          ].map((v) => (
            <button
              key={v.key}
              onClick={() => setViewMode(v.key)}
              className={`font-mono text-[11px] uppercase tracking-wide px-3 py-1.5 rounded-sm border transition-colors ${
                viewMode === v.key
                  ? 'border-ember text-cream bg-ember'
                  : 'border-hairline text-slate hover:text-paper'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {(error || actionError) && (
        <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 mb-6">
          {error || actionError}
        </p>
      )}

      {loading ? (
        <p className="text-slate font-mono text-sm">Yükleniyor...</p>
      ) : reservations.length === 0 ? (
        <div className="border border-dashed border-hairline rounded-sm p-10 text-center bg-panel/50">
          <p className="text-slate font-mono text-sm">Gösterilecek rezervasyon bulunamadı.</p>
        </div>
      ) : viewMode === 'calendar' ? (
        <CalendarView
          reservations={reservations}
          weekStart={weekStart}
          setWeekStart={setWeekStart}
          tableNumber={tableNumber}
          canManage={canManage}
          onCancel={cancelReservation}
        />
      ) : (
        <div className="border border-hairline rounded-sm overflow-hidden bg-panel">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-hairline/60 border-b border-hairline text-left font-mono text-[10px] uppercase tracking-widest text-slate">
                <th className="px-5 py-3">Müşteri</th>
                <th className="px-5 py-3">Masa</th>
                <th className="px-5 py-3">Kişi</th>
                <th className="px-5 py-3">Rezervasyon Saati</th>
                <th className="px-5 py-3">Durum</th>
                {canManage && <th className="px-5 py-3 text-right">İşlemler</th>}
              </tr>
            </thead>
            <tbody>
              {reservations.map((r) => {
                const cfg = STATUS_CONFIG[r.Status] || STATUS_CONFIG.Active;
                return (
                  <tr key={r.ReservationId} className="border-b border-hairline last:border-b-0 hover:bg-hairline/30">
                    <td className="px-5 py-3">
                      <p className="text-paper font-medium">{r.CustomerName}</p>
                      {r.CustomerPhone && <p className="font-mono text-xs text-slate mt-0.5">{r.CustomerPhone}</p>}
                      {r.Note && <p className="text-xs text-slate mt-0.5">{r.Note}</p>}
                    </td>
                    <td className="px-5 py-3 text-paper">Masa {tableNumber(r.TableId)}</td>
                    <td className="px-5 py-3 font-mono text-paper">{r.PartySize}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate">{dateTime(r.ReservationTime)}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1.5 border rounded-sm px-2 py-1 text-xs font-mono uppercase tracking-wide ${cfg.border} ${cfg.bg}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-5 py-3">
                        <div className="flex justify-end">
                          {r.Status === 'Active' && (
                            <button
                              onClick={() => cancelReservation(r)}
                              className="font-mono text-[11px] uppercase tracking-wide text-ember hover:text-ember/80 border border-ember/40 rounded-sm px-2.5 py-1.5 transition-colors"
                            >
                              İptal Et
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <CreateReservationModal
          tables={tables}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); fetchReservations(); }}
        />
      )}
    </div>
  );
}

// ============================================================
// TAKVİM GÖRÜNÜMÜ — haftalık grid (7 gün), mevcut GET /reservations
// verisi client-side günlere göre gruplanır, yeni API çağrısı yok.
// ============================================================
function CalendarView({ reservations, weekStart, setWeekStart, tableNumber, canManage, onCancel }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = startOfDay(new Date()).getTime();

  const byDay = days.map((day) => {
    const dayStart = startOfDay(day).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    const items = reservations
      .filter((r) => {
        const t = new Date(r.ReservationTime).getTime();
        return t >= dayStart && t < dayEnd;
      })
      .sort((a, b) => new Date(a.ReservationTime) - new Date(b.ReservationTime));
    return { day, items };
  });

  const weekLabel = `${shortDate(weekStart)} – ${shortDate(addDays(weekStart, 6))}`;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setWeekStart(addDays(weekStart, -7))}
          className="font-mono text-xs uppercase tracking-wide text-slate hover:text-ember
                     border border-hairline rounded-sm px-3 py-1.5 transition-colors"
        >
          ← Önceki Hafta
        </button>
        <div className="flex items-center gap-3">
          <p className="font-mono text-xs text-slate">{weekLabel}</p>
          <button
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="font-mono text-[11px] uppercase tracking-wide text-ember hover:text-ember/80
                       border border-ember/40 rounded-sm px-2.5 py-1 transition-colors"
          >
            Bu Hafta
          </button>
        </div>
        <button
          onClick={() => setWeekStart(addDays(weekStart, 7))}
          className="font-mono text-xs uppercase tracking-wide text-slate hover:text-ember
                     border border-hairline rounded-sm px-3 py-1.5 transition-colors"
        >
          Sonraki Hafta →
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
        {byDay.map(({ day, items }, i) => {
          const isToday = startOfDay(day).getTime() === today;
          return (
            <div
              key={i}
              className={`border rounded-sm bg-panel min-h-[140px] flex flex-col ${
                isToday ? 'border-ember/50' : 'border-hairline'
              }`}
            >
              <div className={`px-3 py-2 border-b ${isToday ? 'border-ember/30 bg-ember/5' : 'border-hairline bg-hairline/30'}`}>
                <p className={`font-mono text-[10px] uppercase tracking-widest ${isToday ? 'text-ember' : 'text-slate'}`}>
                  {DAY_NAMES[i]}
                </p>
                <p className="font-mono text-xs text-paper mt-0.5">{shortDate(day)}</p>
              </div>
              <div className="p-2 space-y-1.5 flex-1 overflow-auto">
                {items.length === 0 ? (
                  <p className="font-mono text-[11px] text-slate/50 text-center py-4">—</p>
                ) : (
                  items.map((r) => {
                    const cfg = STATUS_CONFIG[r.Status] || STATUS_CONFIG.Active;
                    return (
                      <div
                        key={r.ReservationId}
                        className={`border rounded-sm px-2 py-1.5 text-xs ${cfg.border} ${cfg.bg}`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono text-paper font-semibold">{timeOnly(r.ReservationTime)}</span>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                        </div>
                        <p className="text-paper truncate mt-0.5">{r.CustomerName}</p>
                        <p className="font-mono text-slate text-[10px]">
                          Masa {tableNumber(r.TableId)} · {r.PartySize} kişi
                        </p>
                        {canManage && r.Status === 'Active' && (
                          <button
                            onClick={() => onCancel(r)}
                            className="font-mono text-[10px] uppercase tracking-wide text-ember hover:text-ember/80 mt-1"
                          >
                            İptal Et
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Yeni rezervasyon oluşturma formu (SADECE Cashier/Admin)
// ============================================================
function CreateReservationModal({ tables, onClose, onCreated }) {
  const defaultTime = toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000)); // +1 saat

  const [tableId, setTableId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [reservationTime, setReservationTime] = useState(defaultTime);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!tableId) { setError('Bir masa seçmelisiniz.'); return; }
    if (!customerName.trim()) { setError('Müşteri adı zorunludur.'); return; }
    if (!Number.isInteger(Number(partySize)) || Number(partySize) <= 0) {
      setError('Kişi sayısı geçerli bir pozitif tam sayı olmalıdır.');
      return;
    }
    if (!reservationTime) { setError('Rezervasyon saati zorunludur.'); return; }

    setSubmitting(true);
    try {
      await client.post('/reservations', {
        TableId: Number(tableId),
        CustomerName: customerName.trim(),
        CustomerPhone: customerPhone.trim() || undefined,
        PartySize: Number(partySize),
        ReservationTime: new Date(reservationTime).toISOString(),
        Note: note.trim() || undefined,
      });
      onCreated();
    } catch (err) {
      setError(err.response?.data?.error || 'Rezervasyon oluşturulamadı.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-ink/50" onClick={() => !submitting && onClose()} />

      <div className="relative w-full max-w-md h-full bg-panel shadow-2xl flex flex-col animate-[slideIn_0.2s_ease-out]">
        <style>{`
          @keyframes slideIn {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `}</style>

        <div className="px-6 py-4 border-b border-hairline flex items-start justify-between shrink-0 bg-panel">
          <div>
            <p className="font-mono text-[10px] tracking-[0.25em] text-ember uppercase mb-1">Yeni</p>
            <h2 className="font-display text-lg font-semibold text-paper leading-tight">Rezervasyon Oluştur</h2>
          </div>
          <button
            onClick={() => !submitting && onClose()}
            className="font-mono text-xs text-slate hover:text-paper w-9 h-9 flex items-center justify-center shrink-0 rounded-sm hover:bg-charcoal transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-auto px-6 py-5 bg-hairline/10 space-y-4">
          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Masa</label>
            <select
              value={tableId}
              onChange={(e) => setTableId(e.target.value)}
              className="w-full border border-hairline rounded-sm px-3 py-2.5 font-body text-paper bg-panel
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            >
              <option value="">Masa seçin</option>
              {tables.map((t) => (
                <option key={t.TableId} value={t.TableId}>
                  Masa {t.TableNumber} ({t.Capacity} kişilik)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Müşteri Adı</label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              autoFocus
              className="w-full border border-hairline rounded-sm px-3 py-2.5 font-body text-paper bg-panel
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Telefon (opsiyonel)</label>
              <input
                type="text"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="ör. 0555 000 00 00"
                className="w-full border border-hairline rounded-sm px-3 py-2.5 font-body text-paper bg-panel
                           focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
              />
            </div>
            <div className="w-28">
              <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Kişi</label>
              <input
                type="number"
                min="1"
                value={partySize}
                onChange={(e) => setPartySize(e.target.value)}
                className="w-full border border-hairline rounded-sm px-3 py-2.5 font-mono text-paper bg-panel text-center
                           focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
              />
            </div>
          </div>

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Rezervasyon Saati</label>
            <input
              type="datetime-local"
              value={reservationTime}
              onChange={(e) => setReservationTime(e.target.value)}
              className="w-full border border-hairline rounded-sm px-3 py-2.5 font-mono text-sm text-paper bg-panel
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Not (opsiyonel)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="ör. Pencere kenarı istendi"
              className="w-full border border-hairline rounded-sm px-3 py-2.5 font-body text-sm text-paper bg-panel
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>

          {error && (
            <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 bg-panel py-2">{error}</p>
          )}
        </form>

        <div className="px-6 py-4 border-t border-hairline shrink-0 bg-panel flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 font-mono text-xs uppercase tracking-wide text-slate hover:text-paper
                       border border-hairline rounded-sm px-4 py-3 transition-colors disabled:opacity-50"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 font-mono text-sm uppercase tracking-wide text-cream bg-ember
                       hover:bg-ember/90 active:bg-ember/80 disabled:opacity-40 disabled:cursor-not-allowed
                       rounded-sm px-6 py-3 transition-colors shadow-sm"
          >
            {submitting ? 'Oluşturuluyor...' : 'Oluştur'}
          </button>
        </div>
      </div>
    </div>
  );
}
