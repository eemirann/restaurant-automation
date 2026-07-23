import { useState, useCallback, useEffect } from 'react';
import client from '../api/client';
import { getSocket } from '../api/socket';
import { useAuth } from '../context/AuthContext';

const money = (n) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(n) || 0);

const PAYMENT_METHODS = [
  { value: 'Cash', label: 'Nakit', icon: '₺' },
  { value: 'Card', label: 'Kredi Kartı', icon: '💳' },
  { value: 'FoodCard', label: 'Yemek Kartı', icon: '🍽' },
  { value: 'QR', label: 'QR', icon: '▦' },
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
//  - onPaid: async (isFullyPaid: boolean) => void  (ödeme sonrası veriyi tazelemek için)
//  - autoOpen?: boolean  (true ise çekmece tetikleyici butona gerek kalmadan açık başlar)
//  - hideTrigger?: boolean  (true ise "Ödeme Al" tetikleyici butonu hiç render edilmez)
//  - onClose?: () => void  (çekmece kapatıldığında çağrılır — autoOpen kullanan ebeveynler için)
//  - triggerClassName?: string  (tetikleyici butonun görünümünü ezmek için — POS'ta öne çıkarma)
//  - triggerLabel?: node  (tetikleyici buton içeriği; varsayılan "💳 Ödeme Al")
// ============================================================
export default function PaymentDrawer({ order, resolveProductName, tableLabel, onPaid, autoOpen = false, hideTrigger = false, onClose, triggerClassName, triggerLabel }) {
  const { user } = useAuth();
  const canDiscount = ['Cashier', 'Admin'].includes(user?.role);

  const [open, setOpen] = useState(autoOpen);

  const close = () => {
    setOpen(false);
    onClose?.();
  };
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
  const [selectedQty, setSelectedQty] = useState(() => ({})); // { [itemKey]: seçilen adet }
  const [orderData, setOrderData] = useState(null); // GET /orders/:id — items dahil, prop'a değil kendi taze verisine güvenir

  const loadBalance = useCallback(async () => {
    setBalanceLoading(true);
    setBalanceError('');
    try {
      const res = await client.get(`/payments/order/${order.OrderId}/balance`);
      setBalance(res.data);
      setAmount(res.data.remaining > 0 ? String(res.data.remaining) : '');
      return res.data;
    } catch (err) {
      setBalanceError(err.response?.data?.message || 'Bakiye getirilemedi.');
      return null;
    } finally {
      setBalanceLoading(false);
    }
  }, [order.OrderId]);

  // Ürün listesini (adetler dahil) ebeveynin prop'una güvenmeden kendisi taze çeker.
  // Bu olmadan çekmece yeniden açıldığında sadece bakiye tazeleniyordu, ürün
  // adetleri ebeveyn ne zaman refetch ettiyse ona kalıyordu (bayat kalabiliyordu).
  const loadOrder = useCallback(async () => {
    try {
      const res = await client.get(`/orders/${order.OrderId}`);
      setOrderData(res.data);
      return res.data;
    } catch {
      return null;
    }
  }, [order.OrderId]);

  useEffect(() => {
    if (open) {
      setError('');
      setSuccessMsg('');
      setTip('');
      setDiscount('');
      setMethod('Cash');
      setSelectedQty({});
      loadBalance();
      loadOrder();
    }
  }, [open, loadBalance, loadOrder]);

  // Çekmece açıkken başka bir cihaz aynı siparişi değiştirirse (ürün ekle/çıkar,
  // başka bir ödeme al) anlık yansısın diye gerçek zamanlı senkronizasyona abone ol.
  useEffect(() => {
    if (!open) return undefined;
    const socket = getSocket();
    if (!socket) return undefined;

    const handleChanged = () => {
      loadBalance();
      loadOrder();
    };
    socket.on('tables:changed', handleChanged);
    return () => socket.off('tables:changed', handleChanged);
  }, [open, loadBalance, loadOrder]);

  // Taze sipariş/bakiye verisi geldiğinde (açılışta veya canlı güncellemede) seçili
  // adetleri yeni durumla uzlaştır: kaybolan kalemlerin seçimi düşer, GERÇEK kalan
  // ödenmemiş adedi (RemainingQuantity — başka bir cihazdan yapılmış kalem bazlı bir
  // ödemeyi de yansıtır) aşan seçimler kırpılır. Aksi halde bayat/geçersiz bir seçim
  // state'te kalıp backend'in reddedeceği bir tutar göndermeye çalışabilirdi.
  useEffect(() => {
    if (!orderData || !balance) return;
    const remaining = new Map((balance.items ?? []).map((bi) => [bi.OrderDetailsId, bi.RemainingQuantity]));

    setSelectedQty((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      let changed = false;
      const next = {};
      orderData.items.forEach((item, i) => {
        const key = item.OrderDetailsId ?? i;
        if (prev[key] == null) return;
        const maxQty = remaining.has(item.OrderDetailsId) ? remaining.get(item.OrderDetailsId) : item.Quantity;
        const clamped = Math.min(prev[key], maxQty);
        if (clamped > 0) next[key] = clamped;
        if (clamped !== prev[key]) changed = true;
      });
      if (Object.keys(next).length !== Object.keys(prev).length) changed = true;
      return changed ? next : prev;
    });
  }, [orderData, balance]);

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
      // Kalem seçiliyse Items gönderilir — backend tutarı client'tan almaz,
      // kendi UnitPrice/kalan-adet verisinden yeniden hesaplar ve bu ödemeyi
      // PaymentItems'a kalıcı olarak kaydeder (bir sonraki açılışta kalan adet
      // buna göre daralır). Seçim yoksa eskisi gibi düz tutarla (lump-sum) ödenir.
      const itemsPayload = hasSelection
        ? items
            .map((item, i) => ({ OrderDetailsId: item.OrderDetailsId, Quantity: selectedQty[itemKey(item, i)] || 0 }))
            .filter((it) => it.Quantity > 0)
        : undefined;

      await client.post('/payments', {
        OrderId: order.OrderId,
        Amount: Number(appliedAmount.toFixed(2)),
        Items: itemsPayload,
        TipAmount: tipNum || undefined,
        DiscountAmount: discountNum || undefined,
        PaymentMethod: method,
      });
      setSuccessMsg(
        changeDue > 0
          ? `Ödeme alındı. Para üstü: ${money(changeDue)}`
          : 'Ödeme alındı.'
      );
      // Seçim/bahşiş/indirim ÖNCE temizlenir: loadBalance() amount'u yeni kalan
      // bakiyeye göre ayarlıyor — eğer selectedQty temizliği bundan SONRA gelirse,
      // araya giren bir render'da eski seçim + yeni bakiye bir arada bulunup
      // auto-sync effect'i yeni tutarı eski seçim tutarıyla ezebiliyordu.
      setTip('');
      setDiscount('');
      setSelectedQty({});
      const updatedBalance = await loadBalance();
      const fullyPaid = !!updatedBalance && updatedBalance.remaining <= 0;
      await onPaid?.(fullyPaid);
    } catch (err) {
      setError(err.response?.data?.message || 'Ödeme alınamadı.');
    } finally {
      setSubmitting(false);
    }
  };

  // orderData kendi taze GET /orders/:id çağrısından gelir (bkz. loadOrder);
  // ilk yükleme tamamlanana kadar prop'a düşer, sonrasında hep kendi verisine güvenilir.
  // RemainingQuantity, balance.items'tan (GET /payments/order/:id/balance) gelir —
  // bu, backend'de PaymentItems'a dayanan GERÇEK kalan ödenmemiş adettir; item.Quantity
  // (siparişteki toplam adet) DEĞİL. Kalem bazlı bir ödeme daha önce yapılmışsa
  // stepper'ın üst sınırı buna göre daralır.
  const balanceByItem = new Map((balance?.items ?? []).map((bi) => [bi.OrderDetailsId, bi]));
  const items = (orderData?.items ?? order.items ?? []).map((item) => {
    const bi = balanceByItem.get(item.OrderDetailsId);
    return {
      ...item,
      RemainingQuantity: bi ? bi.RemainingQuantity : item.Quantity,
      PaidQuantity: bi ? bi.PaidQuantity : 0,
    };
  });
  const itemKey = (item, i) => item.OrderDetailsId ?? i;

  // Bir üründe birden fazla adet varsa (ör. 2x), hangi adedin şimdi
  // ödeneceği +/- ile seçilebilir (0..item.RemainingQuantity aralığında).
  const setItemQty = (key, maxQty, nextQty) => {
    const clamped = Math.max(0, Math.min(maxQty, nextQty));
    setSelectedQty((prev) => {
      const next = { ...prev };
      if (clamped === 0) delete next[key];
      else next[key] = clamped;
      return next;
    });
  };

  const selectedTotal = items.reduce((sum, item, i) => {
    const qty = selectedQty[itemKey(item, i)] || 0;
    return sum + qty * item.UnitPrice;
  }, 0);

  const hasSelection = selectedTotal > 0;

  // Seçim varken "Alınan Tutar" ayrı bir buton gerekmeden otomatik olarak
  // seçilen ürünlerin toplamını yansıtır — kullanıcı sadece seçtiklerinin
  // hesabını keser, ekstra bir "öde" adımı açmaya gerek kalmaz.
  useEffect(() => {
    if (hasSelection) setAmount(String(selectedTotal));
  }, [selectedTotal, hasSelection]);

  const clearSelection = () => setSelectedQty({});

  const showRegisterDisplay = !balanceLoading && !balanceError && !!balance && remaining > 0;

  return (
    <>
      {!hideTrigger && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={triggerClassName ||
            `w-full font-mono text-sm uppercase tracking-wide text-cream bg-ink
             hover:bg-ink/90 active:bg-ink/80 rounded-sm px-6 py-3.5 min-h-[3rem] transition-colors`}
        >
          {triggerLabel || '💳 Ödeme Al'}
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          {/* Karartma */}
          <div
            className="absolute inset-0 bg-ink/50"
            onClick={() => !submitting && close()}
          />

          {/* Çekmece */}
          <div className="relative w-full max-w-md h-full bg-white shadow-2xl flex flex-col animate-[slideIn_0.2s_ease-out]">
            <style>{`
              @keyframes slideIn {
                from { transform: translateX(100%); }
                to { transform: translateX(0); }
              }
              @keyframes digitPulse {
                from { opacity: 0.4; }
                to { opacity: 1; }
              }
            `}</style>

            {/* Başlık */}
            <div className="px-6 py-4 border-b border-sand flex items-start justify-between shrink-0 bg-white">
              <div>
                <p className="font-mono text-[10px] tracking-[0.25em] text-ember uppercase mb-1">Kasa · POS</p>
                <h2 className="font-display text-lg font-semibold text-ink leading-tight">
                  Sipariş #{order.OrderId}
                </h2>
                {tableLabel && <p className="font-mono text-xs text-slate mt-0.5">{tableLabel}</p>}
              </div>
              <button
                onClick={() => !submitting && close()}
                className="font-mono text-xs text-slate hover:text-ink w-9 h-9 flex items-center justify-center shrink-0 rounded-sm hover:bg-cream transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Register ekranı — daima görünür, canlı tutar/para üstü göstergesi */}
            {showRegisterDisplay && (
              <div className="shrink-0 bg-ink px-6 py-4 border-b border-ink">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-cream/50">
                    {changeDue > 0 ? 'Para Üstü' : 'Tahsil Edilecek'}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-cream/50">
                    {method}
                  </span>
                </div>
                <div
                  key={changeDue > 0 ? `change-${changeDue}` : `owe-${oweAfterDiscount}`}
                  className={`font-mono text-4xl font-semibold tabular-nums leading-tight mt-0.5 ${
                    changeDue > 0 ? 'text-moss' : 'text-ember'
                  }`}
                  style={{ animation: 'digitPulse 0.15s ease-out' }}
                >
                  {money(changeDue > 0 ? changeDue : oweAfterDiscount)}
                </div>
                <div className="flex justify-between font-mono text-[11px] text-cream/60 mt-1.5">
                  <span>Girilen: {money(amountNum)}</span>
                  <span>Kalan: {money(remainingAfterPayment)}</span>
                </div>
              </div>
            )}

            {/* Gövde (kaydırılabilir) */}
            <div className="flex-1 overflow-auto px-6 py-5 bg-cream/10">
              {balanceLoading && !balance ? (
                <p className="text-slate font-mono text-sm">Yükleniyor...</p>
              ) : balanceError ? (
                <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3">{balanceError}</p>
              ) : (
                <>
                  {/* Sipariş özeti — ürünler seçilip sadece seçilenler için ödeme tutarı doldurulabilir */}
                  <details className="group mb-4" open>
                    <summary className="font-mono text-[10px] uppercase tracking-widest text-slate mb-2 cursor-pointer select-none flex items-center gap-1.5 list-none">
                      <span className="inline-block transition-transform group-open:rotate-90">▸</span>
                      Sipariş Özeti ({items.length}) — ürün seçip kısmi öde
                    </summary>
                    <div className="border border-sand rounded-sm overflow-hidden mt-2 bg-white">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-cream/60 border-b border-sand text-left font-mono text-[10px] uppercase tracking-wide text-slate">
                            <th className="px-3 py-2">Ürün</th>
                            <th className="px-3 py-2 text-center">Adet</th>
                            <th className="px-3 py-2 text-right">B. Fiyat</th>
                            <th className="px-3 py-2 text-right">Tutar</th>
                            <th className="px-3 py-2 text-center w-28">Öde</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-3 py-3 text-slate text-sm">Ürün bulunamadı.</td>
                            </tr>
                          ) : (
                            items.map((item, i) => {
                              const key = itemKey(item, i);
                              const qty = selectedQty[key] || 0;
                              return (
                                <tr key={key} className={`border-b border-sand last:border-b-0 ${qty > 0 ? 'bg-ember/5' : ''}`}>
                                  <td className="px-3 py-2 text-ink">
                                    {resolveProductName ? resolveProductName(item.ProductId) : `Ürün #${item.ProductId}`}
                                  </td>
                                  <td className="px-3 py-2 text-center font-mono text-xs text-ink">
                                    {item.Quantity}
                                    {item.PaidQuantity > 0 && (
                                      <span className="block text-[9px] text-moss normal-case">{item.PaidQuantity} ödendi</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono text-xs text-slate">{money(item.UnitPrice)}</td>
                                  <td className="px-3 py-2 text-right font-mono text-xs text-ink font-medium">
                                    {money(item.Quantity * item.UnitPrice)}
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="flex items-center justify-center gap-1.5">
                                      <button
                                        type="button"
                                        disabled={qty <= 0}
                                        onClick={() => setItemQty(key, item.RemainingQuantity, qty - 1)}
                                        className="w-6 h-6 flex items-center justify-center font-mono text-xs text-slate hover:text-ember
                                                   border border-sand rounded-sm select-none disabled:opacity-30"
                                      >
                                        −
                                      </button>
                                      <span className="font-mono text-xs text-ink w-4 text-center">{qty}</span>
                                      <button
                                        type="button"
                                        disabled={qty >= item.RemainingQuantity}
                                        onClick={() => setItemQty(key, item.RemainingQuantity, qty + 1)}
                                        className="w-6 h-6 flex items-center justify-center font-mono text-xs text-cream bg-ember hover:bg-ember/90
                                                   rounded-sm select-none disabled:opacity-40"
                                      >
                                        +
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>

                    {hasSelection && (
                      <div className="flex items-center justify-between gap-3 mt-2 px-3 py-2.5 border border-ember/30 bg-ember/5 rounded-sm">
                        <span className="font-mono text-xs text-ink">
                          Seçili ürünler: <span className="font-semibold">{money(selectedTotal)}</span> — tutara otomatik yansıtıldı
                        </span>
                        <button
                          type="button"
                          onClick={clearSelection}
                          className="font-mono text-[10px] uppercase tracking-wide text-slate hover:text-ember shrink-0"
                        >
                          Seçimi Temizle
                        </button>
                      </div>
                    )}
                  </details>

                  {/* Tutar özeti */}
                  <div className="border border-sand rounded-sm p-4 mb-5 space-y-1.5 bg-white">
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
                    <p className="text-moss text-sm font-medium border-l-2 border-moss pl-3 bg-white py-3">
                      Bu sipariş için bakiye kalmadı — tamamı ödendi.
                    </p>
                  ) : (
                    <form onSubmit={submit} className="space-y-5">
                      {/* Tutar girişi — POS ekranı görünümü */}
                      <div className="bg-ink rounded-sm p-3">
                        <label className="block font-mono text-[10px] uppercase tracking-wide text-cream/50 mb-1.5 px-1">
                          Alınan Tutar {hasSelection && <span className="normal-case text-cream/40">(seçili ürünlerden — düzenlemek için seçimi temizleyin)</span>}
                        </label>
                        <div className="flex items-center gap-2 bg-black/20 rounded-sm px-3">
                          <span className="font-mono text-xl text-cream/40">₺</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={amount}
                            disabled={hasSelection}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="0.00"
                            className="w-full bg-transparent border-0 py-3 min-h-[3rem] font-mono text-3xl tabular-nums text-cream font-semibold
                                       focus:outline-none focus:ring-0 placeholder:text-cream/30 disabled:opacity-60"
                          />
                        </div>

                        {/* Hızlı tutar tuşları — ürün seçiliyken tutar seçimden geldiği için devre dışı */}
                        <div className="grid grid-cols-4 gap-2 mt-3">
                          <button
                            type="button"
                            disabled={hasSelection}
                            onClick={quickExact}
                            className="font-mono text-[10px] uppercase tracking-wide px-2 min-h-[2.75rem] rounded-sm bg-white/10 text-cream
                                       shadow-[0_2px_0_0_rgba(0,0,0,0.35)] hover:bg-white/15 active:shadow-none active:translate-y-[2px] transition-all disabled:opacity-30 disabled:pointer-events-none"
                          >
                            Tam Tutar
                          </button>
                          <button
                            type="button"
                            disabled={hasSelection}
                            onClick={() => quickAdd(50)}
                            className="font-mono text-[10px] uppercase tracking-wide px-2 min-h-[2.75rem] rounded-sm bg-white/10 text-cream
                                       shadow-[0_2px_0_0_rgba(0,0,0,0.35)] hover:bg-white/15 active:shadow-none active:translate-y-[2px] transition-all disabled:opacity-30 disabled:pointer-events-none"
                          >
                            +50
                          </button>
                          <button
                            type="button"
                            disabled={hasSelection}
                            onClick={() => quickAdd(100)}
                            className="font-mono text-[10px] uppercase tracking-wide px-2 min-h-[2.75rem] rounded-sm bg-white/10 text-cream
                                       shadow-[0_2px_0_0_rgba(0,0,0,0.35)] hover:bg-white/15 active:shadow-none active:translate-y-[2px] transition-all disabled:opacity-30 disabled:pointer-events-none"
                          >
                            +100
                          </button>
                          <button
                            type="button"
                            disabled={hasSelection}
                            onClick={quickFullPayment}
                            className="font-mono text-[10px] uppercase tracking-wide px-2 min-h-[2.75rem] rounded-sm bg-ember text-cream
                                       shadow-[0_2px_0_0_rgba(0,0,0,0.35)] hover:bg-ember/90 active:shadow-none active:translate-y-[2px] transition-all disabled:opacity-30 disabled:pointer-events-none"
                          >
                            Tam Ödeme
                          </button>
                        </div>
                      </div>

                      {/* Ödeme yöntemi — dokunmatik POS tuşları */}
                      <div>
                        <label className="block font-mono text-[10px] uppercase tracking-wide text-slate mb-1.5">
                          Ödeme Yöntemi
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {PAYMENT_METHODS.map((m) => (
                            <button
                              key={m.value}
                              type="button"
                              onClick={() => setMethod(m.value)}
                              className={`flex items-center gap-2 font-mono text-xs uppercase tracking-wide px-3 min-h-[3rem] rounded-sm border transition-all ${
                                method === m.value
                                  ? 'border-ember bg-ember/10 text-ember font-semibold ring-1 ring-ember/30'
                                  : 'border-sand bg-white text-slate hover:text-ink hover:border-ink/30'
                              }`}
                            >
                              <span className="text-base leading-none">{m.icon}</span>
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
                            className="w-full border border-sand rounded-sm px-3 py-2.5 min-h-[2.75rem] font-mono text-sm text-ink bg-white
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
                            className="w-full border border-sand rounded-sm px-3 py-2.5 min-h-[2.75rem] font-mono text-sm text-ink bg-white
                                       focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember
                                       disabled:opacity-40 disabled:cursor-not-allowed"
                          />
                        </div>
                      </div>
                      {!canDiscount && (
                        <p className="font-mono text-[10px] text-slate -mt-3">
                          İndirim uygulamak için Kasiyer/Admin yetkisi gerekir.
                        </p>
                      )}

                      {error && (
                        <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 bg-white py-2">{error}</p>
                      )}
                      {successMsg && (
                        <p className="text-moss text-sm font-medium border-l-2 border-moss pl-3 bg-white py-2">{successMsg}</p>
                      )}
                    </form>
                  )}
                </>
              )}
            </div>

            {/* Alt aksiyon çubuğu */}
            {!balanceLoading && balance && remaining > 0 && (
              <div className="px-6 py-4 border-t border-sand shrink-0 bg-white">
                <button
                  type="button"
                  onClick={submit}
                  disabled={!isValid || submitting}
                  className="w-full font-mono text-sm uppercase tracking-wide text-cream bg-ember
                             hover:bg-ember/90 active:bg-ember/80 disabled:opacity-40 disabled:cursor-not-allowed
                             rounded-sm px-6 py-3.5 min-h-[3rem] transition-colors shadow-sm"
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
