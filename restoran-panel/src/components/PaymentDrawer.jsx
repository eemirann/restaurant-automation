import { useState, useCallback, useEffect } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

const money = (n) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(n) || 0);

const PAYMENT_METHODS = [
  { value: 'Cash', label: 'Nakit' },
  { value: 'Card', label: 'Kredi Kartı' },
  { value: 'FoodCard', label: 'Yemek Kartı' },
  { value: 'QR', label: 'QR' },
];

// ============================================================
// PaymentDrawer — POS tarzı ödeme paneli.
// Sepetin altında sadece "Ödeme Al" butonu gösterir; tıklanınca
// sağdan kayan bir çekmece açılır. Orders.jsx ve Tables.jsx'te
// ortak kullanılır. Mevcut backend API'sine (/payments,
// /payments/order/:id/balance) hiç dokunmadan entegre olur.
//
// Props:
//  - order: { OrderId, TotalAmount, Status, items: [{ProductId, Quantity, UnitPrice, Note}] }
//  - resolveProductName: (productId) => string
//  - tableLabel?: string  (ör. "Masa 4")
//  - onPaid: async () => void  (ödeme sonrası veriyi tazelemek için)
// ============================================================
export default function PaymentDrawer({ order, resolveProductName, tableLabel, onPaid }) {
  const { user } = useAuth();
  const canDiscount = ['Cashier', 'Admin'].includes(user?.role);

  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState('');

  const [amount, setAmount] = useState('');
  const [tip, setTip] = useState('');
  const [discount, setDiscount] = useState('');
  const [method, setMethod] = useState('Cash');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const loadBalance = useCallback(async () => {
    setBalanceLoading(true);
    setBalanceError('');
    try {
      const res = await client.get(`/payments/order/${order.OrderId}/balance`);
      setBalance(res.data);
      setAmount(res.data.remaining > 0 ? String(res.data.remaining) : '');
    } catch (err) {
      setBalanceError(err.response?.data?.message || 'Bakiye getirilemedi.');
    } finally {
      setBalanceLoading(false);
    }
  }, [order.OrderId]);

  useEffect(() => {
    if (open) {
      setError('');
      setSuccessMsg('');
      setTip('');
      setDiscount('');
      setMethod('Cash');
      loadBalance();
    }
  }, [open, loadBalance]);

  // ---- Canlı hesaplamalar ----
  const remaining = balance?.remaining ?? 0;
  const discountNum = Number(discount) || 0;
  const tipNum = Number(tip) || 0;
  const amountNum = Number(amount) || 0;

  // Bu ödemedeki indirim uygulandıktan sonra gerçekten borçlu olunan tutar
  const oweAfterDiscount = Math.max(remaining - discountNum, 0);
  // Sipariş bakiyesine gerçekten yansıyacak tutar (fazlası müşteriye para üstü olarak verilir)
  const appliedAmount = Math.min(amountNum, oweAfterDiscount);
  const changeDue = Math.max(amountNum - oweAfterDiscount, 0);
  const remainingAfterPayment = Math.max(oweAfterDiscount - amountNum, 0);

  const isValid =
    !balanceLoading &&
    !!balance &&
    amountNum > 0 &&
    !!method &&
    (discountNum === 0 || canDiscount);

  const quickExact = () => setAmount(oweAfterDiscount ? String(oweAfterDiscount) : '');
  const quickAdd = (n) => setAmount(String((amountNum || 0) + n));
  const quickFullPayment = () => {
    setDiscount('');
    setAmount(remaining ? String(remaining) : '');
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!isValid) return;
    setSubmitting(true);
    try {
      await client.post('/payments', {
        OrderId: order.OrderId,
        Amount: Number(appliedAmount.toFixed(2)),
        TipAmount: tipNum || undefined,
        DiscountAmount: discountNum || undefined,
        PaymentMethod: method,
      });
      setSuccessMsg(
        changeDue > 0
          ? `Ödeme alındı. Para üstü: ${money(changeDue)}`
          : 'Ödeme alındı.'
      );
      await loadBalance();
      setTip('');
      setDiscount('');
      await onPaid?.();
    } catch (err) {
      setError(err.response?.data?.message || 'Ödeme alınamadı.');
    } finally {
      setSubmitting(false);
    }
  };

  const items = order.items || [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full font-mono text-sm uppercase tracking-wide text-cream bg-ink
                   hover:bg-ink/90 active:bg-ink/80 rounded-sm px-6 py-3.5 min-h-[3rem] transition-colors"
      >
        💳 Ödeme Al
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          {/* Karartma */}
          <div
            className="absolute inset-0 bg-ink/50"
            onClick={() => !submitting && setOpen(false)}
          />

          {/* Çekmece */}
          <div className="relative w-full max-w-md h-full bg-white shadow-2xl flex flex-col animate-[slideIn_0.2s_ease-out]">
            <style>{`
              @keyframes slideIn {
                from { transform: translateX(100%); }
                to { transform: translateX(0); }
              }
            `}</style>

            {/* Başlık */}
            <div className="px-6 py-5 border-b border-sand flex items-start justify-between shrink-0">
              <div>
                <p className="font-mono text-xs tracking-[0.2em] text-ember uppercase mb-1">Kasa</p>
                <h2 className="font-display text-xl font-semibold text-ink">
                  Ödeme — Sipariş #{order.OrderId}
                </h2>
                {tableLabel && <p className="font-mono text-xs text-slate mt-0.5">{tableLabel}</p>}
              </div>
              <button
                onClick={() => !submitting && setOpen(false)}
                className="font-mono text-xs text-slate hover:text-ink w-9 h-9 flex items-center justify-center shrink-0"
              >
                Kapat ✕
              </button>
            </div>

            {/* Gövde (kaydırılabilir) */}
            <div className="flex-1 overflow-auto px-6 py-5">
              {balanceLoading && !balance ? (
                <p className="text-slate font-mono text-sm">Yükleniyor...</p>
              ) : balanceError ? (
                <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3">{balanceError}</p>
              ) : (
                <>
                  {/* Sipariş özeti */}
                  <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-2">Sipariş Özeti</p>
                  <div className="border border-sand rounded-sm overflow-hidden mb-4">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-cream/60 border-b border-sand text-left font-mono text-[10px] uppercase tracking-wide text-slate">
                          <th className="px-3 py-2">Ürün</th>
                          <th className="px-3 py-2 text-center">Adet</th>
                          <th className="px-3 py-2 text-right">B. Fiyat</th>
                          <th className="px-3 py-2 text-right">Tutar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-3 py-3 text-slate text-sm">Ürün bulunamadı.</td>
                          </tr>
                        ) : (
                          items.map((item, i) => (
                            <tr key={i} className="border-b border-sand last:border-b-0">
                              <td className="px-3 py-2 text-ink">
                                {resolveProductName ? resolveProductName(item.ProductId) : `Ürün #${item.ProductId}`}
                              </td>
                              <td className="px-3 py-2 text-center font-mono text-xs text-ink">{item.Quantity}</td>
                              <td className="px-3 py-2 text-right font-mono text-xs text-slate">{money(item.UnitPrice)}</td>
                              <td className="px-3 py-2 text-right font-mono text-xs text-ink font-medium">
                                {money(item.Quantity * item.UnitPrice)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Tutar özeti */}
                  <div className="border border-sand rounded-sm p-4 mb-5 space-y-1.5 bg-cream/20">
                    <div className="flex justify-between font-mono text-xs text-slate">
                      <span>Sipariş Toplamı</span>
                      <span>{money(balance?.totalAmount ?? order.TotalAmount)}</span>
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
                    <div className="flex justify-between items-center pt-2 mt-1 border-t border-sand">
                      <span className="font-mono text-xs uppercase tracking-wide text-slate">Kalan Bakiye</span>
                      <span className="font-mono text-lg font-semibold text-ember">{money(remaining)}</span>
                    </div>
                  </div>

                  {remaining <= 0 ? (
                    <p className="text-moss text-sm font-medium border-l-2 border-moss pl-3">
                      Bu sipariş için bakiye kalmadı — tamamı ödendi.
                    </p>
                  ) : (
                    <form onSubmit={submit} className="space-y-4">
                      {/* Tutar girişi */}
                      <div>
                        <label className="block font-mono text-[10px] uppercase tracking-wide text-slate mb-1.5">
                          Alınan Tutar
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full border border-sand rounded-sm px-4 py-3 min-h-[3rem] font-mono text-2xl text-ink font-semibold
                                     focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
                        />
                      </div>

                      {/* Hızlı tutar butonları */}
                      <div className="grid grid-cols-4 gap-2">
                        <button
                          type="button"
                          onClick={quickExact}
                          className="font-mono text-[10px] uppercase tracking-wide px-2 min-h-[2.75rem] rounded-sm border border-sand text-ink hover:border-ember hover:text-ember transition-colors"
                        >
                          Tam Tutar
                        </button>
                        <button
                          type="button"
                          onClick={() => quickAdd(50)}
                          className="font-mono text-[10px] uppercase tracking-wide px-2 min-h-[2.75rem] rounded-sm border border-sand text-ink hover:border-ember hover:text-ember transition-colors"
                        >
                          +50
                        </button>
                        <button
                          type="button"
                          onClick={() => quickAdd(100)}
                          className="font-mono text-[10px] uppercase tracking-wide px-2 min-h-[2.75rem] rounded-sm border border-sand text-ink hover:border-ember hover:text-ember transition-colors"
                        >
                          +100
                        </button>
                        <button
                          type="button"
                          onClick={quickFullPayment}
                          className="font-mono text-[10px] uppercase tracking-wide px-2 min-h-[2.75rem] rounded-sm border border-sand text-ink hover:border-ember hover:text-ember transition-colors"
                        >
                          Tam Ödeme
                        </button>
                      </div>

                      {/* Ödeme yöntemi */}
                      <div>
                        <label className="block font-mono text-[10px] uppercase tracking-wide text-slate mb-1.5">
                          Ödeme Yöntemi
                        </label>
                        <div className="grid grid-cols-4 gap-2">
                          {PAYMENT_METHODS.map((m) => (
                            <button
                              key={m.value}
                              type="button"
                              onClick={() => setMethod(m.value)}
                              className={`font-mono text-[10px] uppercase tracking-wide px-2 min-h-[2.75rem] rounded-sm border transition-colors ${
                                method === m.value
                                  ? 'border-ember bg-ember/10 text-ember font-semibold'
                                  : 'border-sand text-slate hover:text-ink'
                              }`}
                            >
                              {m.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Bahşiş + İndirim (opsiyonel) */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block font-mono text-[10px] uppercase tracking-wide text-slate mb-1.5">
                            Bahşiş <span className="normal-case text-slate/70">(opsiyonel)</span>
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={tip}
                            onChange={(e) => setTip(e.target.value)}
                            placeholder="0.00"
                            className="w-full border border-sand rounded-sm px-3 py-2.5 min-h-[2.75rem] font-mono text-sm text-ink
                                       focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
                          />
                        </div>
                        <div>
                          <label className="block font-mono text-[10px] uppercase tracking-wide text-slate mb-1.5">
                            İndirim <span className="normal-case text-slate/70">(opsiyonel)</span>
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={discount}
                            onChange={(e) => setDiscount(e.target.value)}
                            placeholder="0.00"
                            disabled={!canDiscount}
                            title={!canDiscount ? 'İndirim uygulama yetkiniz yok (Kasiyer/Admin)' : undefined}
                            className="w-full border border-sand rounded-sm px-3 py-2.5 min-h-[2.75rem] font-mono text-sm text-ink
                                       focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember
                                       disabled:opacity-40 disabled:cursor-not-allowed"
                          />
                        </div>
                      </div>
                      {!canDiscount && (
                        <p className="font-mono text-[10px] text-slate -mt-2">
                          İndirim uygulamak için Kasiyer/Admin yetkisi gerekir.
                        </p>
                      )}

                      {/* Canlı özet: kalan / para üstü */}
                      <div className="border border-sand rounded-sm p-4 space-y-1.5">
                        <div className="flex justify-between font-mono text-xs text-slate">
                          <span>Ödemeden Sonra Kalan</span>
                          <span className={remainingAfterPayment > 0 ? 'text-ember font-semibold' : 'text-moss font-semibold'}>
                            {money(remainingAfterPayment)}
                          </span>
                        </div>
                        {changeDue > 0 && (
                          <div className="flex justify-between font-mono text-xs">
                            <span className="text-slate">Para Üstü</span>
                            <span className="text-ink font-semibold">{money(changeDue)}</span>
                          </div>
                        )}
                      </div>

                      {error && (
                        <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3">{error}</p>
                      )}
                      {successMsg && (
                        <p className="text-moss text-sm font-medium border-l-2 border-moss pl-3">{successMsg}</p>
                      )}
                    </form>
                  )}
                </>
              )}
            </div>

            {/* Alt aksiyon çubuğu */}
            {!balanceLoading && balance && remaining > 0 && (
              <div className="px-6 py-4 border-t border-sand shrink-0">
                <button
                  type="button"
                  onClick={submit}
                  disabled={!isValid || submitting}
                  className="w-full font-mono text-sm uppercase tracking-wide text-cream bg-ember
                             hover:bg-ember/90 active:bg-ember/80 disabled:opacity-40 disabled:cursor-not-allowed
                             rounded-sm px-6 py-3.5 min-h-[3rem] transition-colors"
                >
                  {submitting ? 'İşleniyor...' : `Ödemeyi Onayla — ${money(appliedAmount)}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
