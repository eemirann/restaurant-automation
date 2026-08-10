import { useEffect, useState, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import client from '../api/client';
import { getSocket } from '../api/socket';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import PaymentDrawer from '../components/PaymentDrawer';
import OptionCard from '../components/OptionCard';
import ProductCard from '../components/ProductCard';
import ProductDetailModal from '../components/ProductDetailModal';
import MenuFilterBar from '../components/MenuFilterBar';
import ProductGridSkeleton from '../components/ProductGridSkeleton';
import EmptyState from '../components/EmptyState';
import { calculateLineTotal } from '../components/PriceCalculator';
import { isProductAvailable } from '../utils/productAvailability';
import { printKitchenTicket } from '../utils/print';
import { DEFAULT_AREA, areaLabelOf } from '../utils/tableAreas';
import TableAreasManager from '../components/TableAreasManager';

// Sipariş ekranındaki ürün ızgarasının sol dikey rayı — kategoriler yukarı
// yatay bara taşındığı için hızlı filtreler (Popüler vb.) buraya alındı.
const QUICK_FILTERS = [
  { value: 'all', label: 'Tümü' },
  { value: 'popular', label: '⭐ Popüler' },
  { value: 'available', label: 'Mevcut' },
  { value: 'outOfStock', label: 'Tükenen' },
];

const STATUS_CONFIG = {
  Empty: { label: 'Boş', dot: 'bg-moss', border: 'border-hairline', bg: 'bg-panel' },
  Occupied: { label: 'Dolu', dot: 'bg-ember', border: 'border-ember/40', bg: 'bg-ember/5' },
  Reserved: { label: 'Rezerve', dot: 'bg-azure', border: 'border-azure/40', bg: 'bg-azure/10' },
};

const ORDER_STATUS_LABEL = {
  Pending: 'Bekliyor',
  Served: 'Servis Edildi',
  Paid: 'Ödendi',
  Cancelled: 'İptal Edildi',
  Merged: 'Birleştirildi',
};

const FILTERS = [
  { value: '', label: 'Tümü' },
  { value: 'Empty', label: 'Boş' },
  { value: 'Occupied', label: 'Dolu' },
  { value: 'Reserved', label: 'Rezerve' },
  { value: 'NeedsPayment', label: 'Ödeme Bekliyor' },
];

const money = (n) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(n) || 0);

