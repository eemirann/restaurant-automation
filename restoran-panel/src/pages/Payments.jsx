import { useEffect, useState, useCallback } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import PaymentDrawer from '../components/PaymentDrawer';

// Sipariş durumu (DB/API kontratı) -> Türkçe etiket + renk
const STATUS_CONFIG = {
  Pending: { label: 'Bekliyor', dot: 'bg-amber-500', border: 'border-amber-300', bg: 'bg-amber-50' },
  Served: { label: 'Servis Edildi', dot: 'bg-moss', border: 'border-moss/40', bg: 'bg-moss/5' },
  Paid: { label: 'Ödendi', dot: 'bg-emerald-600', border: 'border-emerald-300', bg: 'bg-emerald-50' },
  Cancelled: { label: 'İptal Edildi', dot: 'bg-slate', border: 'border-slate/30', bg: 'bg-slate/5' },
  Merged: { label: 'Birleştirildi', dot: 'bg-ink/50', border: 'border-ink/20', bg: 'bg-ink/5' },
};

// Ödeme yöntemi (DB/API kontratı) -> Türkçe etiket
const PAYMENT_METHOD_LABELS = {
  Cash: 'Nakit',
  Card: 'Kredi Kartı',
  FoodCard: 'Yemek Kartı',
  QR: 'QR',
};

const FILTERS = [
  { value: '', label: 'Tümü' },
  { value: 'Pending', label: 'Bekliyor' },
  { value: 'Served', label: 'Servis Edildi' },
  { value: 'Paid', label: 'Ödendi' },
];

const money = (n) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(n) || 0);

const dateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

