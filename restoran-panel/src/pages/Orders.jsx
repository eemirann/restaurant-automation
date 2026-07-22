import { useEffect, useState, useCallback } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import PaymentDrawer from '../components/PaymentDrawer';

const STATUS_CONFIG = {
  Pending: { label: 'Bekliyor', dot: 'bg-amber-500', border: 'border-amber-300', bg: 'bg-amber-50' },
  Served: { label: 'Servis Edildi', dot: 'bg-moss', border: 'border-moss/40', bg: 'bg-moss/5' },
  Paid: { label: 'Ödendi', dot: 'bg-emerald-600', border: 'border-emerald-300', bg: 'bg-emerald-50' },
  Cancelled: { label: 'İptal Edildi', dot: 'bg-slate', border: 'border-slate/30', bg: 'bg-slate/5' },
  Merged: { label: 'Birleştirildi', dot: 'bg-ink/50', border: 'border-ink/20', bg: 'bg-ink/5' },
};

const FILTERS = [
  { value: '', label: 'Tümü' },
  { value: 'Paid', label: 'Ödendi' },
  { value: 'Cancelled', label: 'İptal Edildi' },
  { value: 'Merged', label: 'Birleştirildi' },
];

const money = (n) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(n) || 0);

const dateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

export default function Orders() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

  const [products, setProducts] = useState([]);
  const [tables, setTables] = useState([]);

  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [orderDetail, setOrderDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [rowActionError, setRowActionError] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);

  // ---- Siparişleri getir ----
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/orders', {
        params: filter ? { status: filter } : {},
      });
      setOrders(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Siparişler getirilemedi.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Ürün ve masa listelerini bir kere çekip önbelleğe al (detayda ürün adı göstermek ve
  // yeni sipariş formunda seçenek sunmak için kullanılıyor)
  useEffect(() => {
    client.get('/products').then((res) => setProducts(res.data)).catch(() => {});
    client.get('/tables').then((res) => setTables(res.data)).catch(() => {});
  }, []);

  const productName = (productId) =>
    products.find((p) => p.ProductId === productId)?.Name || `Ürün #${productId}`;

  const tableNumber = (tableId) =>
    tables.find((t) => t.TableId === tableId)?.TableNumber ?? tableId;

  // ---- Detay aç ----
  const openDetail = async (orderId) => {
    setSelectedOrderId(orderId);
    setOrderDetail(null);
    setDetailError('');
    setDetailLoading(true);
    try {
      const res = await client.get(`/orders/${orderId}`);
      setOrderDetail(res.data);
    } catch (err) {
      setDetailError(err.response?.data?.error || 'Sipariş detayı getirilemedi.');
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelectedOrderId(null);
    setOrderDetail(null);
    setDetailError('');
  };

  // ---- İptal et (sadece Admin) ----
  const cancelOrder = async (orderId) => {
    setRowActionError('');
    try {
      await client.patch(`/orders/${orderId}/cancel`);
      await fetchOrders();
      if (selectedOrderId === orderId) await openDetail(orderId);
    } catch (err) {
      setRowActionError(err.response?.data?.error || 'Sipariş iptal edilemedi.');
    }
  };

  const counts = orders.reduce((acc, o) => {
    acc[o.Status] = (acc[o.Status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-10">
      {/* Başlık */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="font-mono text-xs tracking-[0.3em] text-ember uppercase mb-2">
            Mutfak · Servis
          </p>
          <h1 className="font-display text-3xl font-semibold text-ink">Siparişler</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchOrders}
            className="font-mono text-xs uppercase tracking-wide text-slate hover:text-ember
                       border border-sand rounded-sm px-3 py-2 transition-colors"
          >
            ↻ Yenile
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="font-mono text-xs uppercase tracking-wide text-cream bg-ember
                       hover:bg-ember/90 rounded-sm px-4 py-2 transition-colors"
          >
            + Yeni Sipariş
          </button>
        </div>
      </div>

      {/* Durum özeti */}
      <div className="flex flex-wrap gap-6 mb-6 font-mono text-xs text-slate">
        <span><span className="text-ink font-semibold">{orders.length}</span> toplam</span>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full inline-block ${cfg.dot}`} />
            {counts[key] || 0} {cfg.label.toLowerCase()}
          </span>
        ))}
      </div>

      {/* Filtre sekmeleri */}
      <div className="flex gap-1 mb-6 border-b border-sand overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`font-mono text-xs uppercase tracking-wide px-4 py-2.5 border-b-2 transition-colors whitespace-nowrap ${
              filter === f.value
                ? 'border-ember text-ink font-semibold'
                : 'border-transparent text-slate hover:text-ink'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {(error || rowActionError) && (
        <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 mb-6">
          {error || rowActionError}
        </p>
      )}

      {loading ? (
        <p className="text-slate font-mono text-sm">Yükleniyor...</p>
      ) : orders.length === 0 ? (
        <div className="border border-dashed border-sand rounded-sm p-10 text-center bg-white/50">
          <p className="text-slate font-mono text-sm">Gösterilecek sipariş bulunamadı.</p>
        </div>
      ) : (
        <div className="border border-sand rounded-sm overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-cream/60 border-b border-sand text-left font-mono text-[10px] uppercase tracking-widest text-slate">
                <th className="px-5 py-3">Sipariş</th>
                <th className="px-5 py-3">Masa</th>
                <th className="px-5 py-3">Durum</th>
                <th className="px-5 py-3">Tutar</th>
                <th className="px-5 py-3">Oluşturuldu</th>
                <th className="px-5 py-3 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const cfg = STATUS_CONFIG[o.Status] || STATUS_CONFIG.Pending;
                const canCancel = isAdmin && !['Paid', 'Cancelled', 'Merged'].includes(o.Status);
                return (
                  <tr key={o.OrderId} className="border-b border-sand last:border-b-0 hover:bg-cream/30">
                    <td className="px-5 py-3 font-mono text-ink">#{o.OrderId}</td>
                    <td className="px-5 py-3 text-ink">Masa {tableNumber(o.TableId)}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1.5 border rounded-sm px-2 py-1 text-xs font-mono uppercase tracking-wide ${cfg.border} ${cfg.bg}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-ink">{money(o.TotalAmount)}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate">{dateTime(o.CreatedAt)}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2 flex-wrap">
                        <button
                          onClick={() => openDetail(o.OrderId)}
                          className="font-mono text-[11px] uppercase tracking-wide text-slate hover:text-ember border border-sand rounded-sm px-2.5 py-1.5 transition-colors"
                        >
                          Detay
                        </button>
                        {canCancel && (
                          <button
                            onClick={() => cancelOrder(o.OrderId)}
                            className="font-mono text-[11px] uppercase tracking-wide text-ember hover:text-ember/80 border border-ember/40 rounded-sm px-2.5 py-1.5 transition-colors"
                          >
                            İptal Et
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detay paneli */}
      {selectedOrderId && (
        <OrderDetailModal
          orderId={selectedOrderId}
          detail={orderDetail}
          loading={detailLoading}
          error={detailError}
          onClose={closeDetail}
          productName={productName}
          tableNumber={tableNumber}
          statusConfig={STATUS_CONFIG}
          money={money}
          dateTime={dateTime}
          onPaid={async () => {
            await fetchOrders();
            await openDetail(selectedOrderId);
          }}
        />
      )}

      {/* Yeni sipariş oluşturma */}
      {showCreateModal && (
        <CreateOrderModal
          tables={tables}
          products={products}
          userId={user?.userId}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            fetchOrders();
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Sipariş detay paneli
// ============================================================
function OrderDetailModal({ orderId, detail, loading, error, onClose, productName, tableNumber, statusConfig, money, dateTime, onPaid }) {
  return (
    <div className="fixed inset-0 bg-ink/40 flex items-center justify-center px-4 z-50" onClick={onClose}>
      <div
        className="bg-white rounded-sm border border-sand w-full max-w-lg max-h-[85vh] overflow-auto shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-sand flex items-start justify-between">
          <div>
            <p className="font-mono text-xs tracking-[0.2em] text-ember uppercase mb-1">Sipariş Detayı</p>
            <h2 className="font-display text-xl font-semibold text-ink">#{orderId}</h2>
          </div>
          <button onClick={onClose} className="font-mono text-xs text-slate hover:text-ink">
            Kapat ✕
          </button>
        </div>

        <div className="px-6 py-5">
          {loading && <p className="text-slate font-mono text-sm">Yükleniyor...</p>}
          {error && (
            <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3">{error}</p>
          )}

          {detail && !loading && (
            <>
              <div className="flex flex-wrap gap-x-8 gap-y-2 mb-5 font-mono text-xs text-slate">
                <span>Masa <span className="text-ink font-semibold">{tableNumber(detail.TableId)}</span></span>
                <span>
                  Durum{' '}
                  <span className="text-ink font-semibold">
                    {statusConfig[detail.Status]?.label || detail.Status}
                  </span>
                </span>
                <span>Oluşturuldu <span className="text-ink font-semibold">{dateTime(detail.CreatedAt)}</span></span>
              </div>

              {detail.Note && (
                <p className="text-sm text-ink mb-5 border-l-2 border-sand pl-3">{detail.Note}</p>
              )}

              <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-2">Ürünler</p>
              <div className="border border-sand rounded-sm divide-y divide-sand mb-5">
                {(detail.items || []).map((item, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div>
                      <p className="text-ink">{productName(item.ProductId)}</p>
                      {item.Note && <p className="text-xs text-slate mt-0.5">{item.Note}</p>}
                    </div>
                    <div className="text-right font-mono text-xs text-slate">
                      <span className="text-ink">{item.Quantity}×</span> {money(item.UnitPrice)}
                    </div>
                  </div>
                ))}
                {(!detail.items || detail.items.length === 0) && (
                  <p className="px-4 py-3 text-sm text-slate">Bu siparişte ürün bulunamadı.</p>
                )}
              </div>

              <div className="flex justify-between items-center font-mono text-sm">
                <span className="text-slate uppercase tracking-wide text-xs">Toplam</span>
                <span className="text-ink font-semibold text-base">{money(detail.TotalAmount)}</span>
              </div>

              {!['Paid', 'Cancelled', 'Merged'].includes(detail.Status) && (
                <div className="mt-5 pt-5 border-t border-sand">
                  <PaymentDrawer
                    order={detail}
                    resolveProductName={productName}
                    tableLabel={`Masa ${tableNumber(detail.TableId)}`}
                    onPaid={onPaid}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Yeni sipariş oluşturma formu
// ============================================================
function CreateOrderModal({ tables, products, userId, onClose, onCreated }) {
  const [tableId, setTableId] = useState('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState([{ ProductId: '', Quantity: 1, Note: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const addItem = () => setItems((prev) => [...prev, { ProductId: '', Quantity: 1, Note: '' }]);
  const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const updateItem = (idx, field, value) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!tableId) {
      setFormError('Bir masa seçmelisiniz.');
      return;
    }
    if (!userId) {
      setFormError('Kullanıcı bilgisi bulunamadı, tekrar giriş yapın.');
      return;
    }

    const cleanItems = items
      .filter((it) => it.ProductId)
      .map((it) => ({
        ProductId: Number(it.ProductId),
        Quantity: Number(it.Quantity) || 1,
        Note: it.Note || undefined,
      }));

    if (cleanItems.length === 0) {
      setFormError('En az bir ürün eklemelisiniz.');
      return;
    }

    setSubmitting(true);
    try {
      await client.post('/orders', {
        TableId: Number(tableId),
        UserId: userId,
        Items: cleanItems,
        Note: note || undefined,
      });
      onCreated();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Sipariş oluşturulamadı.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-ink/40 flex items-center justify-center px-4 z-50" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-sm border border-sand w-full max-w-lg max-h-[85vh] overflow-auto shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-sand flex items-start justify-between">
          <div>
            <p className="font-mono text-xs tracking-[0.2em] text-ember uppercase mb-1">Yeni</p>
            <h2 className="font-display text-xl font-semibold text-ink">Sipariş Oluştur</h2>
          </div>
          <button type="button" onClick={onClose} className="font-mono text-xs text-slate hover:text-ink">
            Kapat ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Masa</label>
            <select
              value={tableId}
              onChange={(e) => setTableId(e.target.value)}
              className="w-full border border-sand rounded-sm px-3 py-2.5 font-body text-ink
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
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-mono text-xs uppercase tracking-wide text-slate">Ürünler</label>
              <button
                type="button"
                onClick={addItem}
                className="font-mono text-[11px] uppercase tracking-wide text-ember hover:text-ember/80"
              >
                + Ürün Ekle
              </button>
            </div>

            <div className="space-y-2.5">
              {items.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <select
                    value={item.ProductId}
                    onChange={(e) => updateItem(idx, 'ProductId', e.target.value)}
                    className="flex-1 border border-sand rounded-sm px-3 py-2 font-body text-sm text-ink
                               focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
                  >
                    <option value="">Ürün seçin</option>
                    {products.filter((p) => p.IsActive !== false).map((p) => (
                      <option key={p.ProductId} value={p.ProductId}>
                        {p.Name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    value={item.Quantity}
                    onChange={(e) => updateItem(idx, 'Quantity', e.target.value)}
                    className="w-20 border border-sand rounded-sm px-2 py-2 font-mono text-sm text-ink text-center
                               focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
                  />
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="font-mono text-xs text-slate hover:text-ember px-1"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Not (opsiyonel)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full border border-sand rounded-sm px-3 py-2.5 font-body text-sm text-ink
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
              placeholder="ör. Az pişmiş, glutensiz vb."
            />
          </div>

          {formError && (
            <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3">{formError}</p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-sand flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-xs uppercase tracking-wide text-slate hover:text-ink
                       border border-sand rounded-sm px-4 py-2.5 transition-colors"
          >
            Vazgeç
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="font-mono text-xs uppercase tracking-wide text-cream bg-ember
                       hover:bg-ember/90 disabled:opacity-50 rounded-sm px-4 py-2.5 transition-colors"
          >
            {submitting ? 'Oluşturuluyor...' : 'Siparişi Oluştur'}
          </button>
        </div>
      </form>
    </div>
  );
}