// Sipariş açılışından bu yana geçen süre (dolu masa "oturma süresi").
const fmtElapsed = (createdAt, now) => {
  if (!createdAt) return null;
  const ms = now - new Date(createdAt).getTime();
  if (isNaN(ms) || ms < 0) return null;
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'az önce';
  if (min < 60) return `${min} dk`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} sa ${m} dk` : `${h} sa`;
};

// Göreli "son güncelleme" (bu oturumda gözlemlenen değişimden bu yana).
const fmtRel = (ts, now) => {
  if (!ts) return null;
  const s = Math.floor((now - ts) / 1000);
  if (s < 10) return 'az önce';
  if (s < 60) return `${s} sn önce`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  return `${h} sa önce`;
};

const RES_STATUS_ACTIVE = 'Active';

// Rezervasyon zamanı — kısa format
const fmtResTime = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
};

// ============================================================
// Premium masa kartı — minimal, sürükle-bırak destekli
// ============================================================
function TableCard({ table, reservation, areaLabel, now, flashing, needsPay, isAdmin, canManageReservation, canTakePayment, isDragging, isDropTarget, onOpen, onPayment, onBill, onEdit, onDelete, onReserve, onCancelReservation, onDragStart, onDragOverCard, onDropCard, onDragEnd }) {
  const hasActiveOrder = Boolean(table.ActiveOrderId);
  const cfg = STATUS_CONFIG[table.Status] || STATUS_CONFIG.Empty;

  const baseShell = flashing
    ? 'border-emerald-500/50 bg-emerald-500/10 ring-2 ring-emerald-500/40'
    : needsPay
    ? 'border-red-500/50 bg-red-500/5 ring-1 ring-red-500/20'
    : table.Status === 'Occupied'
    ? 'border-ember/40 bg-ember/5'
    : table.Status === 'Reserved'
    ? 'border-azure/40 bg-azure/10'
    : 'border-hairline bg-panel';

  const dragShell = isDropTarget
    ? 'ring-2 ring-ember ring-offset-2 ring-offset-charcoal border-ember scale-[1.02]'
    : isDragging
    ? 'opacity-50 ring-2 ring-ember scale-[0.97]'
    : '';

  const badge = flashing
    ? { text: 'Ödendi', cls: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-500', dot: 'bg-emerald-500' }
    : needsPay
    ? { text: 'Ödeme Bekliyor', cls: 'border-red-500/50 bg-red-500/10 text-red-500', dot: 'bg-red-500' }
    : table.Status === 'Reserved'
    ? { text: 'Rezerve', cls: 'border-azure/40 bg-azure/10 text-azure', dot: 'bg-azure' }
    : { text: cfg.label, cls: `${cfg.border} ${cfg.bg} text-paper`, dot: cfg.dot };

  const elapsed = hasActiveOrder ? fmtElapsed(table.OrderCreatedAt, now) : null;

  return (
    <div
      onClick={onOpen}
      draggable={hasActiveOrder}
      onDragStart={(e) => onDragStart(e, table)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => onDragOverCard(e, table)}
      onDrop={(e) => onDropCard(e, table)}
      className={`group relative rounded-2xl border p-5 cursor-pointer flex flex-col min-h-[13rem]
                  shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300
                  ${hasActiveOrder ? 'active:cursor-grabbing' : ''} ${baseShell} ${dragShell}`}
    >
      {/* Üst: masa no + durum */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate/70">Masa</p>
            {areaLabel && (
              <span className="font-mono text-[8px] uppercase tracking-wide text-slate/70 border border-hairline rounded px-1.5 py-0.5">{areaLabel}</span>
            )}
          </div>
          <p className="font-display text-5xl font-bold text-paper leading-none tabular-nums">{table.TableNumber}</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 border rounded-full px-2.5 py-1 font-mono text-[9px] uppercase tracking-wide ${badge.cls}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
          {badge.text}
        </span>
      </div>

      {/* Meta: kapasite + ürün adedi + oturma süresi */}
      <div className="flex items-center gap-3 mt-3 font-mono text-[11px] text-slate">
        <span className="flex items-center gap-1" title="Kapasite">👥 {table.Capacity || '—'}</span>
        <span className="flex items-center gap-1" title="Ürün adedi">🍽 {table.ItemCount || 0}</span>
        {elapsed && <span className="flex items-center gap-1" title="Oturma süresi">⏱ {elapsed}</span>}
      </div>

      {/* Güncel hesap */}
      <div className={`rounded-xl px-3 py-2.5 mt-3 ${needsPay ? 'bg-red-500/10' : table.Status === 'Occupied' ? 'bg-ember/10' : 'bg-ink/[0.04]'}`}>
        <p className="font-mono text-[9px] uppercase tracking-widest text-slate mb-0.5">Güncel Hesap</p>
        <p className={`font-mono text-2xl font-bold tabular-nums ${
          !hasActiveOrder ? 'text-slate' : needsPay ? 'text-red-500' : 'text-ember'
        }`}>
          {money(table.CurrentTotal)}
        </p>
      </div>

      {/* Aksiyon alanı — duruma göre tek net eylem */}
      <div className="mt-auto pt-3">
        {hasActiveOrder ? (
          <div className="flex gap-1.5">
            {canTakePayment && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onPayment(); }}
                className="flex-1 flex items-center justify-center gap-2 font-mono text-sm uppercase tracking-wide text-cream
                           bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl py-3 min-h-[3rem]
                           shadow-sm transition-colors"
              >
                💳 Ödeme Al
              </button>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onBill(); }}
              title="Fatura Görüntüle"
              className={`flex items-center justify-center font-mono text-sm text-slate border border-hairline
                         hover:border-ember hover:text-ember rounded-xl px-3 min-h-[3rem] transition-colors ${
                           canTakePayment ? '' : 'flex-1'
                         }`}
            >
              🧾{!canTakePayment && <span className="ml-2 uppercase tracking-wide">Fatura Görüntüle</span>}
            </button>
          </div>
        ) : table.Status === 'Reserved' ? (
          <div className="rounded-xl bg-azure/10 border border-azure/30 px-3 py-2.5">
            <p className="font-mono text-[9px] uppercase tracking-widest text-azure mb-1">Rezervasyon</p>
            {reservation ? (
              <div className="font-mono text-[11px] text-paper space-y-0.5">
                <p className="truncate">👤 {reservation.CustomerName}</p>
                <p className="text-slate">🕒 {fmtResTime(reservation.ReservationTime)}{reservation.PartySize ? ` · ${reservation.PartySize} kişi` : ''}</p>
                {canManageReservation && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onCancelReservation(reservation); }}
                    className="mt-1 font-mono text-[10px] uppercase tracking-wide text-ember hover:text-ember/80"
                  >
                    ✕ Rezervasyonu İptal Et
                  </button>
                )}
              </div>
            ) : (
              <p className="font-mono text-[11px] text-slate">Detay yok</p>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpen(); }}
            className="w-full flex items-center justify-center gap-2 font-mono text-sm uppercase tracking-wide text-slate
                       border border-hairline hover:border-ember hover:text-ember rounded-xl py-2.5 min-h-[3rem] transition-colors"
          >
            ➕ Sipariş Başlat
          </button>
        )}
      </div>

      {/* Admin düzenle/sil — her zaman görünür (opacity-0+hover dokunmatik ekranda
          hover olmadığı için hiç görünmez/tıklanamaz hale geliyordu) */}
      {(isAdmin || (canManageReservation && table.Status === 'Empty')) && (
        <div className="flex items-center justify-end gap-3 mt-2">
          {canManageReservation && table.Status === 'Empty' && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onReserve(); }} className="font-mono text-[9px] uppercase tracking-wide text-slate/60 hover:text-azure py-1 px-1">Rezerve Et</button>
          )}
          {isAdmin && <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(); }} className="font-mono text-[9px] uppercase tracking-wide text-slate/60 hover:text-ember py-1 px-1">Düzenle</button>}
          {isAdmin && <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }} className="font-mono text-[9px] uppercase tracking-wide text-slate/60 hover:text-red-500 py-1 px-1">Sil</button>}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sürükle-bırak transfer onay dialogu
// ============================================================
function TransferConfirmModal({ from, to, type, submitting, error, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 bg-ink/50 backdrop-blur-sm flex items-center justify-center px-4 z-[70]" onClick={onCancel}>
      <div
        className="bg-panel rounded-2xl border border-hairline w-full max-w-sm p-6 shadow-2xl"
        style={{ animation: 'pdPop 0.25s ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`@keyframes pdPop { 0% { transform: scale(.94); opacity: 0 } 100% { transform: scale(1); opacity: 1 } }`}</style>
        <p className="font-mono text-[10px] tracking-[0.25em] text-ember uppercase mb-1">
          {type === 'Merge' ? 'Siparişleri Birleştir' : 'Siparişi Taşı'}
        </p>
        <h2 className="font-display text-xl font-semibold text-paper mb-5">
          {type === 'Merge' ? 'Masaları Birleştir' : 'Masayı Taşı'}
        </h2>

        <div className="flex flex-col items-center gap-2 mb-5">
          <div className="w-full rounded-xl border border-ember/40 bg-ember/5 px-4 py-3 text-center">
            <p className="font-mono text-[9px] uppercase tracking-widest text-slate">Kaynak</p>
            <p className="font-display text-2xl font-bold text-paper">Masa {from.TableNumber}</p>
          </div>
          <span className="text-2xl text-slate">↓</span>
          <div className="w-full rounded-xl border border-azure/40 bg-azure/10 px-4 py-3 text-center">
            <p className="font-mono text-[9px] uppercase tracking-widest text-slate">Hedef</p>
            <p className="font-display text-2xl font-bold text-paper">Masa {to.TableNumber}</p>
          </div>
        </div>

        <p className="font-mono text-[11px] text-slate text-center mb-4">
          {type === 'Merge'
            ? 'Kaynak siparişteki ürünler hedef masanın siparişiyle birleştirilecek.'
            : 'Sipariş, hedef masaya taşınacak ve kaynak masa boşalacak.'}
        </p>

        {error && <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 mb-4">{error}</p>}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="font-mono text-xs uppercase tracking-wide text-slate hover:text-paper border border-hairline rounded-xl py-3 transition-colors disabled:opacity-50"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="font-mono text-xs uppercase tracking-wide text-cream bg-ember hover:bg-ember/90 rounded-xl py-3 transition-colors disabled:opacity-50"
          >
            {submitting ? 'İşleniyor…' : type === 'Merge' ? 'Birleştir' : 'Taşı'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Tables() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const canManageReservation = isAdmin || user?.role === 'Cashier';
  // Garson ödeme alamaz/hesap kapatamaz — sadece sipariş girer (bkz.
  // routes/payment.js: backend de aynı kısıtı uyguluyor, bu sadece UI'ı gizler).
  const canTakePayment = canManageReservation;

  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [selectedArea, setSelectedArea] = useState('');
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [areas, setAreas] = useState([]);
  const [showAreaManager, setShowAreaManager] = useState(false);
  const [reservations, setReservations] = useState([]);
  const [now, setNow] = useState(Date.now());

  const [selectedTableId, setSelectedTableId] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTable, setEditingTable] = useState(null);
  const [quickPaymentTableId, setQuickPaymentTableId] = useState(null);
  const [quickBillTableId, setQuickBillTableId] = useState(null);
  const [reserveTable, setReserveTable] = useState(null);
  const [flashTableId, setFlashTableId] = useState(null);
  const [toast, setToast] = useState(null);

  // Sürükle-bırak transfer durumu
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [transferPrompt, setTransferPrompt] = useState(null); // { from, to, type }
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferError, setTransferError] = useState('');

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Oturma süresi / başlık saati için tik.
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(i);
  }, []);

  // TÜM masaları çeker — filtreleme client-side (filtre değişimi yeniden fetch tetiklemez).
  const fetchTables = useCallback(async ({ silent = false } = {}) => {
    if (!silent) { setLoading(true); setError(''); }
    try {
      const res = await client.get('/tables');
      setTables(res.data);
    } catch (err) {
      if (!silent) setError(err.response?.data?.error || 'Masalar getirilemedi.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const fetchReservations = useCallback(async () => {
    try { const res = await client.get('/reservations'); setReservations(res.data); } catch { /* sessiz */ }
  }, []);

  useEffect(() => { fetchTables(); fetchReservations(); }, [fetchTables, fetchReservations]);

  // Sadece etkilenen masayı tazele (optimistik; socket ile teyit edilir).
  const refreshTable = useCallback(async (tableId) => {
    try {
      const res = await client.get(`/tables/${tableId}`);
      const d = res.data;
      const ao = d.activeOrder;
      setTables((prev) => prev.map((t) => t.TableId === tableId ? {
        ...t,
        Status: d.Status,
        Capacity: d.Capacity,
        Area: d.Area ?? t.Area,
        ActiveOrderId: ao?.OrderId ?? null,
        OrderCreatedAt: ao?.CreatedAt ?? null,
        OrderStatus: ao?.Status ?? null,
        ItemCount: ao ? ao.items.reduce((s, i) => s + i.Quantity, 0) : 0,
        CurrentTotal: ao ? Number(ao.TotalAmount) : 0,
      } : t));
    } catch {
      fetchTables({ silent: true });
    }
  }, [fetchTables]);

  const handlePaymentSuccess = useCallback((tableId) => {
    setToast({ message: 'Ödeme başarıyla tamamlandı.' });
    setFlashTableId(tableId);
    fetchTables({ silent: true });
    setTimeout(() => setFlashTableId((cur) => (cur === tableId ? null : cur)), 1400);
  }, [fetchTables]);

  const handleOrderCreated = useCallback((tableId) => {
    setToast({ message: 'Sipariş oluşturuldu.' });
    setFlashTableId(tableId);
    refreshTable(tableId);
    setTimeout(() => setFlashTableId((cur) => (cur === tableId ? null : cur)), 1400);
  }, [refreshTable]);

  // Gerçek zamanlı senkron
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    const handleChanged = () => { fetchTables({ silent: true }); fetchReservations(); };
    socket.on('tables:changed', handleChanged);
    socket.on('connect', handleChanged);
    return () => {
      socket.off('tables:changed', handleChanged);
      socket.off('connect', handleChanged);
    };
  }, [fetchTables, fetchReservations]);

  // Soket koparsa diye yedek yenileme
  useEffect(() => {
    const interval = setInterval(() => { fetchTables({ silent: true }); }, 30000);
    return () => clearInterval(interval);
  }, [fetchTables]);

  const fetchAreas = useCallback(async () => {
    try { const res = await client.get('/table-areas'); setAreas(res.data); } catch { /* sessiz */ }
  }, []);

  useEffect(() => {
    // activeOnly=1: pasife alınmış ("86'lanmış") ürünler yeni sipariş
    // ekranında hiç görünmesin (bkz. controllers/productController.js).
    client.get('/products', { params: { activeOnly: 1 } }).then((res) => setProducts(res.data)).catch(() => {});
    client.get('/categories').then((res) => setCategories(res.data)).catch(() => {});
    fetchAreas();
  }, [fetchAreas]);

  // Oturma süresi (OrderCreatedAt) ve "ödeme bekliyor" (OrderStatus) artık
  // getAllTables yanıtında geliyor — ayrı per-masa zenginleştirme çağrısı yok.

  const productName = (productId) =>
    products.find((p) => p.ProductId === productId)?.Name || `Ürün #${productId}`;

  const deleteTable = async (tableId) => {
    if (!window.confirm('Bu masayı silmek istediğinize emin misiniz?')) return;
    try {
      await client.delete(`/tables/${tableId}`);
      fetchTables({ silent: true });
    } catch (err) {
      alert(err.response?.data?.error || 'Masa silinemedi.');
    }
  };

  const cancelReservation = async (reservation) => {
    if (!window.confirm('Bu rezervasyonu iptal etmek istediğinize emin misiniz?')) return;
    try {
      await client.patch(`/reservations/${reservation.ReservationId}/cancel`);
      const table = tables.find((t) => t.TableId === reservation.TableId);
      if (table && table.Status === 'Reserved') {
        await client.patch(`/tables/${reservation.TableId}/status`, { Status: 'Empty' });
      }
      fetchReservations();
      fetchTables({ silent: true });
      setToast({ message: 'Rezervasyon iptal edildi.' });
    } catch (err) {
      setToast({ message: err.response?.data?.error || 'Rezervasyon iptal edilemedi.' });
    }
  };

  const needsPayment = (t) => Boolean(t.ActiveOrderId) && t.OrderStatus === 'Served';

  // Alan (bölge) artık backend'de Tables.Area kolonunda tutulur.
  const areaCounts = tables.reduce((acc, t) => { const a = t.Area || DEFAULT_AREA; acc[a] = (acc[a] || 0) + 1; return acc; }, {});

  // Masaya göre aktif rezervasyon eşlemesi (rezerve masalarda detay göstermek için).
  const resByTable = {};
  reservations.forEach((r) => {
    if (r.Status && r.Status !== RES_STATUS_ACTIVE) return;
    if (!resByTable[r.TableId]) resByTable[r.TableId] = r;
  });

  const counts = tables.reduce((acc, t) => { acc[t.Status] = (acc[t.Status] || 0) + 1; return acc; }, {});
  const needsPaymentCount = tables.filter(needsPayment).length;

  const normalizedSearch = search.trim();
  const visibleTables = tables.filter((t) => {
    if (selectedArea && (t.Area || DEFAULT_AREA) !== selectedArea) return false;
    if (filter === 'NeedsPayment') { if (!needsPayment(t)) return false; }
    else if (filter && t.Status !== filter) return false;
    if (normalizedSearch && !String(t.TableNumber).includes(normalizedSearch)) return false;
    return true;
  });

  const clock = new Intl.DateTimeFormat('tr-TR', {
    weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
  }).format(now);

  // ---- Sürükle-bırak ----
  const handleDragStart = (e, table) => {
    if (!table.ActiveOrderId) return;
    setDraggingId(table.TableId);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(table.TableId)); } catch { /* bazı tarayıcılar */ }
  };
  const handleDragOverCard = (e, table) => {
    if (draggingId == null || table.TableId === draggingId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverId !== table.TableId) setDragOverId(table.TableId);
  };
  const handleDropCard = (e, table) => {
    e.preventDefault();
    const from = tables.find((t) => t.TableId === draggingId);
    setDraggingId(null);
    setDragOverId(null);
    if (!from || table.TableId === from.TableId) return;
    // Hedefte aktif sipariş varsa Merge, yoksa Move.
    const type = table.ActiveOrderId ? 'Merge' : 'Move';
    setTransferError('');
    setTransferPrompt({ from, to: table, type });
  };
  const handleDragEnd = () => { setDraggingId(null); setDragOverId(null); };

  const confirmTransfer = async () => {
    if (!transferPrompt) return;
    const { from, to, type } = transferPrompt;
    setTransferBusy(true);
    setTransferError('');
    try {
      await client.post(`/tables/${from.TableId}/transfer`, {
        OrderId: from.ActiveOrderId,
        ToTableId: to.TableId,
        TransferType: type,
      });
      // Optimistik: sadece iki masayı tazele (socket ayrıca teyit eder).
      refreshTable(from.TableId);
      refreshTable(to.TableId);
      setToast({ message: type === 'Merge' ? 'Siparişler birleştirildi.' : 'Sipariş taşındı.' });
      setTransferPrompt(null);
    } catch (err) {
      setTransferError(err.response?.data?.error || 'Transfer başarısız oldu.');
    } finally {
      setTransferBusy(false);
    }
  };

  const openDetail = (tableId) => setSelectedTableId(tableId);

  return (
    <div className="p-6 lg:p-8">
      {/* ============ Başlık ============ */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <p className="font-mono text-[10px] tracking-[0.3em] text-ember uppercase mb-1.5">Masa Düzeni</p>
          <h1 className="font-display text-3xl font-bold text-paper leading-none">Masalar</h1>
          <p className="font-mono text-xs text-slate mt-2 capitalize">{clock}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchTables({ silent: true })}
            title="Yenile"
            className="font-mono text-xs uppercase tracking-wide text-slate hover:text-ember border border-hairline rounded-lg px-3 py-2.5 transition-colors"
          >
            ↻
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowAreaManager(true)}
              title="Salon/Teras/Bahçe gibi bölümleri yönet"
              className="font-mono text-xs uppercase tracking-wide text-slate hover:text-ember border border-hairline rounded-lg px-3 py-2.5 transition-colors"
            >
              ⚙ Bölümler
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="font-mono text-xs uppercase tracking-wide text-cream bg-ember hover:bg-ember/90 rounded-lg px-4 py-2.5 transition-colors shadow-sm"
            >
              + Yeni Masa
            </button>
          )}
        </div>
      </div>

      {/* ============ Bölge (alan) sekmeleri ============ */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-2 border-b border-hairline">
        {[{ key: '', label: 'Tümü' }, ...areas.map((a) => ({ key: a.Name, label: areaLabelOf(a.Name) }))].map((a) => {
          const active = selectedArea === a.key;
          const c = a.key ? (areaCounts[a.key] || 0) : tables.length;
          return (
            <button
              key={a.key || 'all'}
              onClick={() => setSelectedArea(a.key)}
              className={`shrink-0 font-mono text-xs uppercase tracking-wide px-4 py-2.5 rounded-t-lg border-b-2 transition-all ${
                active
                  ? 'border-ember text-ember font-semibold bg-ember/5'
                  : 'border-transparent text-slate hover:text-paper'
              }`}
            >
              {a.label} <span className="opacity-60">({c})</span>
            </button>
          );
        })}
      </div>

      {/* ============ Filtreler + arama ============ */}
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map((f) => {
            const active = filter === f.value;
            const badgeCount = f.value === 'NeedsPayment' ? needsPaymentCount : f.value ? (counts[f.value] || 0) : tables.length;
            return (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`font-mono text-xs uppercase tracking-wide px-3.5 py-2 rounded-lg border transition-all ${
                  active ? 'border-ember bg-ember/10 text-ember font-semibold' : 'border-hairline text-slate hover:text-paper hover:border-slate/40'
                }`}
              >
                {f.label} <span className="opacity-60">{badgeCount}</span>
              </button>
            );
          })}
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate/60 text-sm">🔍</span>
          <input
            type="text"
            inputMode="numeric"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Masa no ara…"
            className="w-44 border border-hairline rounded-lg pl-9 pr-3 py-2 font-mono text-sm text-paper bg-panel
                       focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate hover:text-ember text-xs">✕</button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 mb-6">{error}</p>
      )}

      {draggingId != null && (
        <p className="font-mono text-[11px] text-ember mb-3 animate-pulse">
          Bırakmak için başka bir masanın üzerine sürükleyin — boş masa: taşı, dolu masa: birleştir.
        </p>
      )}

      {/* ============ Kart ızgarası ============ */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-hairline bg-panel h-52 animate-pulse" />
          ))}
        </div>
      ) : visibleTables.length === 0 ? (
        <div className="border border-dashed border-hairline rounded-2xl p-12 text-center bg-panel/50">
          <p className="text-slate font-mono text-sm">
            {tables.length === 0 ? 'Gösterilecek masa bulunamadı.' : 'Bu filtre/aramaya uygun masa yok.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          {visibleTables.map((table) => (
            <TableCard
              key={table.TableId}
              table={table}
              reservation={resByTable[table.TableId]}
              areaLabel={areaLabelOf(table.Area || DEFAULT_AREA)}
              now={now}
              flashing={flashTableId === table.TableId}
              needsPay={needsPayment(table)}
              isAdmin={isAdmin}
              canManageReservation={canManageReservation}
              canTakePayment={canTakePayment}
              isDragging={draggingId === table.TableId}
              isDropTarget={dragOverId === table.TableId && draggingId != null && draggingId !== table.TableId}
              onOpen={() => openDetail(table.TableId)}
              onPayment={() => setQuickPaymentTableId(table.TableId)}
              onBill={() => setQuickBillTableId(table.TableId)}
              onEdit={() => setEditingTable(table)}
              onDelete={() => deleteTable(table.TableId)}
              onReserve={() => setReserveTable(table)}
              onCancelReservation={cancelReservation}
              onDragStart={handleDragStart}
              onDragOverCard={handleDragOverCard}
              onDropCard={handleDropCard}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      )}

      {transferPrompt && (
        <TransferConfirmModal
          from={transferPrompt.from}
          to={transferPrompt.to}
          type={transferPrompt.type}
          submitting={transferBusy}
          error={transferError}
          onCancel={() => { if (!transferBusy) { setTransferPrompt(null); setTransferError(''); } }}
          onConfirm={confirmTransfer}
        />
      )}

      {quickPaymentTableId && (
        <QuickPaymentModal
          tableId={quickPaymentTableId}
          productName={productName}
          onClose={() => setQuickPaymentTableId(null)}
          onFullyPaid={() => {
            handlePaymentSuccess(quickPaymentTableId);
          }}
        />
      )}

      {quickBillTableId && (
        <BillModal
          tableId={quickBillTableId}
          productName={productName}
          onClose={() => setQuickBillTableId(null)}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[100] bg-ink text-cream font-mono text-sm px-5 py-3 rounded-xl shadow-lg
                         border border-ink/50 flex items-center gap-2 animate-[toastIn_0.25s_ease-out]">
          <style>{`@keyframes toastIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          <span className="text-moss">✓</span> {toast.message}
        </div>
      )}

      {selectedTableId && (
        <TableDetailModal
          tableId={selectedTableId}
          tables={tables}
          products={products}
          categories={categories}
          userId={user?.userId}
          productName={productName}
          onClose={() => setSelectedTableId(null)}
          onChanged={() => fetchTables({ silent: true })}
          onPaymentSuccess={handlePaymentSuccess}
          onOrderCreated={handleOrderCreated}
        />
      )}

      {showCreateModal && (
        <TableFormModal
          title="Yeni Masa"
          areas={areas}
          onClose={() => setShowCreateModal(false)}
          onSubmit={async (values) => {
            await client.post('/tables', { TableNumber: values.TableNumber, Capacity: values.Capacity, Area: values.Area || DEFAULT_AREA });
            setShowCreateModal(false);
            fetchTables({ silent: true });
          }}
        />
      )}

      {reserveTable && (
        <ReservationFormModal
          table={reserveTable}
          onClose={() => setReserveTable(null)}
          onSubmit={async (values) => {
            await client.post('/reservations', { TableId: reserveTable.TableId, ...values });
            await client.patch(`/tables/${reserveTable.TableId}/status`, { Status: 'Reserved' });
            setReserveTable(null);
            fetchReservations();
            fetchTables({ silent: true });
            setToast({ message: 'Rezervasyon oluşturuldu, masa rezerve edildi.' });
          }}
        />
      )}

      {editingTable && (
        <TableFormModal
          title={`Masa ${editingTable.TableNumber} — Düzenle`}
          initial={editingTable}
          initialArea={editingTable.Area || DEFAULT_AREA}
          areas={areas}
          onClose={() => setEditingTable(null)}
          onSubmit={async (values) => {
            await client.patch(`/tables/${editingTable.TableId}`, { TableNumber: values.TableNumber, Capacity: values.Capacity, Area: values.Area || DEFAULT_AREA });
            setEditingTable(null);
            fetchTables({ silent: true });
          }}
        />
      )}

      {showAreaManager && (
        <AreaManagerDrawer
          areas={areas}
          onClose={() => setShowAreaManager(false)}
          onChanged={fetchAreas}
        />
      )}
    </div>
  );
}

// ============================================================
// Masa detay paneli: aktif sipariş, elle durum değiştirme, taşı/birleştir
// ============================================================
function TableDetailModal({ tableId, tables, products, categories, userId, productName, initialShowTransfer = false, onClose, onChanged, onPaymentSuccess, onOrderCreated }) {
  const { user } = useAuth();
  const canTakePayment = ['Cashier', 'Admin'].includes(user?.role);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [showTransferForm, setShowTransferForm] = useState(initialShowTransfer);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError('');
    }
    try {
      const res = await client.get(`/tables/${tableId}`);
      setDetail(res.data);
    } catch (err) {
      if (!silent) setError(err.response?.data?.error || 'Masa detayı getirilemedi.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [tableId]);

  useEffect(() => {
    load();
  }, [load]);

  // Bu modal açıkken başka bir cihazdan aynı masa/sipariş değiştirilirse anlık yansısın.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;

    const handleChanged = () => load({ silent: true });
    socket.on('tables:changed', handleChanged);
    return () => socket.off('tables:changed', handleChanged);
  }, [load]);

  if (loading) {
    return (
      <ModalShell onClose={onClose} title={`Masa ${tableId}`}>
        <p className="text-slate font-mono text-sm">Yükleniyor...</p>
      </ModalShell>
    );
  }

  if (error) {
    return (
      <ModalShell onClose={onClose} title={`Masa ${tableId}`}>
        <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3">{error}</p>
      </ModalShell>
    );
  }

  const cfg = STATUS_CONFIG[detail.Status] || STATUS_CONFIG.Empty;
  const otherTables = tables.filter((t) => t.TableId !== detail.TableId);
  const canTransfer =
    detail.activeOrder && !['Paid', 'Cancelled', 'Merged'].includes(detail.activeOrder.Status);

  const headerMeta = (
    <div className="flex items-center gap-2 font-mono text-xs">
      <span className="inline-flex items-center gap-1.5 border border-hairline rounded-sm px-2.5 py-1 bg-hairline/30 text-slate">
        👥 <span className="text-paper font-semibold">{detail.Capacity ? `${detail.Capacity} kişi` : '—'}</span>
      </span>
      <span className={`inline-flex items-center gap-1.5 border rounded-sm px-2.5 py-1 ${cfg.border} ${cfg.bg}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        <span className="text-paper font-semibold">{cfg.label}</span>
      </span>
    </div>
  );

  const headerActions = canTransfer ? (
    <button
      onClick={() => setShowTransferForm((v) => !v)}
      title="Siparişi Taşı / Birleştir"
      className={`w-11 h-11 flex flex-col items-center justify-center rounded-sm border transition-colors ${
        showTransferForm
          ? 'border-ember bg-ember/10 text-ember'
          : 'border-hairline text-slate hover:border-ember hover:text-ember'
      }`}
    >
      <span className="text-base leading-none">🔀</span>
      <span className="text-[8px] uppercase tracking-wide mt-0.5">Taşı</span>
    </button>
  ) : null;

  return (
    <ModalShell
      onClose={onClose}
      title={`Masa ${detail.TableNumber}`}
      eyebrow="Masa Detayı"
      size="full"
      meta={headerMeta}
      actions={headerActions}
    >
      {(actionError || actionMessage) && (
        <p className={`text-sm font-medium border-l-2 pl-3 mb-4 ${actionError ? 'text-ember border-ember' : 'text-moss border-moss'}`}>
          {actionError || actionMessage}
        </p>
      )}

      {canTransfer && showTransferForm && (
        <div className="mb-5">
          <TransferForm
            fromTableId={detail.TableId}
            orderId={detail.activeOrder.OrderId}
            otherTables={otherTables}
            onCancel={() => setShowTransferForm(false)}
            onDone={(msg) => {
              setShowTransferForm(false);
              setActionMessage(msg);
              setActionError('');
              onChanged();
              onClose();
            }}
            onError={(msg) => setActionError(msg)}
          />
        </div>
      )}

      {detail.activeOrder ? (
        <>
          <TableOrderCart
            tableId={detail.TableId}
            existingOrderId={detail.activeOrder.OrderId}
            existingOrder={detail.activeOrder}
            userId={userId}
            products={products}
            categories={categories}
            tableLabel={`Masa ${detail.TableNumber}`}
            onOrdered={async (msg) => {
              setActionMessage(msg);
              setActionError('');
              await load();
              onChanged();
            }}
            onError={(msg) => setActionError(msg)}
          />

          {!['Paid', 'Cancelled', 'Merged'].includes(detail.activeOrder.Status) && (
            <div className="mt-6 pt-5 border-t border-hairline">
              {canTakePayment ? (
                <PaymentDrawer
                  order={detail.activeOrder}
                  resolveProductName={(productId) => productName(productId)}
                  tableLabel={`Masa ${detail.TableNumber}`}
                  triggerClassName="w-full flex items-center justify-center gap-2 font-mono text-base uppercase tracking-wide
                                    text-cream bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800
                                    rounded-sm px-6 py-4 min-h-[3.25rem] transition-colors shadow-sm"
                  triggerLabel={<><span className="text-lg leading-none">💳</span> Ödeme Al</>}
                  onPaid={async (fullyPaid) => {
                    await load();
                    onChanged();
                    if (fullyPaid) onPaymentSuccess?.(detail.TableId);
                  }}
                />
              ) : (
                <p className="font-mono text-xs text-slate text-center py-2">
                  Ödeme almak için kasiyer veya yöneticiye başvurun.
                </p>
              )}
            </div>
          )}
        </>
      ) : (
        <TableOrderCart
          tableId={detail.TableId}
          userId={userId}
          products={products}
          categories={categories}
          tableLabel={`Masa ${detail.TableNumber}`}
          onOrdered={async (msg, meta) => {
            // Yeni sipariş oluşturulunca: modalı otomatik kapat, panoya dön,
            // sadece etkilenen masayı tazele (kasiyer manuel kapatmaz).
            if (meta?.created) {
              onOrderCreated?.(detail.TableId);
              onClose();
              return;
            }
            setActionMessage(msg);
            setActionError('');
            await load();
            onChanged();
          }}
          onError={(msg) => setActionError(msg)}
        />
      )}
    </ModalShell>
  );
}

// ============================================================
// Masada aktif sipariş yokken: ürünleri (fotoğraflı) listele, sepete ekle,
// "Sipariş Ver" ile POST /api/orders çağır.
// ============================================================
function TableOrderCart({ tableId, existingOrderId, existingOrder, userId, products, categories, tableLabel, onOrdered, onError }) {
  const { ProductOptionsPopupEnabled, KitchenAutoPrintEnabled, PrinterPaperWidth, KitchenPrinterName } = useSettings();
  // Garson gönderilmiş bir kalemin adedini azaltamaz/çıkaramaz (bkz. backend:
  // orderController.updateOrderItemQuantity + routes/orders.js) — sadece
  // artırabilir/yeni ürün ekleyebilir. Bu, sadece UI'ı gizler; asıl kısıt
  // sunucuda.
  const { user } = useAuth();
  const canDecreaseItem = ['Cashier', 'Admin'].includes(user?.role);
  // { [ProductId]: { quantity, extras: { [ExtraProductId]: quantity }, syrups: { [SyrupProductId]: quantity } } }
  const [cart, setCart] = useState({});
  const [activeCategoryId, setActiveCategoryId] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [cartFilter, setCartFilter] = useState('all'); // 'all' | 'inCart'
  const [quickFilter, setQuickFilter] = useState('all'); // 'all' | 'popular' | 'new' | 'available' | 'outOfStock'
  const [selectedProductId, setSelectedProductId] = useState(null); // ürün detay modalı açık mı
  const [showNoteField, setShowNoteField] = useState(false);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');
  const [itemActionBusy, setItemActionBusy] = useState(null);
  // { [ProductId]: { extras: [...], syrups: [...] } } — bu ÜRÜNE bağlı+etkin
  // opsiyonlar, GET /products/:id/order-options'tan gelir (bkz. productController.js).
  // Global bir ekstra kataloğu yerine, yönetici tarafından o ürüne bağlanmış
  // olanlar dışında hiçbir şey sipariş ekranında gösterilmez.
  const [optionsByProduct, setOptionsByProduct] = useState({});
  const [extraPickerFor, setExtraPickerFor] = useState(null); // hangi kalem için opsiyon seçici açık

  // Sadaklık puanı ile ücretsiz ürün ekleme (SADECE mevcut bir siparişe —
  // henüz oluşturulmamış bir siparişe eklenecek OrderId yok). Bkz. backend:
  // controllers/loyaltyController.js.
  const [showLoyaltyPanel, setShowLoyaltyPanel] = useState(false);
  const [loyaltyUsername, setLoyaltyUsername] = useState('');
  const [loyaltyCustomer, setLoyaltyCustomer] = useState(null);
  const [loyaltyLookupBusy, setLoyaltyLookupBusy] = useState(false);
  const [loyaltyError, setLoyaltyError] = useState('');
  const [redeemBusy, setRedeemBusy] = useState(null);

  useEffect(() => {
    if (!extraPickerFor || optionsByProduct[extraPickerFor]) return;
    client
      .get(`/products/${extraPickerFor}/order-options`)
      .then((res) => setOptionsByProduct((prev) => ({ ...prev, [extraPickerFor]: res.data })))
      .catch(() => setOptionsByProduct((prev) => ({ ...prev, [extraPickerFor]: { extras: [], syrups: [] } })));
  }, [extraPickerFor, optionsByProduct]);

  // Ürün detay modalı açıldığında o ürünün ekstra/şurup seçeneklerini getir
  // (aynı önbellek, extraPickerFor akışıyla paylaşılır).
  useEffect(() => {
    if (!selectedProductId || optionsByProduct[selectedProductId]) return;
    client
      .get(`/products/${selectedProductId}/order-options`)
      .then((res) => setOptionsByProduct((prev) => ({ ...prev, [selectedProductId]: res.data })))
      .catch(() => setOptionsByProduct((prev) => ({ ...prev, [selectedProductId]: { extras: [], syrups: [] } })));
  }, [selectedProductId, optionsByProduct]);

  const optionsFor = (productId) => optionsByProduct[productId] || { extras: [], syrups: [] };
  const catalogMapFor = (productId, type) => new Map(optionsFor(productId)[type].map((o) => [o.ProductId, o]));
  const findOption = (productId, type, optionId) =>
    optionsFor(productId)[type].find((o) => o.ProductId === Number(optionId));

  const changeExistingItemQuantity = async (item, delta) => {
    setLocalError('');
    setItemActionBusy(item.OrderDetailsId);
    try {
      const newQuantity = item.Quantity + delta;
      if (newQuantity <= 0) {
        await client.delete(`/orders/${existingOrderId}/items/${item.OrderDetailsId}`);
      } else {
        await client.patch(`/orders/${existingOrderId}/items/${item.OrderDetailsId}`, { Quantity: newQuantity });
      }
      await onOrdered?.('Sipariş güncellendi.');
    } catch (err) {
      const msg = err.response?.data?.error || 'Sipariş güncellenemedi.';
      setLocalError(msg);
      onError?.(msg);
    } finally {
      setItemActionBusy(null);
    }
  };

  const removeExistingItem = async (item) => {
    setLocalError('');
    setItemActionBusy(item.OrderDetailsId);
    try {
      await client.delete(`/orders/${existingOrderId}/items/${item.OrderDetailsId}`);
      await onOrdered?.('Ürün siparişten çıkarıldı.');
    } catch (err) {
      const msg = err.response?.data?.error || 'Ürün çıkarılamadı.';
      setLocalError(msg);
      onError?.(msg);
    } finally {
      setItemActionBusy(null);
    }
  };

  const lookupLoyaltyCustomer = async () => {
    setLoyaltyError('');
    setLoyaltyCustomer(null);
    if (!loyaltyUsername.trim()) return;
    setLoyaltyLookupBusy(true);
    try {
      const res = await client.get(`/loyalty/${encodeURIComponent(loyaltyUsername.trim())}`);
      setLoyaltyCustomer(res.data);
    } catch (err) {
      setLoyaltyError(err.response?.data?.error || 'Müşteri bulunamadı.');
    } finally {
      setLoyaltyLookupBusy(false);
    }
  };

  const redeemLoyaltyItem = async (product) => {
    setLoyaltyError('');
    setRedeemBusy(product.ProductId);
    try {
      const res = await client.post('/loyalty/redeem', {
        Username: loyaltyCustomer.Username,
        ProductId: product.ProductId,
        OrderId: existingOrderId,
      });
      setLoyaltyCustomer((prev) => ({ ...prev, LoyaltyPoints: res.data.remainingPoints }));
      await onOrdered?.('Ürün puanla eklendi.');
    } catch (err) {
      setLoyaltyError(err.response?.data?.error || 'Ürün puanla eklenemedi.');
    } finally {
      setRedeemBusy(null);
    }
  };

  const activeProducts = products.filter((p) => p.IsActive !== false && p.IsActive !== 0);

  const categoriesWithProducts = categories.filter((c) =>
    activeProducts.some((p) => p.CategoryId === c.CategoryId)
  );

  const normalizedSearch = searchTerm.trim().toLocaleLowerCase('tr-TR');

  const visibleProducts = activeProducts
    .filter((p) =>
      activeCategoryId === 'all' ? true : String(p.CategoryId) === String(activeCategoryId)
    )
    .filter((p) =>
      normalizedSearch
        ? p.Name.toLocaleLowerCase('tr-TR').includes(normalizedSearch) ||
          String(p.Barcode || '').toLocaleLowerCase('tr-TR').includes(normalizedSearch)
        : true
    )
    .filter((p) => (cartFilter === 'inCart' ? Boolean(cart[p.ProductId]) : true))
    .filter((p) => {
      const avail = isProductAvailable(p);
      if (quickFilter === 'popular') return p.IsPopular === true || p.IsPopular === 1;
      if (quickFilter === 'available') return avail;
      if (quickFilter === 'outOfStock') return !avail;
      return true;
    });

  const addToCart = (productId) => {
    setCart((prev) => ({
      ...prev,
      [productId]: {
        quantity: (prev[productId]?.quantity || 0) + 1,
        extras: prev[productId]?.extras || {},
        syrups: prev[productId]?.syrups || {},
      },
    }));
  };

  // Ürün detay modalından tek seferde adet + ekstra/şurup yazar (replace semantiği).
  const setLineForProduct = (productId, line) => {
    setCart((prev) => ({ ...prev, [productId]: line }));
  };

  const removeFromCart = (productId) => {
    setCart((prev) => {
      if (!prev[productId]) return prev;
      const nextQuantity = prev[productId].quantity - 1;
      const next = { ...prev };
      if (nextQuantity <= 0) {
        delete next[productId];
      } else {
        next[productId] = { ...prev[productId], quantity: nextQuantity };
      }
      return next;
    });
  };

  const removeLineFromCart = (productId) => {
    setCart((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  // Bir sepet kalemine ekstra/şurup ekler/adedini artırır (ör. "2 pump vanilya").
  // `type`: 'extras' | 'syrups'.
  const addOptionToLine = (productId, type, optionId) => {
    setCart((prev) => {
      const line = prev[productId];
      if (!line) return prev;
      const currentQty = line[type][optionId] || 0;
      return {
        ...prev,
        [productId]: { ...line, [type]: { ...line[type], [optionId]: currentQty + 1 } },
      };
    });
  };

  const removeOptionFromLine = (productId, type, optionId) => {
    setCart((prev) => {
      const line = prev[productId];
      if (!line || !line[type][optionId]) return prev;
      const nextQty = line[type][optionId] - 1;
      const nextOptions = { ...line[type] };
      if (nextQty <= 0) delete nextOptions[optionId];
      else nextOptions[optionId] = nextQty;
      return { ...prev, [productId]: { ...line, [type]: nextOptions } };
    });
  };

  const lineTotal = (product, line) =>
    calculateLineTotal(product?.Price, line.quantity, [
      { selections: line.extras, catalogById: catalogMapFor(product?.ProductId, 'extras') },
      { selections: line.syrups, catalogById: catalogMapFor(product?.ProductId, 'syrups') },
    ]);

  const cartEntries = Object.entries(cart);
  const itemCount = cartEntries.reduce((sum, [, line]) => sum + line.quantity, 0);
  const total = cartEntries.reduce((sum, [productId, line]) => {
    const product = products.find((p) => String(p.ProductId) === String(productId));
    return sum + lineTotal(product, line);
  }, 0);

  const money = (n) =>
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(n) || 0);

  const submitOrder = async () => {
    setLocalError('');
    if (!existingOrderId && !userId) {
      setLocalError('Kullanıcı bilgisi bulunamadı, tekrar giriş yapın.');
      return;
    }
    if (cartEntries.length === 0) {
      setLocalError('Sepete en az bir ürün ekleyin.');
      return;
    }
    setSubmitting(true);
    try {
      const itemsPayload = cartEntries.map(([productId, line]) => {
        const extrasPayload = Object.entries(line.extras)
          .filter(([, qty]) => qty > 0)
          .map(([extraId, qty]) => ({ ExtraProductId: Number(extraId), Quantity: qty }));
        const syrupsPayload = Object.entries(line.syrups)
          .filter(([, qty]) => qty > 0)
          .map(([syrupId, qty]) => ({ SyrupProductId: Number(syrupId), Quantity: qty }));
        return {
          ProductId: Number(productId),
          Quantity: line.quantity,
          ...(extrasPayload.length > 0 ? { Extras: extrasPayload } : {}),
          ...(syrupsPayload.length > 0 ? { Syrups: syrupsPayload } : {}),
        };
      });

      let newOrderId = existingOrderId;
      if (existingOrderId) {
        await client.post(`/orders/${existingOrderId}/items`, { Items: itemsPayload });
      } else {
        const res = await client.post('/orders', {
          TableId: tableId,
          UserId: userId,
          Items: itemsPayload,
          Note: note.trim() || undefined,
        });
        newOrderId = res.data?.order?.OrderId;
      }

      // Mutfak/bar fişi — fiyat içermez, sadece adet + ürün + ekstra/şurup + not.
      // Sepet temizlenmeden önce, o an ekranda gösterilen isimlerle (findOption) kurulur.
      const kitchenItems = cartEntries.map(([productId, line]) => {
        const product = products.find((p) => String(p.ProductId) === String(productId));
        return {
          quantity: line.quantity,
          name: product?.Name || `Ürün #${productId}`,
          extras: Object.entries(line.extras)
            .filter(([, qty]) => qty > 0)
            .map(([extraId, qty]) => ({ quantity: qty, name: findOption(productId, 'extras', extraId)?.Name || 'Ekstra' })),
          syrups: Object.entries(line.syrups)
            .filter(([, qty]) => qty > 0)
            .map(([syrupId, qty]) => ({ quantity: qty, name: findOption(productId, 'syrups', syrupId)?.Name || 'Şurup' })),
        };
      });
      // Ayarlar · Donanım sekmesinden kapatılabilir (KitchenAutoPrintEnabled) —
      // bazı işletmeler mutfak fişini manuel/başka bir yoldan basmak isteyebilir.
      if (KitchenAutoPrintEnabled !== false) {
        try {
          printKitchenTicket({ orderId: newOrderId, tableLabel, items: kitchenItems, note: note.trim(), paperWidth: PrinterPaperWidth || 80, printerName: KitchenPrinterName });
        } catch {
          // Yazdırma başarısız olsa bile (ör. pop-up engellendi) sipariş akışı durmamalı
        }
      }

      setCart({});
      setExtraPickerFor(null);
      setNote('');
      setShowNoteField(false);
      // meta.created = yeni sipariş mi? Ebeveyn buna göre modalı otomatik kapatır.
      await onOrdered?.(existingOrderId ? 'Ürünler siparişe eklendi.' : 'Sipariş oluşturuldu.', { created: !existingOrderId });
    } catch (err) {
      const msg = err.response?.data?.error || 'İşlem başarısız oldu.';
      setLocalError(msg);
      onError?.(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-2">Sipariş Oluştur</p>

      {/* Üst sabit alan: arama + kategoriler (yatay bar) — sayfa kaydırılmadan
          her zaman görünür, sadece aşağıdaki ürün ızgarası kendi içinde kayar. */}
      <div className="mb-3 space-y-2">
        <MenuFilterBar searchTerm={searchTerm} onSearchChange={setSearchTerm} />
        {categoriesWithProducts.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => setActiveCategoryId('all')}
              className={`shrink-0 font-mono text-[11px] uppercase tracking-wide px-3.5 py-2 rounded-full border transition-colors whitespace-nowrap ${
                activeCategoryId === 'all'
                  ? 'border-ember bg-ember/10 text-ember font-semibold'
                  : 'border-hairline text-slate hover:text-paper hover:border-paper/30'
              }`}
            >
              Tümü
            </button>
            {categoriesWithProducts.map((c) => (
              <button
                key={c.CategoryId}
                type="button"
                onClick={() => setActiveCategoryId(c.CategoryId)}
                className={`shrink-0 font-mono text-[11px] uppercase tracking-wide px-3.5 py-2 rounded-full border transition-colors whitespace-nowrap ${
                  String(activeCategoryId) === String(c.CategoryId)
                    ? 'border-ember bg-ember/10 text-ember font-semibold'
                    : 'border-hairline text-slate hover:text-paper hover:border-paper/30'
                }`}
              >
                {c.Name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-4 items-start">
        {/* SOL: hızlı filtre rayı (dikey, dar) — Popüler/Mevcut/Tükenen + Sepettekiler */}
        <div className="w-28 shrink-0 flex flex-col gap-1.5">
          {QUICK_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setQuickFilter(f.value)}
              className={`text-left font-mono text-[11px] uppercase tracking-wide px-3 min-h-[2.5rem] rounded-sm transition-colors ${
                quickFilter === f.value
                  ? 'bg-ember/10 text-ember font-semibold'
                  : 'text-slate hover:bg-hairline/60 hover:text-paper'
              }`}
            >
              {f.label}
            </button>
          ))}
          <span className="h-px bg-hairline my-1" />
          <button
            type="button"
            onClick={() => setCartFilter(cartFilter === 'inCart' ? 'all' : 'inCart')}
            className={`text-left font-mono text-[11px] uppercase tracking-wide px-3 min-h-[2.5rem] rounded-sm transition-colors ${
              cartFilter === 'inCart'
                ? 'bg-ember/10 text-ember font-semibold'
                : 'text-slate hover:bg-hairline/60 hover:text-paper'
            }`}
          >
            Sepettekiler{itemCount > 0 ? ` (${itemCount})` : ''}
          </button>
        </div>

        {/* ORTA: ürün ızgarası — TEK kaydırılabilir alan (overscroll-contain,
            kaydırma sınıra ulaşınca arka plana/modala sıçramasın diye) */}
        <div className="flex-1 min-w-0">
          {products.length === 0 ? (
            <ProductGridSkeleton />
          ) : visibleProducts.length === 0 ? (
            <EmptyState
              title="Ürün bulunamadı"
              message={
                cartFilter === 'inCart'
                  ? 'Sepette ürün yok.'
                  : normalizedSearch
                  ? 'Aramanızla eşleşen bir ürün yok. Farklı bir anahtar kelime deneyin.'
                  : 'Bu filtrede/kategoride ürün yok.'
              }
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 max-h-[68vh] overflow-y-auto overscroll-contain pr-1">
              <AnimatePresence initial={false}>
                {visibleProducts.map((p) => (
                  <ProductCard
                    key={p.ProductId}
                    product={p}
                    quantity={cart[p.ProductId]?.quantity || 0}
                    onOpen={(product) => {
                      if (ProductOptionsPopupEnabled === false) {
                        addToCart(product.ProductId);
                      } else {
                        setSelectedProductId(product.ProductId);
                      }
                    }}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* SAĞ: sabit sepet paneli (~%30) */}
        <div className="w-80 shrink-0 border border-hairline rounded-sm bg-hairline/20 flex flex-col max-h-[68vh]">
          <div className="px-4 pt-3 pb-2 border-b border-hairline">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[10px] uppercase tracking-widest text-slate flex items-center gap-1.5">
                🧺 Sepet
                {itemCount > 0 && (
                  <span className="font-mono text-[10px] text-cream bg-ember rounded-full px-1.5 py-0.5 leading-none tabular-nums">
                    {itemCount}
                  </span>
                )}
              </p>
              {cartEntries.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart({})}
                  className="font-mono text-[10px] uppercase tracking-wide text-slate hover:text-ember transition-colors"
                >
                  Temizle
                </button>
              )}
            </div>
            {existingOrder && (
              <p className="font-mono text-[10px] text-slate mt-1">
                Sipariş #{existingOrder.OrderId} · {ORDER_STATUS_LABEL[existingOrder.Status] || existingOrder.Status}
              </p>
            )}
            {existingOrderId && (
              <button
                type="button"
                onClick={() => setShowLoyaltyPanel((v) => !v)}
                className="mt-2 w-full font-mono text-[10px] uppercase tracking-wide text-slate hover:text-ember border border-hairline rounded-sm px-2.5 py-1.5 transition-colors"
              >
                🎁 Puanla Ürün Ekle
              </button>
            )}
          </div>

          {existingOrderId && showLoyaltyPanel && (
            <div className="px-4 pb-3 border-b border-hairline space-y-2">
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={loyaltyUsername}
                  onChange={(e) => setLoyaltyUsername(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); lookupLoyaltyCustomer(); } }}
                  placeholder="Kullanıcı adı"
                  className="flex-1 border border-hairline rounded-sm px-2.5 py-2 font-body text-sm text-paper bg-panel
                             focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
                />
                <button
                  type="button"
                  onClick={lookupLoyaltyCustomer}
                  disabled={loyaltyLookupBusy || !loyaltyUsername.trim()}
                  className="font-mono text-[11px] uppercase tracking-wide text-cream bg-ember hover:bg-ember/90 disabled:opacity-40 rounded-sm px-3 py-2 transition-colors shrink-0"
                >
                  {loyaltyLookupBusy ? '...' : 'Sorgula'}
                </button>
              </div>

              {loyaltyError && (
                <p className="text-ember text-xs font-medium border-l-2 border-ember pl-2">{loyaltyError}</p>
              )}

              {loyaltyCustomer && (
                <div className="space-y-1.5">
                  <p className="font-mono text-[11px] text-slate">
                    <span className="text-paper font-semibold">{loyaltyCustomer.Username}</span> · Bakiye: <span className="text-ember font-semibold">{loyaltyCustomer.LoyaltyPoints} puan</span>
                  </p>
                  {(() => {
                    const redeemable = products.filter((p) =>
                      p.LoyaltyPointCost != null && p.LoyaltyPointCost <= loyaltyCustomer.LoyaltyPoints &&
                      p.IsActive !== false && p.IsActive !== 0
                    );
                    if (redeemable.length === 0) {
                      return <p className="font-mono text-[11px] text-slate">Bu bakiyeyle alınabilecek ürün yok.</p>;
                    }
                    return (
                      <div className="space-y-1 max-h-32 overflow-y-auto overscroll-contain">
                        {redeemable.map((p) => (
                          <button
                            key={p.ProductId}
                            type="button"
                            disabled={redeemBusy === p.ProductId}
                            onClick={() => redeemLoyaltyItem(p)}
                            className="w-full flex items-center justify-between font-mono text-[11px] text-paper border border-hairline rounded-sm px-2.5 py-1.5
                                       hover:border-ember hover:text-ember transition-colors disabled:opacity-40"
                          >
                            <span className="truncate">{p.Name}</span>
                            <span className="shrink-0 ml-2 text-slate">{p.LoyaltyPointCost} puan</span>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-2 space-y-2 min-h-[4rem]">
            {existingOrder && existingOrder.items?.length > 0 && (
              <div className="mb-3">
                <p className="font-mono text-[10px] uppercase tracking-wide text-slate mb-1.5 sticky top-0 bg-hairline/20 backdrop-blur-sm py-1 -mx-1 px-1 z-10">
                  Sipariş Edilenler
                </p>
                <div className="space-y-1.5">
                  {existingOrder.items.map((item, i) => {
                    const product = products.find((p) => p.ProductId === item.ProductId);
                    const busy = itemActionBusy === item.OrderDetailsId;
                    const hasOptions = (item.Extras?.length > 0) || (item.Syrups?.length > 0);
                    return (
                      <div
                        key={item.OrderDetailsId ?? i}
                        className={`border border-hairline rounded-sm bg-panel/60 px-2.5 py-2 transition-opacity ${busy ? 'opacity-50' : ''}`}
                      >
                        {/* 1. satır: ürün adı + satır tutarı */}
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm text-paper truncate">{product?.Name || `Ürün #${item.ProductId}`}</span>
                          <span className="font-mono text-xs text-paper font-semibold tabular-nums shrink-0">
                            {money(item.Quantity * item.UnitPrice)}
                          </span>
                        </div>
                        {hasOptions && (
                          <p className="font-mono text-[10px] text-slate truncate mt-0.5">
                            {[
                              ...(item.Extras || []).map((e) => `${e.Quantity}x ${e.ExtraName}`),
                              ...(item.Syrups || []).map((s) => `${s.Quantity}x ${s.SyrupName}`),
                            ].join(' · ')}
                          </p>
                        )}
                        {/* 2. satır: dokunmatik adet kontrolü (44×44) + çıkar */}
                        <div className="flex items-center gap-1.5 mt-1.5">
                          {canDecreaseItem && (
                            <button
                              type="button"
                              disabled={busy}
                              aria-label="Adet azalt"
                              onClick={() => changeExistingItemQuantity(item, -1)}
                              className="w-11 h-11 flex items-center justify-center font-mono text-base text-slate hover:text-ember active:bg-charcoal
                                         border border-hairline rounded-sm select-none touch-manipulation disabled:opacity-30 transition-colors"
                            >
                              −
                            </button>
                          )}
                          <span className="font-mono text-sm text-paper w-6 text-center tabular-nums">{item.Quantity}</span>
                          <button
                            type="button"
                            disabled={busy}
                            aria-label="Adet artır"
                            onClick={() => changeExistingItemQuantity(item, 1)}
                            className="w-11 h-11 flex items-center justify-center font-mono text-base text-cream bg-ember hover:bg-ember/90 active:bg-ember/80
                                       rounded-sm select-none touch-manipulation disabled:opacity-40 transition-colors"
                          >
                            +
                          </button>
                          <span className="font-mono text-[10px] text-slate ml-1 truncate">
                            {money(item.UnitPrice)} / adet
                          </span>
                          {canDecreaseItem && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => removeExistingItem(item)}
                              title="Siparişten çıkar"
                              aria-label="Siparişten çıkar"
                              className="w-11 h-11 ml-auto shrink-0 flex items-center justify-center font-mono text-xs text-slate hover:text-ember
                                         touch-manipulation disabled:opacity-30 transition-colors"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {existingOrder && existingOrder.items?.length > 0 && (
              <p className="font-mono text-[10px] uppercase tracking-wide text-ember mb-1.5 sticky top-0 bg-hairline/20 backdrop-blur-sm py-1 -mx-1 px-1 z-10">
                Yeni Eklenecekler
              </p>
            )}

            {cartEntries.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-3xl leading-none mb-2 opacity-40">🧺</p>
                <p className="text-sm text-slate">
                  {existingOrder ? 'Eklenecek ürün seçilmedi' : 'Sepet boş'}
                </p>
                <p className="font-mono text-[10px] text-slate/60 mt-1">Soldaki listeden ürün seçin</p>
              </div>
            ) : (
              cartEntries.map(([productId, line]) => {
                const product = products.find((p) => String(p.ProductId) === String(productId));
                const qty = line.quantity;
                const selectedExtraIds = Object.keys(line.extras).filter((id) => line.extras[id] > 0);
                const selectedSyrupIds = Object.keys(line.syrups).filter((id) => line.syrups[id] > 0);
                const pickerOpen = extraPickerFor === productId;
                const productOptionsLoaded = Boolean(optionsByProduct[productId]);
                const productOptions = optionsFor(productId);
                return (
                  <div key={productId} className="border border-ember/40 rounded-sm bg-panel px-2.5 py-2">
                    {/* 1. satır: ürün adı + satır tutarı */}
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm text-paper font-medium truncate leading-tight">
                        {product?.Name || `Ürün #${productId}`}
                      </p>
                      <span className="font-mono text-xs text-paper font-semibold tabular-nums shrink-0">
                        {money(lineTotal(product, line))}
                      </span>
                    </div>
                    {/* 2. satır: dokunmatik adet kontrolü (44×44) + sepetten çıkar */}
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <button
                        type="button"
                        aria-label="Adet azalt"
                        onClick={() => removeFromCart(productId)}
                        className="w-11 h-11 flex items-center justify-center font-mono text-base text-slate hover:text-ember active:bg-charcoal
                                   border border-hairline rounded-sm select-none touch-manipulation transition-colors"
                      >
                        −
                      </button>
                      <span className="font-mono text-sm text-paper w-6 text-center tabular-nums">{qty}</span>
                      <button
                        type="button"
                        aria-label="Adet artır"
                        onClick={() => addToCart(productId)}
                        className="w-11 h-11 flex items-center justify-center font-mono text-base text-cream bg-ember hover:bg-ember/90 active:bg-ember/80
                                   rounded-sm select-none touch-manipulation transition-colors"
                      >
                        +
                      </button>
                      <span className="font-mono text-[10px] text-slate ml-1 truncate">
                        {money(product?.Price)} / adet
                      </span>
                      <button
                        type="button"
                        onClick={() => removeLineFromCart(productId)}
                        className="w-11 h-11 ml-auto shrink-0 flex items-center justify-center font-mono text-xs text-slate hover:text-ember
                                   touch-manipulation transition-colors"
                        title="Sepetten çıkar"
                        aria-label="Sepetten çıkar"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Seçili ekstra/şuruplar (ör. "2x Ekstra Shot") */}
                    {(selectedExtraIds.length > 0 || selectedSyrupIds.length > 0) && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {selectedExtraIds.map((extraId) => {
                          const extra = findOption(productId, 'extras', extraId);
                          if (!extra) return null;
                          return (
                            <button
                              key={`extra-${extraId}`}
                              type="button"
                              onClick={() => removeOptionFromLine(productId, 'extras', extraId)}
                              title="Kaldırmak için tıkla"
                              className="font-mono text-[10px] uppercase tracking-wide text-ember border border-ember/40 bg-ember/5 rounded-full px-2.5 py-1 hover:bg-ember/10"
                            >
                              {line.extras[extraId]}x {extra.Name} ✕
                            </button>
                          );
                        })}
                        {selectedSyrupIds.map((syrupId) => {
                          const syrup = findOption(productId, 'syrups', syrupId);
                          if (!syrup) return null;
                          return (
                            <button
                              key={`syrup-${syrupId}`}
                              type="button"
                              onClick={() => removeOptionFromLine(productId, 'syrups', syrupId)}
                              title="Kaldırmak için tıkla"
                              className="font-mono text-[10px] uppercase tracking-wide text-ember border border-ember/40 bg-ember/5 rounded-full px-2.5 py-1 hover:bg-ember/10"
                            >
                              {line.syrups[syrupId]}x {syrup.Name} ✕
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Ekstra/şurup ekle — sadece bu ürüne yönetici tarafından bağlanmış
                        opsiyonlar gösterilir (bkz. GET /products/:id/order-options) */}
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => setExtraPickerFor(pickerOpen ? null : productId)}
                        className="font-mono text-[10px] uppercase tracking-wide text-slate hover:text-ember"
                      >
                        {pickerOpen ? '− Ekstra/Şurup seçiciyi kapat' : '+ Ekstra/Şurup ekle'}
                      </button>
                      {pickerOpen && (
                        <div className="mt-2 border border-hairline rounded-sm divide-y divide-hairline">
                          {!productOptionsLoaded ? (
                            <p className="font-mono text-xs text-slate p-3">Yükleniyor...</p>
                          ) : productOptions.extras.length === 0 && productOptions.syrups.length === 0 ? (
                            <p className="font-mono text-xs text-slate p-3">Bu ürün için tanımlı ekstra/şurup yok.</p>
                          ) : (
                            <>
                              {productOptions.extras.map((extra) => (
                                <OptionCard
                                  key={`extra-${extra.ProductId}`}
                                  mode="order"
                                  option={extra}
                                  quantity={line.extras[extra.ProductId] || 0}
                                  onIncrement={() => addOptionToLine(productId, 'extras', extra.ProductId)}
                                  onDecrement={() => removeOptionFromLine(productId, 'extras', extra.ProductId)}
                                />
                              ))}
                              {productOptions.syrups.map((syrup) => (
                                <OptionCard
                                  key={`syrup-${syrup.ProductId}`}
                                  mode="order"
                                  option={syrup}
                                  quantity={line.syrups[syrup.ProductId] || 0}
                                  onIncrement={() => addOptionToLine(productId, 'syrups', syrup.ProductId)}
                                  onDecrement={() => removeOptionFromLine(productId, 'syrups', syrup.ProductId)}
                                />
                              ))}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="px-4 pt-3 border-t border-hairline bg-panel/60 shrink-0">
            {!existingOrderId && (
              <div className="mb-3">
                {!showNoteField ? (
                  <button
                    type="button"
                    onClick={() => setShowNoteField(true)}
                    className="font-mono text-[11px] uppercase tracking-wide text-slate hover:text-ember"
                  >
                    + Not Ekle
                  </button>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-mono text-[10px] uppercase tracking-wide text-slate">Sipariş Notu</label>
                      <button
                        type="button"
                        onClick={() => { setShowNoteField(false); setNote(''); }}
                        className="font-mono text-[10px] text-slate hover:text-ember"
                      >
                        Kaldır
                      </button>
                    </div>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      placeholder="ör. Az pişmiş, glutensiz vb."
                      className="w-full border border-hairline rounded-sm px-3 py-2 font-body text-sm text-paper
                                 focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
                    />
                  </div>
                )}
              </div>
            )}

            {localError && (
              <p className="text-ember text-xs font-medium border-l-2 border-ember pl-2 mb-3">{localError}</p>
            )}

            {existingOrder ? (
              <div className="mb-3 space-y-1">
                <div className="flex items-center justify-between font-mono text-xs text-slate">
                  <span>Mevcut Tutar</span>
                  <span>{money(existingOrder.TotalAmount)}</span>
                </div>
                <div className="flex items-center justify-between font-mono text-xs text-slate">
                  <span>Eklenecek</span>
                  <span>{money(total)}</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-hairline">
                  <span className="font-mono text-xs text-slate uppercase tracking-wide">Genel Toplam</span>
                  <span className="font-mono text-paper font-semibold text-base">
                    {money(Number(existingOrder.TotalAmount || 0) + total)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-baseline justify-between mb-3">
                <span className="font-mono text-xs text-slate uppercase tracking-wide">
                  Toplam{itemCount > 0 ? ` · ${itemCount} adet` : ''}
                </span>
                <span className="font-mono text-paper font-semibold text-xl tabular-nums">{money(total)}</span>
              </div>
            )}

            <button
              type="button"
              onClick={submitOrder}
              disabled={submitting || itemCount === 0}
              className="w-full font-mono text-sm uppercase tracking-wide text-cream bg-ember
                         hover:bg-ember/90 active:bg-ember/80 disabled:opacity-40 disabled:cursor-not-allowed
                         rounded-sm px-6 py-3.5 min-h-[3rem] transition-colors mb-4"
            >
              {submitting ? 'Gönderiliyor...' : existingOrderId ? 'Siparişe Ekle' : 'Sipariş Ver'}
            </button>
          </div>
        </div>
      </div>

      {selectedProductId != null && (() => {
        const selectedProduct = products.find((p) => p.ProductId === selectedProductId);
        if (!selectedProduct) return null;
        const existingLine = cart[selectedProductId] || null;
        return (
          <ProductDetailModal
            product={selectedProduct}
            initialLine={existingLine}
            options={optionsFor(selectedProductId)}
            optionsLoading={!optionsByProduct[selectedProductId]}
            onClose={() => setSelectedProductId(null)}
            onConfirm={({ quantity, extras, syrups }) => {
              setLineForProduct(selectedProductId, { quantity, extras, syrups });
              setSelectedProductId(null);
            }}
            onRemove={() => {
              removeLineFromCart(selectedProductId);
              setSelectedProductId(null);
            }}
          />
        );
      })()}
    </div>
  );
}

// ============================================================
// Taşı / Birleştir alt formu
// ============================================================
function TransferForm({ fromTableId, orderId, otherTables, onCancel, onDone, onError }) {
  const [toTableId, setToTableId] = useState('');
  const [transferType, setTransferType] = useState('Move');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setLocalError('');
    if (!toTableId) {
      setLocalError('Hedef masa seçmelisiniz.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await client.post(`/tables/${fromTableId}/transfer`, {
        OrderId: orderId,
        ToTableId: Number(toTableId),
        TransferType: transferType,
        Reason: reason || undefined,
      });
      onDone(res.data.message || 'İşlem tamamlandı.');
    } catch (err) {
      const msg = err.response?.data?.error || 'Taşıma/birleştirme işlemi başarısız oldu.';
      setLocalError(msg);
      onError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border border-hairline rounded-sm p-4 space-y-3 bg-hairline/30">
      <div>
        <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Hedef Masa</label>
        <select
          value={toTableId}
          onChange={(e) => setToTableId(e.target.value)}
          className="w-full border border-hairline rounded-sm px-3 py-2 font-body text-sm text-paper
                     focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
        >
          <option value="">Masa seçin</option>
          {otherTables.map((t) => (
            <option key={t.TableId} value={t.TableId}>
              Masa {t.TableNumber} ({STATUS_CONFIG[t.Status]?.label || t.Status})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">İşlem Türü</label>
        <div className="flex gap-4 font-mono text-xs text-paper">
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={transferType === 'Move'} onChange={() => setTransferType('Move')} />
            Taşı (hedef masa boş olmalı)
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={transferType === 'Merge'} onChange={() => setTransferType('Merge')} />
            Birleştir (hedefte aktif sipariş olmalı)
          </label>
        </div>
      </div>

      <div>
        <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Sebep (opsiyonel)</label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full border border-hairline rounded-sm px-3 py-2 font-body text-sm text-paper
                     focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
          placeholder="ör. Misafir talebi"
        />
      </div>

      {localError && (
        <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3">{localError}</p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="font-mono text-xs uppercase tracking-wide text-slate hover:text-paper
                     border border-hairline rounded-sm px-3 py-2 transition-colors"
        >
          Vazgeç
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="font-mono text-xs uppercase tracking-wide text-cream bg-ember
                     hover:bg-ember/90 disabled:opacity-50 rounded-sm px-4 py-2 transition-colors"
        >
          {submitting ? 'İşleniyor...' : 'Onayla'}
        </button>
      </div>
    </form>
  );
}

// ============================================================
// Masa oluşturma / düzenleme formu (Admin)
// ============================================================
function TableFormModal({ title, initial, initialArea = DEFAULT_AREA, areas = [], onClose, onSubmit }) {
  const [tableNumber, setTableNumber] = useState(initial?.TableNumber ?? '');
  const [capacity, setCapacity] = useState(initial?.Capacity ?? '');
  const [area, setArea] = useState(initialArea);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!tableNumber) {
      setError('Masa numarası zorunludur.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ TableNumber: Number(tableNumber), Capacity: capacity ? Number(capacity) : null, Area: area });
    } catch (err) {
      setError(err.response?.data?.error || 'İşlem başarısız oldu.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell onClose={onClose} title={title} eyebrow="Masa">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Masa Numarası</label>
          <input
            type="number"
            min="1"
            value={tableNumber}
            onChange={(e) => setTableNumber(e.target.value)}
            className="w-full border border-hairline rounded-sm px-3 py-2.5 font-body text-paper
                       focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
          />
        </div>
        <div>
          <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
            Kapasite <span className="normal-case text-slate/70">(opsiyonel)</span>
          </label>
          <input
            type="number"
            min="1"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            placeholder="ör. 4"
            className="w-full border border-hairline rounded-sm px-3 py-2.5 font-body text-paper
                       focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
          />
        </div>
        <div>
          <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Bölge (Alan)</label>
          <div className="flex flex-wrap gap-1.5">
            {areas.map((a) => (
              <button
                key={a.AreaId}
                type="button"
                onClick={() => setArea(a.Name)}
                className={`font-mono text-xs uppercase tracking-wide px-3 py-2 rounded-sm border transition-colors ${
                  area === a.Name ? 'border-ember bg-ember/10 text-ember font-semibold' : 'border-hairline text-slate hover:text-paper'
                }`}
              >
                {areaLabelOf(a.Name)}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3">{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
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
    </ModalShell>
  );
}

// ============================================================
// Masa Bölümleri Yönetimi (Salon/Teras/Bahçe/VIP/Bar vb.) — Admin.
// Ekleme, yeniden adlandırma (masalardaki Area değeri de otomatik
// taşınır, bkz. backend: controllers/tableAreaController.js) ve
// sıralama (↑/↓ ile DisplayOrder değişimi) ve silme (soft-delete).
// ============================================================
// İçerik artık paylaşılan components/TableAreasManager.jsx'te (Settings.jsx
// "Masa Alanları" sekmesiyle aynı bileşeni kullanır) — burada sadece
// masalar sayfasının kendi ModalShell'i içine yerleştiriliyor.
function AreaManagerDrawer({ areas, onClose, onChanged }) {
  return (
    <ModalShell onClose={onClose} title="Masa Bölümleri" eyebrow="Masalar">
      <TableAreasManager areas={areas} onChanged={onChanged} />
    </ModalShell>
  );
}

// ============================================================
// Rezervasyon oluşturma formu — masa kartındaki "Rezerve Et" butonu için.
// ============================================================
function ReservationFormModal({ table, onClose, onSubmit }) {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [partySize, setPartySize] = useState('');
  const [reservationTime, setReservationTime] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!customerName.trim()) { setError('Müşteri adı zorunludur.'); return; }
    if (!partySize || Number(partySize) <= 0) { setError('Kişi sayısı geçerli bir sayı olmalıdır.'); return; }
    if (!reservationTime) { setError('Rezervasyon zamanı zorunludur.'); return; }

    setSubmitting(true);
    try {
      await onSubmit({
        CustomerName: customerName.trim(),
        CustomerPhone: customerPhone.trim() || undefined,
        PartySize: Number(partySize),
        ReservationTime: new Date(reservationTime).toISOString(),
        Note: note.trim() || undefined,
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Rezervasyon oluşturulamadı.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell onClose={onClose} title={`Masa ${table.TableNumber} — Rezervasyon`} eyebrow="Rezervasyon">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Müşteri Adı</label>
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="w-full border border-hairline rounded-sm px-3 py-2.5 font-body text-paper
                       focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
          />
        </div>
        <div>
          <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
            Telefon <span className="normal-case text-slate/70">(opsiyonel)</span>
          </label>
          <input
            type="text"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            className="w-full border border-hairline rounded-sm px-3 py-2.5 font-body text-paper
                       focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Kişi Sayısı</label>
            <input
              type="number"
              min="1"
              value={partySize}
              onChange={(e) => setPartySize(e.target.value)}
              className="w-full border border-hairline rounded-sm px-3 py-2.5 font-body text-paper
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>
          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Tarih / Saat</label>
            <input
              type="datetime-local"
              value={reservationTime}
              onChange={(e) => setReservationTime(e.target.value)}
              className="w-full border border-hairline rounded-sm px-3 py-2.5 font-body text-paper
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>
        </div>
        <div>
          <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
            Not <span className="normal-case text-slate/70">(opsiyonel)</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full border border-hairline rounded-sm px-3 py-2.5 font-body text-sm text-paper
                       focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
          />
        </div>

        {error && (
          <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3">{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
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
            {submitting ? 'Kaydediliyor...' : 'Rezerve Et'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ============================================================
// Hızlı ödeme — masa kartındaki 💳 butonu için.
// ============================================================
function QuickPaymentModal({ tableId, productName, onClose, onFullyPaid }) {
  const { user } = useAuth();
  const canTakePayment = ['Cashier', 'Admin'].includes(user?.role);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    client
      .get(`/tables/${tableId}`)
      .then((res) => { if (active) setDetail(res.data); })
      .catch((err) => { if (active) setError(err.response?.data?.error || 'Sipariş getirilemedi.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tableId]);

  if (loading) return null;

  if (!canTakePayment) {
    return (
      <div className="fixed inset-0 bg-ink/40 flex items-center justify-center px-4 z-50" onClick={onClose}>
        <div className="bg-panel rounded-sm border border-hairline w-full max-w-sm p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
          <p className="text-slate text-sm font-medium mb-4">Ödeme almak için kasiyer veya yöneticiye başvurun.</p>
          <button
            onClick={onClose}
            className="font-mono text-xs uppercase tracking-wide text-slate hover:text-paper border border-hairline rounded-sm px-4 py-2"
          >
            Kapat
          </button>
        </div>
      </div>
    );
  }

  if (error || !detail?.activeOrder) {
    return (
      <div className="fixed inset-0 bg-ink/40 flex items-center justify-center px-4 z-50" onClick={onClose}>
        <div className="bg-panel rounded-sm border border-hairline w-full max-w-sm p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
          <p className="text-ember text-sm font-medium mb-4">
            {error || 'Bu masada ödeme alınacak aktif bir sipariş yok.'}
          </p>
          <button
            onClick={onClose}
            className="font-mono text-xs uppercase tracking-wide text-slate hover:text-paper border border-hairline rounded-sm px-4 py-2"
          >
            Kapat
          </button>
        </div>
      </div>
    );
  }

  return (
    <PaymentDrawer
      order={detail.activeOrder}
      resolveProductName={productName}
      tableLabel={`Masa ${detail.TableNumber}`}
      autoOpen
      hideTrigger
      onClose={onClose}
      onPaid={async (fullyPaid) => {
        if (fullyPaid) onFullyPaid?.();
      }}
    />
  );
}

// ============================================================
// Salt-okunur fatura görünümü — masa kartındaki 🧾 butonu için.
// ============================================================
function BillModal({ tableId, productName, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    client
      .get(`/tables/${tableId}`)
      .then((res) => { if (active) setDetail(res.data); })
      .catch((err) => { if (active) setError(err.response?.data?.error || 'Fatura getirilemedi.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tableId]);

  const order = detail?.activeOrder;

  return (
    <ModalShell onClose={onClose} title={detail ? `Masa ${detail.TableNumber} — Fatura` : 'Fatura'} eyebrow="Fatura">
      {loading ? (
        <p className="text-slate font-mono text-sm">Yükleniyor...</p>
      ) : error ? (
        <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3">{error}</p>
      ) : !order ? (
        <p className="text-slate font-mono text-sm">Bu masada aktif bir sipariş yok.</p>
      ) : (
        <>
          <div className="border border-hairline rounded-sm overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-hairline/60 border-b border-hairline text-left font-mono text-[10px] uppercase tracking-wide text-slate">
                  <th className="px-3 py-2">Ürün</th>
                  <th className="px-3 py-2 text-center">Adet</th>
                  <th className="px-3 py-2 text-right">B. Fiyat</th>
                  <th className="px-3 py-2 text-right">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {(order.items || []).map((item, i) => (
                  <tr key={i} className="border-b border-hairline last:border-b-0">
                    <td className="px-3 py-2 text-paper">
                      {productName(item.ProductId)}
                      {((item.Extras?.length > 0) || (item.Syrups?.length > 0)) && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(item.Extras || []).map((extra) => (
                            <span
                              key={`extra-${extra.ExtraProductId}`}
                              className="font-mono text-[10px] text-slate border border-hairline rounded-full px-1.5 py-0.5"
                            >
                              {extra.Quantity}x {extra.ExtraName}
                            </span>
                          ))}
                          {(item.Syrups || []).map((syrup) => (
                            <span
                              key={`syrup-${syrup.SyrupProductId}`}
                              className="font-mono text-[10px] text-slate border border-hairline rounded-full px-1.5 py-0.5"
                            >
                              {syrup.Quantity}x {syrup.SyrupName}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-xs text-paper">{item.Quantity}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-slate">{money(item.UnitPrice)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-paper font-medium">
                      {money(item.Quantity * item.UnitPrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between items-center font-mono text-sm">
            <span className="text-slate uppercase tracking-wide text-xs">Toplam</span>
            <span className="text-paper font-semibold text-base">{money(order.TotalAmount)}</span>
          </div>
        </>
      )}
    </ModalShell>
  );
}

// ============================================================
// Ortak modal kabuğu
// ============================================================
// size='full' → ekranın tamamını kaplar (masa/menü ekranı için: ürün seçerken
// azami alan). Bu modda başlık çubuğu yapışkandır, içerik kayarken "Kapat"
// düğmesi her zaman erişilebilir kalır.
function ModalShell({ title, eyebrow, meta, actions, onClose, children, size = 'md' }) {
  const full = size === 'full';
  const widthClass = full
    ? 'max-w-none'
    : size === 'xl' ? 'max-w-[90vw]' : size === 'lg' ? 'max-w-3xl' : 'max-w-lg';
  const heightClass = full
    ? 'h-full'
    : size === 'xl' ? 'max-h-[92vh]' : 'max-h-[88vh]';
  return (
    <div
      className={`fixed inset-0 bg-ink/40 flex items-center justify-center z-50 ${full ? '' : 'px-4'}`}
      onClick={onClose}
    >
      <div
        className={`bg-panel border border-hairline w-full overflow-auto overscroll-contain shadow-lg
                    ${full ? 'rounded-none border-0' : 'rounded-sm'} ${widthClass} ${heightClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`px-6 py-4 border-b border-hairline flex items-center justify-between gap-4
                      ${full ? 'sticky top-0 z-10 bg-panel' : ''}`}
        >
          <div className="flex items-center gap-4 flex-wrap min-w-0">
            <div className="shrink-0">
              {eyebrow && <p className="font-mono text-xs tracking-[0.2em] text-ember uppercase mb-1">{eyebrow}</p>}
              <h2 className="font-display text-xl font-semibold text-paper leading-tight">{title}</h2>
            </div>
            {meta}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {actions}
            <button
              onClick={onClose}
              title="Kapat"
              className="w-11 h-11 flex flex-col items-center justify-center rounded-sm border border-hairline
                         text-slate hover:border-ember hover:text-ember transition-colors"
            >
              <span className="text-base leading-none">✕</span>
              <span className="text-[8px] uppercase tracking-wide mt-0.5">Kapat</span>
            </button>
          </div>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