export default function Payments() {
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');

  const [selectedOrderId, setSelectedOrderId] = useState(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/orders', { params: filter ? { status: filter } : {} });
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

  useEffect(() => {
    client.get('/products').then((res) => setProducts(res.data)).catch(() => {});
    client.get('/tables').then((res) => setTables(res.data)).catch(() => {});
  }, []);

  const productName = (productId) =>
    products.find((p) => p.ProductId === productId)?.Name || `Ürün #${productId}`;

  const tableNumber = (tableId) =>
    tables.find((t) => t.TableId === tableId)?.TableNumber ?? tableId;

  const visibleOrders = orders.filter((o) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      String(o.OrderId).includes(q) ||
      String(tableNumber(o.TableId)).toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-10">
      {/* Başlık */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="font-mono text-xs tracking-[0.3em] text-ember uppercase mb-2">
            Kasa · Tahsilat
          </p>
          <h1 className="font-display text-3xl font-semibold text-ink">Ödemeler</h1>
        </div>
        <button
          onClick={fetchOrders}
          className="font-mono text-xs uppercase tracking-wide text-slate hover:text-ember
                     border border-sand rounded-sm px-3 py-2 transition-colors"
        >
          ↻ Yenile
        </button>
      </div>

      {/* Arama + filtre */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Sipariş no veya masa ara..."
          className="border border-sand rounded-sm px-3 py-2 font-body text-sm text-ink w-64
                     focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
        />
      </div>

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

      {error && (
        <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 mb-6">{error}</p>
      )}

      {loading ? (
        <p className="text-slate font-mono text-sm">Yükleniyor...</p>
      ) : visibleOrders.length === 0 ? (
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
              {visibleOrders.map((o) => {
                const cfg = STATUS_CONFIG[o.Status] || STATUS_CONFIG.Pending;
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
                      <div className="flex justify-end">
                        <button
                          onClick={() => setSelectedOrderId(o.OrderId)}
                          className="font-mono text-[11px] uppercase tracking-wide text-slate hover:text-ember border border-sand rounded-sm px-2.5 py-1.5 transition-colors"
                        >
                          Ödeme Detayı
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedOrderId && (
        <PaymentDetailModal
          orderId={selectedOrderId}
          productName={productName}
          tableNumber={tableNumber}
          statusConfig={STATUS_CONFIG}
          onClose={() => setSelectedOrderId(null)}
          onChanged={fetchOrders}
        />
      )}
    </div>
  );
}

// ============================================================
// Sipariş ödeme detayı — bakiye + ödeme geçmişi + (Admin) iade/iptal
// ============================================================
function PaymentDetailModal({ orderId, productName, tableNumber, statusConfig, onClose, onChanged }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';

  const [detail, setDetail] = useState(null);
  const [payments, setPayments] = useState([]);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  // İade satırı için geçici durum
  const [refundingId, setRefundingId] = useState(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundBusy, setRefundBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [detailRes, paymentsRes, balanceRes] = await Promise.all([
        client.get(`/orders/${orderId}`),
        client.get(`/payments/order/${orderId}`),
        client.get(`/payments/order/${orderId}/balance`),
      ]);
      setDetail(detailRes.data);
      setPayments(paymentsRes.data);
      setBalance(balanceRes.data);
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Ödeme detayı getirilemedi.');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    await load();
    await onChanged?.();
  };

  const voidPayment = async (paymentId) => {
    if (!window.confirm('Bu ödemeyi iptal etmek istediğinize emin misiniz?')) return;
    setActionError('');
    try {
      await client.delete(`/payments/${paymentId}`);
      await refresh();
    } catch (err) {
      setActionError(err.response?.data?.message || 'Ödeme iptal edilemedi.');
    }
  };

  const startRefund = (p) => {
    setActionError('');
    setRefundingId(p.Id);
    const max = Number(p.Amount) - Number(p.RefundAmount || 0);
    setRefundAmount(max > 0 ? String(max) : '');
  };

  const submitRefund = async (p) => {
    setActionError('');
    const amount = Number(refundAmount);
    const max = Number(p.Amount) - Number(p.RefundAmount || 0);
    if (!amount || amount <= 0) {
      setActionError('Geçerli bir iade tutarı girin.');
      return;
    }
    if (amount > max) {
      setActionError(`İade tutarı en fazla ${money(max)} olabilir.`);
      return;
    }
    setRefundBusy(true);
    try {
      await client.post(`/payments/${p.Id}/refund`, { RefundAmount: amount });
      setRefundingId(null);
      setRefundAmount('');
      await refresh();
    } catch (err) {
      setActionError(err.response?.data?.message || 'İade işlenemedi.');
    } finally {
      setRefundBusy(false);
    }
  };

  const cfg = detail ? statusConfig[detail.Status] : null;

  return (
    <div className="fixed inset-0 bg-ink/40 flex items-center justify-center px-4 z-50" onClick={onClose}>
      <div
        className="bg-white rounded-sm border border-sand w-full max-w-2xl max-h-[88vh] overflow-auto shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-sand flex items-start justify-between">
          <div>
            <p className="font-mono text-xs tracking-[0.2em] text-ember uppercase mb-1">Ödeme Detayı</p>
            <h2 className="font-display text-xl font-semibold text-ink">Sipariş #{orderId}</h2>
            {detail && (
              <p className="font-mono text-xs text-slate mt-0.5">
                Masa {tableNumber(detail.TableId)} ·{' '}
                <span className="text-ink">{cfg?.label || detail.Status}</span>
              </p>
            )}
          </div>
          <button onClick={onClose} className="font-mono text-xs text-slate hover:text-ink">
            Kapat ✕
          </button>
        </div>

        <div className="px-6 py-5">
          {loading ? (
            <p className="text-slate font-mono text-sm">Yükleniyor...</p>
          ) : error ? (
            <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3">{error}</p>
          ) : (
            <>
              {/* Bakiye özeti */}
              <div className="border border-sand rounded-sm p-4 mb-6 space-y-1.5 bg-cream/20">
                <div className="flex justify-between font-mono text-xs text-slate">
                  <span>Sipariş Toplamı</span>
                  <span>{money(balance?.totalAmount)}</span>
                </div>
                {balance?.totalDiscount > 0 && (
                  <div className="flex justify-between font-mono text-xs text-slate">
                    <span>Uygulanan İndirim</span>
                    <span>− {money(balance.totalDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-mono text-xs text-slate">
                  <span>Ödenen</span>
                  <span>{money(balance?.totalPaid)}</span>
                </div>
                {balance?.totalTip > 0 && (
                  <div className="flex justify-between font-mono text-xs text-slate">
                    <span>Bahşiş</span>
                    <span>{money(balance.totalTip)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 mt-1 border-t border-sand">
                  <span className="font-mono text-xs uppercase tracking-wide text-slate">Kalan Bakiye</span>
                  <span className={`font-mono text-lg font-semibold ${balance?.remaining > 0 ? 'text-ember' : 'text-moss'}`}>
                    {money(balance?.remaining)}
                  </span>
                </div>
              </div>

              {/* Ödeme geçmişi */}
              <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-2">Ödeme Geçmişi</p>
              {payments.length === 0 ? (
                <div className="border border-dashed border-sand rounded-sm p-6 text-center bg-white/50 mb-6">
                  <p className="text-slate font-mono text-sm">Bu sipariş için henüz ödeme alınmamış.</p>
                </div>
              ) : (
                <div className="border border-sand rounded-sm overflow-hidden mb-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-cream/60 border-b border-sand text-left font-mono text-[10px] uppercase tracking-wide text-slate">
                        <th className="px-3 py-2">Yöntem</th>
                        <th className="px-3 py-2 text-right">Tutar</th>
                        <th className="px-3 py-2 text-right">Bahşiş</th>
                        <th className="px-3 py-2 text-right">İndirim</th>
                        <th className="px-3 py-2">Tarih</th>
                        {isAdmin && <th className="px-3 py-2 text-right">İşlem</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => {
                        const refunded = Number(p.RefundAmount || 0) > 0;
                        const fullyRefunded = refunded && Number(p.RefundAmount) >= Number(p.Amount);
                        const canRefund = isAdmin && !fullyRefunded;
                        return (
                          <tr key={p.Id} className="border-b border-sand last:border-b-0 align-top">
                            <td className="px-3 py-2.5 text-ink">
                              {PAYMENT_METHOD_LABELS[p.PaymentMethod] || p.PaymentMethod}
                              {p.InvoiceNumber && (
                                <span className="block font-mono text-[10px] text-slate mt-0.5">Fiş: {p.InvoiceNumber}</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-xs text-ink">
                              {money(p.Amount)}
                              {refunded && (
                                <span className="block text-ember mt-0.5">
                                  İade: −{money(p.RefundAmount)}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-xs text-slate">
                              {Number(p.TipAmount || 0) > 0 ? money(p.TipAmount) : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-xs text-slate">
                              {Number(p.DiscountAmount || 0) > 0 ? money(p.DiscountAmount) : '—'}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-[11px] text-slate">{dateTime(p.PaymentDate)}</td>
                            {isAdmin && (
                              <td className="px-3 py-2.5">
                                {refundingId === p.Id ? (
                                  <div className="flex flex-col items-end gap-1.5">
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={refundAmount}
                                      onChange={(e) => setRefundAmount(e.target.value)}
                                      className="w-24 border border-sand rounded-sm px-2 py-1 font-mono text-xs text-ink text-right
                                                 focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
                                    />
                                    <div className="flex gap-1.5">
                                      <button
                                        onClick={() => setRefundingId(null)}
                                        className="font-mono text-[10px] uppercase tracking-wide text-slate hover:text-ink border border-sand rounded-sm px-2 py-1"
                                      >
                                        Vazgeç
                                      </button>
                                      <button
                                        onClick={() => submitRefund(p)}
                                        disabled={refundBusy}
                                        className="font-mono text-[10px] uppercase tracking-wide text-cream bg-ember hover:bg-ember/90 disabled:opacity-50 rounded-sm px-2 py-1"
                                      >
                                        {refundBusy ? '...' : 'Onayla'}
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex justify-end gap-1.5 flex-wrap">
                                    {canRefund && (
                                      <button
                                        onClick={() => startRefund(p)}
                                        className="font-mono text-[10px] uppercase tracking-wide text-slate hover:text-ember border border-sand rounded-sm px-2 py-1 transition-colors"
                                      >
                                        İade
                                      </button>
                                    )}
                                    <button
                                      onClick={() => voidPayment(p.Id)}
                                      className="font-mono text-[10px] uppercase tracking-wide text-ember hover:text-ember/80 border border-ember/40 rounded-sm px-2 py-1 transition-colors"
                                    >
                                      İptal
                                    </button>
                                  </div>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {actionError && (
                <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 mb-4">{actionError}</p>
              )}

              {/* Kalan bakiye varsa yeni ödeme al (mevcut PaymentDrawer bileşeni) */}
              {detail && !['Paid', 'Cancelled', 'Merged'].includes(detail.Status) && balance?.remaining > 0 && (
                <div className="pt-2">
                  <PaymentDrawer
                    order={detail}
                    resolveProductName={productName}
                    tableLabel={`Masa ${tableNumber(detail.TableId)}`}
                    onPaid={refresh}
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
