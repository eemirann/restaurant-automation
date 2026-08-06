import { useState, useCallback, useEffect, useRef } from 'react';
import client, { imageUrl } from '../api/client';
import { getSocket } from '../api/socket';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { printCustomerReceipt } from '../utils/print';

const money = (n) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(n) || 0);

const timeShort = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(d);
};

// Backend PaymentMethod kontratı ('Cash'|'Card'|'FoodCard'|'QR') — DEĞİŞTİRİLEMEZ.
const PAYMENT_METHODS = [
  { value: 'Cash', label: 'Nakit', icon: '💵', hint: 'F1' },
  { value: 'Card', label: 'Kredi Kartı', icon: '💳', hint: 'F2' },
  { value: 'QR', label: 'QR', icon: '📱', hint: 'F3' },
  { value: 'FoodCard', label: 'Yemek Kartı', icon: '🍽' },
];

// İstenen hızlı tutar tuşları
const QUICK_AMOUNTS = [
  { label: '+50', delta: 50 },
  { label: '+100', delta: 100 },
  { label: '−50', delta: -50 },
  { label: '−100', delta: -100 },
];

// Sipariş özeti ızgarası: adet · ürün · birim · tutar · öde(−/+).
// Başlık satırı ile kalem satırları AYNI şablonu kullanır ki sütunlar hizalı kalsın.
const SUMMARY_COLS = 'grid-cols-[2rem_1fr_4.5rem_5.5rem_8rem]';

// Değeri her değiştiğinde kısa bir "pulse" ile canlanan para göstergesi.
function AnimatedMoney({ value, className = '' }) {
  return (
    <span key={value} className={className} style={{ animation: 'pdPulse 0.18s ease-out' }}>
      {money(value)}
    </span>
  );
}

// ============================================================
// PaymentDrawer — Premium POS ödeme paneli (tek ekran, scroll'suz).
// SOL: büyük sipariş özeti (müşteriyle teyit). SAĞ: ödeme konsolu
// (yöntemler, tutar girişi, hızlı tutarlar). Orders.jsx, Payments.jsx
// ve Tables.jsx'te ortak kullanılır.
//
// BACKEND SÖZLEŞMESİ (değiştirilmez):
//  - GET  /payments/order/:id/balance
//  - GET  /orders/:id
//  - POST /payments { OrderId, Amount, Items?, TipAmount?, DiscountAmount?, PaymentMethod }
// Split ödeme AYNI POST /payments ucunu her yöntem için sırayla çağırır.
//
// Props (imza korunur):
//  order, resolveProductName, tableLabel, onPaid, autoOpen, hideTrigger,
//  onClose, triggerClassName, triggerLabel
// ============================================================
export default function PaymentDrawer({ order, resolveProductName, tableLabel, onPaid, autoOpen = false, hideTrigger = false, onClose, triggerClassName, triggerLabel }) {
  const { user } = useAuth();
  const { RestaurantName, PrinterPaperWidth, LogoUrl, CustomerPrinterName } = useSettings();
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
  const [selectedQty, setSelectedQty] = useState(() => ({}));
  const [orderData, setOrderData] = useState(null);

  const [splitMode, setSplitMode] = useState(false);
  const [split, setSplit] = useState({ Cash: '', Card: '', QR: '', FoodCard: '' });
  const [lastReceipt, setLastReceipt] = useState(null);

  // e-Arşiv fatura kesme — henüz gerçek bir entegratör bağlı değil, backend
  // utils/invoiceProvider.js içinde MOCK bir fatura numarası üretiyor.
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [invoiceCustomerName, setInvoiceCustomerName] = useState('');
  const [invoiceTckn, setInvoiceTckn] = useState('');
  const [invoiceEmail, setInvoiceEmail] = useState('');
  const [invoiceSubmitting, setInvoiceSubmitting] = useState(false);
  const [invoiceError, setInvoiceError] = useState('');
  const [invoiceResult, setInvoiceResult] = useState(null);

  const issueInvoice = async () => {
    setInvoiceError('');
    if (invoiceTckn.trim() && !/^\d{11}$/.test(invoiceTckn.trim())) {
      setInvoiceError('TCKN 11 haneli bir sayı olmalıdır.');
      return;
    }
    setInvoiceSubmitting(true);
    try {
      const res = await client.post(`/invoices/order/${order.OrderId}`, {
        CustomerName: invoiceCustomerName.trim() || undefined,
        CustomerTckn: invoiceTckn.trim() || undefined,
        CustomerEmail: invoiceEmail.trim() || undefined,
      });
      setInvoiceResult(res.data);
      setShowInvoiceForm(false);
    } catch (err) {
      setInvoiceError(err.response?.data?.error || 'Fatura kesilemedi.');
    } finally {
      setInvoiceSubmitting(false);
    }
  };

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
      setSplitMode(false);
      setSplit({ Cash: '', Card: '', QR: '', FoodCard: '' });
      setLastReceipt(null);
      loadBalance();
      // Müşterinin QR menüden checkout'ta seçtiği bahşiş varsa (Orders.TipAmount,
      // bkz. musteri-menu CartView.jsx) tutar alanına ön-dolu gelir — kasiyer
      // isterse değiştirebilir/kaldırabilir (müşterinin seçimi son söz değildir).
      loadOrder().then((data) => {
        if (data?.TipAmount > 0) setTip(String(data.TipAmount));
      });
    }
  }, [open, loadBalance, loadOrder]);

  // Çekmece açıkken başka cihaz aynı siparişi değiştirirse anlık yansısın.
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

  // Çekmece açıkken arka plan SABİT kalır: body scroll kilitlenir ve kaybolan
  // kaydırma çubuğunun genişliği padding ile telafi edilir (yoksa arkadaki
  // masa/sipariş ekranı yana "zıplar"). Kapanınca eski değerler geri yüklenir.
  useEffect(() => {
    if (!open) return undefined;
    const { body } = document;
    const prevOverflow = body.style.overflow;
    const prevPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      const current = parseFloat(window.getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${current + scrollbarWidth}px`;
    }
    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPaddingRight;
    };
  }, [open]);

  // Taze veri gelince seçili adetleri gerçek kalan ödenmemiş adede göre uzlaştır.
  useEffect(() => {
    if (!orderData || !balance) return;
    const remainingMap = new Map((balance.items ?? []).map((bi) => [bi.OrderDetailsId, bi.RemainingQuantity]));
    setSelectedQty((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      let changed = false;
      const next = {};
      orderData.items.forEach((item, i) => {
        const key = item.OrderDetailsId ?? i;
        if (prev[key] == null) return;
        const maxQty = remainingMap.has(item.OrderDetailsId) ? remainingMap.get(item.OrderDetailsId) : item.Quantity;
        const clamped = Math.min(prev[key], maxQty);
        if (clamped > 0) next[key] = clamped;
        if (clamped !== prev[key]) changed = true;
      });
      if (Object.keys(next).length !== Object.keys(prev).length) changed = true;
      return changed ? next : prev;
    });
  }, [orderData, balance]);

  // ---- Canlı hesaplamalar ----
  const totalAmount = balance?.totalAmount ?? order.TotalAmount ?? 0;
  const totalPaid = balance?.totalPaid ?? 0;
  const remaining = balance?.remaining ?? 0;
  const discountNum = Number(discount) || 0;
  const tipNum = Number(tip) || 0;
  const amountNum = Number(amount) || 0;

  const splitTotal = Object.values(split).reduce((s, v) => s + (Number(v) || 0), 0);

  const oweAfterDiscount = Math.max(remaining - discountNum, 0);

  const enteredNum = splitMode ? splitTotal : amountNum;
  const appliedAmount = Math.min(enteredNum, oweAfterDiscount);
  const changeDue = Math.max(enteredNum - oweAfterDiscount, 0);
  const remainingAfterPayment = Math.max(oweAfterDiscount - enteredNum, 0);

  const paidPct = totalAmount > 0 ? Math.min(100, (totalPaid / totalAmount) * 100) : 0;
  const pendingPct = totalAmount > 0 ? Math.min(100 - paidPct, (appliedAmount / totalAmount) * 100) : 0;

  const isValidNormal =
    !balanceLoading && !!balance && amountNum > 0 && !!method && (discountNum === 0 || canDiscount);
  const isValidSplit =
    !balanceLoading && !!balance && splitTotal > 0 && (discountNum === 0 || canDiscount);
  const isValid = splitMode ? isValidSplit : isValidNormal;

  // ---- Sipariş kalemleri ----
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

  useEffect(() => {
    if (hasSelection && !splitMode) setAmount(String(selectedTotal));
  }, [selectedTotal, hasSelection, splitMode]);

  const clearSelection = () => setSelectedQty({});

  // ---- Tutar hızlı tuşları (hesap makinesi tuş takımı YOK) ----
  const amountLocked = hasSelection || splitMode;
  const quickAdd = (n) => { if (!amountLocked) setAmount(String(Math.max(0, (amountNum || 0) + n))); };
  const quickExact = () => { if (!amountLocked) setAmount(oweAfterDiscount ? String(oweAfterDiscount) : ''); };

  const setSplitValue = (m, v) => setSplit((prev) => ({ ...prev, [m]: v }));
  const splitFillRemaining = (m) => {
    const others = Object.entries(split).reduce((s, [k, v]) => (k === m ? s : s + (Number(v) || 0)), 0);
    const fill = Math.max(oweAfterDiscount - others, 0);
    setSplit((prev) => ({ ...prev, [m]: fill ? String(Number(fill.toFixed(2))) : '' }));
  };

  // ---- Fiş (client-side, backend YOK) ----
  const receiptLines = () => {
    const lines = [];
    lines.push(`Sipariş #${order.OrderId}`);
    if (tableLabel) lines.push(tableLabel);
    lines.push('--------------------------');
    items.forEach((it) => {
      const name = resolveProductName ? resolveProductName(it.ProductId) : `Ürün #${it.ProductId}`;
      lines.push(`${it.Quantity} x ${name}  ${money(it.Quantity * it.UnitPrice)}`);
      (it.Extras || []).forEach((extra) => lines.push(`   + ${extra.Quantity}x ${extra.ExtraName}`));
      (it.Syrups || []).forEach((syrup) => lines.push(`   + ${syrup.Quantity}x ${syrup.SyrupName}`));
    });
    lines.push('--------------------------');
    lines.push(`Toplam: ${money(totalAmount)}`);
    if (totalPaid > 0) lines.push(`Ödenen: ${money(totalPaid)}`);
    lines.push(`Kalan: ${money(remaining)}`);
    lines.push('Teşekkür ederiz!');
    return lines.join('\n');
  };
  const printReceipt = () => {
    const rowsHtml = items
      .map((it) => {
        const name = resolveProductName ? resolveProductName(it.ProductId) : `Ürün #${it.ProductId}`;
        const optionRows = [
          ...(it.Extras || []).map((extra) => `<tr><td></td><td style="padding-left:10px;color:#555">+ ${extra.Quantity}x ${extra.ExtraName}</td><td></td></tr>`),
          ...(it.Syrups || []).map((syrup) => `<tr><td></td><td style="padding-left:10px;color:#555">+ ${syrup.Quantity}x ${syrup.SyrupName}</td><td></td></tr>`),
        ].join('');
        return `<tr><td>${it.Quantity}×</td><td>${name}</td><td style="text-align:right">${money(it.Quantity * it.UnitPrice)}</td></tr>${optionRows}`;
      })
      .join('');
    printCustomerReceipt({
      restaurantName: RestaurantName || 'RESTORAN',
      logoUrl: imageUrl(LogoUrl),
      orderId: order.OrderId,
      tableLabel,
      rowsHtml,
      totalAmount,
      totalPaid,
      remaining,
      money,
      paperWidth: PrinterPaperWidth || 80,
      printerName: CustomerPrinterName,
    });
  };
  const sendWhatsApp = () => window.open(`https://wa.me/?text=${encodeURIComponent(receiptLines())}`, '_blank');
  const sendEmail = () => { window.location.href = `mailto:?subject=${encodeURIComponent(`Fiş #${order.OrderId}`)}&body=${encodeURIComponent(receiptLines())}`; };

  // ---- Ödeme gönderimi ----
  const runNormalPayment = async () => {
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
    return { method, applied: appliedAmount, change: changeDue };
  };

  const runSplitPayment = async () => {
    const allocs = ['Cash', 'Card', 'QR', 'FoodCard']
      .map((m) => ({ method: m, amount: Number(split[m]) || 0 }))
      .filter((a) => a.amount > 0);
    let owe = oweAfterDiscount;
    let firstDone = false;
    let totalApplied = 0;
    for (const a of allocs) {
      const applied = Math.min(a.amount, owe);
      if (applied <= 0) continue;
      await client.post('/payments', {
        OrderId: order.OrderId,
        Amount: Number(applied.toFixed(2)),
        TipAmount: !firstDone ? (tipNum || undefined) : undefined,
        DiscountAmount: !firstDone ? (discountNum || undefined) : undefined,
        PaymentMethod: a.method,
      });
      firstDone = true;
      owe -= applied;
      totalApplied += applied;
    }
    return { method: 'Split', applied: totalApplied, change: Math.max(splitTotal - totalApplied, 0) };
  };

  const confirmPayment = async () => {
    setError('');
    if (!isValid || submitting) return;
    setSubmitting(true);
    try {
      const receipt = splitMode ? await runSplitPayment() : await runNormalPayment();
      setSuccessMsg(receipt.change > 0 ? `Ödeme alındı. Para üstü: ${money(receipt.change)}` : 'Ödeme alındı.');
      setLastReceipt({ ...receipt, at: new Date() });
      setTip('');
      setDiscount('');
      setSelectedQty({});
      setSplitMode(false);
      setSplit({ Cash: '', Card: '', QR: '', FoodCard: '' });
      const updatedBalance = await loadBalance();
      const fullyPaid = !!updatedBalance && updatedBalance.remaining <= 0;
      await onPaid?.(fullyPaid);
    } catch (err) {
      setError(err.response?.data?.message || 'Ödeme alınamadı.');
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Klavye kısayolları (Esc kapat, F1/F2/F3 yöntem, Enter onayla) ----
  const kbRef = useRef({});
  kbRef.current = { submitting, isValid, confirmPayment, close };
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      const s = kbRef.current;
      if (e.key === 'Escape') { if (!s.submitting) s.close(); }
      else if (e.key === 'F1') { e.preventDefault(); setSplitMode(false); setMethod('Cash'); }
      else if (e.key === 'F2') { e.preventDefault(); setSplitMode(false); setMethod('Card'); }
      else if (e.key === 'F3') { e.preventDefault(); setSplitMode(false); setMethod('QR'); }
      else if (e.key === 'Enter') {
        if (document.activeElement?.tagName !== 'TEXTAREA') {
          e.preventDefault();
          if (s.isValid && !s.submitting) s.confirmPayment();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const fullyPaidState = !balanceLoading && !balanceError && !!balance && remaining <= 0;

  const KEYFRAMES = `
    @keyframes pdSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
    @keyframes pdFadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes pdPulse { from { opacity: .45; transform: translateY(1px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes pdPop { 0% { transform: scale(.94); } 60% { transform: scale(1.02); } 100% { transform: scale(1); } }
  `;

  return (
    <>
      {!hideTrigger && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={triggerClassName ||
            `w-full font-mono text-sm uppercase tracking-wide text-cream bg-ink
             hover:bg-ink/90 active:bg-ink/80 rounded-lg px-6 py-3.5 min-h-[3rem] transition-colors`}
        >
          {triggerLabel || '💳 Ödeme Al'}
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[60] flex justify-end overscroll-contain">
          <style>{KEYFRAMES}</style>

          <div
            className="absolute inset-0 bg-ink/60 backdrop-blur-sm"
            style={{ animation: 'pdFadeIn 0.2s ease-out', touchAction: 'none' }}
            onClick={() => !submitting && close()}
          />

          {/* Çekmece — scroll'suz, tam yükseklik */}
          <div
            className="relative w-full max-w-5xl h-full bg-charcoal shadow-2xl flex flex-col overflow-hidden"
            style={{ animation: 'pdSlideIn 0.24s cubic-bezier(0.22,1,0.36,1)' }}
          >
            {/* Başlık — sıkıştırılmış sipariş bilgisi tek satırda */}
            <header className="px-6 py-3 border-b border-hairline flex items-center justify-between shrink-0 bg-panel/80 backdrop-blur-md">
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono text-[10px] tracking-[0.28em] text-ember uppercase">Kasa · POS</span>
                <span className="h-4 w-px bg-hairline" />
                <h2 className="font-display text-lg font-semibold text-paper leading-none shrink-0">Sipariş #{order.OrderId}</h2>
                {tableLabel && <span className="font-mono text-xs text-slate truncate">· {tableLabel}</span>}
                <span className="font-mono text-xs text-slate hidden sm:inline">· {timeShort((orderData || order).CreatedAt)}</span>
                <span className="font-mono text-xs text-slate">· {items.length} ürün</span>
              </div>
              <button
                onClick={() => !submitting && close()}
                className="font-mono text-sm text-slate hover:text-paper w-9 h-9 flex items-center justify-center shrink-0 rounded-lg hover:bg-hairline/60 transition-colors"
                aria-label="Kapat"
              >
                ✕
              </button>
            </header>

            {balanceLoading && !balance ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-slate font-mono text-sm animate-pulse">Yükleniyor…</p>
              </div>
            ) : balanceError ? (
              <div className="flex-1 flex items-center justify-center px-6">
                <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3">{balanceError}</p>
              </div>
            ) : (
              <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1.5fr_1fr]">
                {/* ================= SOL: büyük sipariş özeti ================= */}
                <section className="min-h-0 flex flex-col lg:border-r border-hairline">
                  <div className="px-5 pt-3 pb-2 shrink-0 flex items-baseline justify-between gap-3">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <h3 className="font-display text-lg font-semibold text-paper leading-none">Sipariş Özeti</h3>
                      <span className="font-mono text-[11px] text-slate shrink-0">{items.length} kalem</span>
                    </div>
                    {hasSelection ? (
                      <button type="button" onClick={clearSelection} className="font-mono text-[10px] uppercase tracking-wide text-slate hover:text-ember shrink-0">
                        Seçimi Temizle
                      </button>
                    ) : (
                      <span className="font-mono text-[10px] uppercase tracking-wide text-slate/60 shrink-0">− / + ile kısmi öde</span>
                    )}
                  </div>

                  {/* Sütun başlıkları — satır ızgarasıyla birebir aynı şablon */}
                  <div className="px-5 shrink-0">
                    <div className={`grid ${SUMMARY_COLS} gap-2 items-center px-3 pb-1.5 font-mono text-[10px] uppercase tracking-wider text-slate/70 border-b border-hairline`}>
                      <span>Ad</span>
                      <span>Ürün</span>
                      <span className="text-right">Birim</span>
                      <span className="text-right">Tutar</span>
                      <span className="text-center">Öde</span>
                    </div>
                  </div>

                  {/* Ürün listesi — her kalem TEK satır, 8 satır tek ekranda sığar.
                      Fazlası taşarsa yalnızca bu alan kayar (overscroll-contain:
                      kaydırma arkadaki masa ekranına sıçramaz). */}
                  <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-1.5 space-y-1.5">
                    {items.length === 0 ? (
                      <p className="text-slate text-sm font-mono py-6 text-center">Ürün bulunamadı.</p>
                    ) : (
                      items.map((item, i) => {
                        const key = itemKey(item, i);
                        const qty = selectedQty[key] || 0;
                        const name = resolveProductName ? resolveProductName(item.ProductId) : `Ürün #${item.ProductId}`;
                        const selectable = !splitMode;
                        // Ekstra/şurup/not tek bir kısaltılmış alt satırda toplanır —
                        // satır yüksekliği sabit kalsın diye (8 satır hedefi).
                        const options = [
                          ...(item.Extras || []).map((e) => `${e.Quantity}x ${e.ExtraName}`),
                          ...(item.Syrups || []).map((s) => `${s.Quantity}x ${s.SyrupName}`),
                        ];
                        const hasMeta = options.length > 0 || !!item.Note || item.PaidQuantity > 0;
                        return (
                          <div
                            key={key}
                            className={`rounded-lg border px-3 py-1.5 transition-colors ${qty > 0 ? 'border-ember/60 bg-ember/5' : 'border-hairline bg-panel'}`}
                          >
                            <div className={`grid ${SUMMARY_COLS} gap-2 items-center`}>
                              {/* Adet */}
                              <span className="font-display text-base font-bold text-paper tabular-nums leading-none">{item.Quantity}×</span>

                              {/* Ürün adı + (varsa) tek satırlık ayrıntı */}
                              <div className="min-w-0">
                                <p className="text-sm text-paper font-semibold truncate leading-tight">{name}</p>
                                {hasMeta && (
                                  <p className="font-mono text-[10px] truncate leading-tight mt-0.5">
                                    {item.PaidQuantity > 0 && <span className="text-moss">{item.PaidQuantity} ödendi · </span>}
                                    {options.length > 0 && <span className="text-slate">{options.join(' · ')}</span>}
                                    {item.Note && <span className="text-azure/90">{options.length > 0 ? ' · ' : ''}📝 {item.Note}</span>}
                                  </p>
                                )}
                              </div>

                              {/* Birim fiyat */}
                              <p className="font-mono text-xs text-slate tabular-nums text-right">{money(item.UnitPrice)}</p>

                              {/* Satır tutarı */}
                              <p className="font-mono text-sm text-paper font-semibold tabular-nums text-right">{money(item.Quantity * item.UnitPrice)}</p>

                              {/* Kısmi ödeme seçici — dokunmatik için 44×44 px hedefler */}
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button" aria-label={`${name} adet azalt`}
                                  disabled={!selectable || qty <= 0}
                                  onClick={() => setItemQty(key, item.RemainingQuantity, qty - 1)}
                                  className="w-11 h-11 flex items-center justify-center font-mono text-lg text-slate hover:text-ember active:bg-charcoal border border-hairline rounded-lg select-none touch-manipulation disabled:opacity-25 transition-colors"
                                >
                                  −
                                </button>
                                <span className="font-mono text-sm text-paper w-6 text-center tabular-nums">{qty}</span>
                                <button
                                  type="button" aria-label={`${name} adet artır`}
                                  disabled={!selectable || qty >= item.RemainingQuantity}
                                  onClick={() => setItemQty(key, item.RemainingQuantity, qty + 1)}
                                  className="w-11 h-11 flex items-center justify-center font-mono text-lg text-cream bg-ember hover:bg-ember/90 active:bg-ember/80 rounded-lg select-none touch-manipulation disabled:opacity-30 transition-colors"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Toplam çubuğu */}
                  <div className="px-5 py-3 border-t border-hairline shrink-0 bg-panel/60">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs uppercase tracking-widest text-slate">{hasSelection ? 'Seçili Tutar' : 'Sipariş Toplamı'}</span>
                      <AnimatedMoney value={hasSelection ? selectedTotal : totalAmount} className="font-display text-3xl font-bold text-paper tabular-nums leading-none" />
                    </div>
                  </div>
                </section>

                {/* ================= SAĞ: ödeme konsolu ================= */}
                <section className="min-h-0 flex flex-col bg-charcoal">
                  {fullyPaidState ? (
                    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center" style={{ animation: 'pdPop 0.3s ease-out' }}>
                      <div className="text-5xl mb-3">✅</div>
                      <p className="font-display text-xl font-semibold text-paper">Ödeme Tamamlandı</p>
                      <p className="font-mono text-xs text-slate mt-1">Bu sipariş için bakiye kalmadı.</p>
                      {lastReceipt && (
                        <div className="grid grid-cols-3 gap-2 mt-6 w-full max-w-xs">
                          <button type="button" onClick={printReceipt} className="font-mono text-[10px] uppercase tracking-wide px-2 py-3 rounded-lg bg-panel border border-hairline text-paper hover:bg-hairline/50 transition-colors">🖨 Yazdır</button>
                          <button type="button" onClick={sendWhatsApp} className="font-mono text-[10px] uppercase tracking-wide px-2 py-3 rounded-lg bg-panel border border-moss/40 text-moss hover:bg-moss/10 transition-colors">WhatsApp</button>
                          <button type="button" onClick={sendEmail} className="font-mono text-[10px] uppercase tracking-wide px-2 py-3 rounded-lg bg-panel border border-azure/40 text-azure hover:bg-azure/10 transition-colors">E-posta</button>
                        </div>
                      )}

                      {/* e-Arşiv fatura kesme — mock (bkz. utils/invoiceProvider.js) */}
                      <div className="mt-3 w-full max-w-xs text-left">
                        {invoiceResult ? (
                          <div className="rounded-lg border border-moss/40 bg-moss/5 px-3 py-2">
                            <p className="font-mono text-[10px] uppercase tracking-wide text-moss">
                              e-Arşiv Fişi Kesildi (TEST/MOCK)
                            </p>
                            <p className="font-mono text-xs text-paper mt-0.5">{invoiceResult.InvoiceNumber}</p>
                          </div>
                        ) : showInvoiceForm ? (
                          <div className="rounded-lg border border-hairline bg-panel p-3 space-y-2">
                            <input
                              type="text"
                              value={invoiceCustomerName}
                              onChange={(e) => setInvoiceCustomerName(e.target.value)}
                              placeholder="Müşteri adı (opsiyonel)"
                              className="w-full border border-hairline rounded-sm px-2.5 py-2 font-body text-xs text-paper bg-charcoal
                                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
                            />
                            <input
                              type="text"
                              value={invoiceTckn}
                              onChange={(e) => setInvoiceTckn(e.target.value.replace(/\D/g, '').slice(0, 11))}
                              placeholder="TCKN (opsiyonel)"
                              maxLength={11}
                              className="w-full border border-hairline rounded-sm px-2.5 py-2 font-mono text-xs text-paper bg-charcoal
                                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
                            />
                            <input
                              type="email"
                              value={invoiceEmail}
                              onChange={(e) => setInvoiceEmail(e.target.value)}
                              placeholder="E-posta (opsiyonel)"
                              className="w-full border border-hairline rounded-sm px-2.5 py-2 font-body text-xs text-paper bg-charcoal
                                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
                            />
                            {invoiceError && <p className="text-ember text-[10px] font-medium">{invoiceError}</p>}
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => { setShowInvoiceForm(false); setInvoiceError(''); }}
                                disabled={invoiceSubmitting}
                                className="flex-1 font-mono text-[10px] uppercase tracking-wide text-slate hover:text-paper
                                           border border-hairline rounded-sm px-2 py-2 transition-colors disabled:opacity-50"
                              >
                                Vazgeç
                              </button>
                              <button
                                type="button"
                                onClick={issueInvoice}
                                disabled={invoiceSubmitting}
                                className="flex-1 font-mono text-[10px] uppercase tracking-wide text-cream bg-ember
                                           hover:bg-ember/90 disabled:opacity-40 rounded-sm px-2 py-2 transition-colors"
                              >
                                {invoiceSubmitting ? 'Kesiliyor...' : 'Onayla'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setShowInvoiceForm(true)}
                            className="w-full font-mono text-[10px] uppercase tracking-wide px-2 py-3 rounded-lg bg-panel border border-hairline text-paper hover:bg-hairline/50 transition-colors"
                          >
                            🧾 e-Arşiv Fatura Kes
                          </button>
                        )}
                      </div>{/* /e-Arşiv fatura kesme */}
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain lg:overflow-visible px-5 py-4 space-y-3">
                        {/* Ödeme özeti kartı */}
                        <div className="rounded-2xl bg-ink text-cream p-4 shadow-lg shadow-ink/20 shrink-0">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-cream/50">{changeDue > 0 ? 'Para Üstü' : 'Kalan Bakiye'}</span>
                            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-cream/50">{splitMode ? 'Split' : method}</span>
                          </div>
                          <AnimatedMoney
                            value={changeDue > 0 ? changeDue : oweAfterDiscount}
                            className={`block font-mono text-[2.5rem] leading-none font-semibold tabular-nums mt-1 ${changeDue > 0 ? 'text-moss' : 'text-cream'}`}
                          />
                          <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden flex">
                            <div className="h-full bg-moss transition-all duration-500" style={{ width: `${paidPct}%` }} />
                            <div className="h-full bg-ember/70 transition-all duration-300" style={{ width: `${pendingPct}%` }} />
                          </div>
                          <div className="grid grid-cols-3 gap-2 mt-3">
                            <div><p className="font-mono text-[9px] uppercase tracking-wider text-cream/40">Toplam</p><span className="font-mono text-xs font-semibold tabular-nums text-cream">{money(totalAmount)}</span></div>
                            <div><p className="font-mono text-[9px] uppercase tracking-wider text-cream/40">Ödenen</p><span className="font-mono text-xs font-semibold tabular-nums text-moss">{money(totalPaid)}</span></div>
                            <div><p className="font-mono text-[9px] uppercase tracking-wider text-cream/40">Alınan</p><AnimatedMoney value={enteredNum} className="font-mono text-xs font-semibold tabular-nums text-cream" /></div>
                          </div>
                        </div>

                        {/* Ödeme yöntemleri */}
                        <div className="grid grid-cols-2 gap-2">
                          {PAYMENT_METHODS.map((m) => {
                            const active = !splitMode && method === m.value;
                            return (
                              <button
                                key={m.value} type="button"
                                onClick={() => { setSplitMode(false); setMethod(m.value); }}
                                style={active ? { animation: 'pdPop 0.25s ease-out' } : undefined}
                                className={`relative flex items-center gap-2.5 px-3 min-h-[3.25rem] rounded-xl border text-left transition-all ${
                                  active ? 'border-ember bg-ember/10 ring-2 ring-ember/30 shadow-sm' : 'border-hairline bg-panel hover:border-slate/40'
                                }`}
                              >
                                <span className="text-xl leading-none">{m.icon}</span>
                                <span className={`font-mono text-xs uppercase tracking-wide ${active ? 'text-ember font-semibold' : 'text-paper'}`}>{m.label}</span>
                                {m.hint && <span className="absolute top-1.5 right-2 font-mono text-[9px] text-slate/50">{m.hint}</span>}
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            onClick={() => { setSplitMode((v) => !v); clearSelection(); }}
                            style={splitMode ? { animation: 'pdPop 0.25s ease-out' } : undefined}
                            className={`col-span-2 flex items-center justify-center gap-2 px-3 min-h-[2.75rem] rounded-xl border transition-all ${
                              splitMode ? 'border-azure bg-azure/10 ring-2 ring-azure/30 text-azure font-semibold' : 'border-dashed border-hairline bg-panel text-slate hover:text-paper hover:border-slate/40'
                            }`}
                          >
                            <span className="text-lg leading-none">🧮</span>
                            <span className="font-mono text-xs uppercase tracking-wide">Split · Bölerek Öde</span>
                          </button>
                        </div>

                        {splitMode ? (
                          <div className="rounded-2xl bg-panel border border-hairline p-3 space-y-2" style={{ animation: 'pdFadeIn 0.2s ease-out' }}>
                            {PAYMENT_METHODS.map((m) => (
                              <div key={m.value} className="flex items-center gap-2">
                                <span className="w-24 flex items-center gap-1.5 font-mono text-xs text-paper"><span className="text-base">{m.icon}</span>{m.label}</span>
                                <div className="flex-1 flex items-center gap-1.5 bg-charcoal rounded-lg px-2 border border-hairline focus-within:border-azure">
                                  <span className="font-mono text-sm text-slate">₺</span>
                                  <input type="number" min="0" step="0.01" inputMode="decimal" value={split[m.value]} onChange={(e) => setSplitValue(m.value, e.target.value)} placeholder="0.00"
                                    className="w-full bg-transparent border-0 py-2 font-mono text-sm tabular-nums text-paper focus:outline-none focus:ring-0 placeholder:text-slate/40" />
                                </div>
                                <button type="button" onClick={() => splitFillRemaining(m.value)} className="font-mono text-[9px] uppercase text-slate hover:text-azure px-1.5 shrink-0">Kalan</button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-2xl bg-ink p-3">
                            <div className="flex items-center justify-between mb-1.5 px-1">
                              <label className="font-mono text-[10px] uppercase tracking-wide text-cream/50">Alınan Tutar</label>
                              {amountLocked && <span className="font-mono text-[9px] text-cream/40 normal-case">seçili ürünlerden</span>}
                            </div>
                            <div className="flex items-center gap-2 bg-black/25 rounded-xl px-3">
                              <span className="font-mono text-xl text-cream/40">₺</span>
                              <input type="number" min="0" step="0.01" inputMode="decimal" value={amount} disabled={amountLocked} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
                                className="w-full bg-transparent border-0 py-2.5 min-h-[2.75rem] font-mono text-3xl tabular-nums text-cream font-semibold focus:outline-none focus:ring-0 placeholder:text-cream/25 disabled:opacity-60" />
                            </div>
                            {/* Hızlı tutar tuşları */}
                            <div className="grid grid-cols-5 gap-2 mt-3">
                              <button type="button" disabled={amountLocked} onClick={quickExact}
                                className="font-mono text-[10px] uppercase tracking-wide min-h-[2.75rem] rounded-lg bg-ember text-cream shadow-[0_2px_0_0_rgba(0,0,0,0.35)] hover:bg-ember/90 active:shadow-none active:translate-y-[2px] transition-all disabled:opacity-30 disabled:pointer-events-none">Tam</button>
                              {QUICK_AMOUNTS.map((q) => (
                                <button key={q.label} type="button" disabled={amountLocked} onClick={() => quickAdd(q.delta)}
                                  className="font-mono text-xs uppercase tracking-wide min-h-[2.75rem] rounded-lg bg-white/10 text-cream shadow-[0_2px_0_0_rgba(0,0,0,0.35)] hover:bg-white/15 active:shadow-none active:translate-y-[2px] transition-all disabled:opacity-30 disabled:pointer-events-none">{q.label}</button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Bahşiş + İndirim (kompakt) */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex items-center gap-1.5 bg-panel rounded-lg px-3 border border-hairline focus-within:border-ember">
                            <span className="font-mono text-[10px] uppercase text-slate shrink-0" title={orderData?.TipAmount > 0 ? 'Müşterinin QR menüden seçtiği bahşiş — değiştirilebilir/kaldırılabilir' : undefined}>
                              Bahşiş ₺{orderData?.TipAmount > 0 ? ' · müşteri' : ''}
                            </span>
                            <input type="number" min="0" step="0.01" inputMode="decimal" value={tip} onChange={(e) => setTip(e.target.value)} placeholder="0.00"
                              className="w-full bg-transparent border-0 py-2 font-mono text-sm text-paper text-right focus:outline-none focus:ring-0 placeholder:text-slate/40" />
                          </div>
                          <div className={`flex items-center gap-1.5 rounded-lg px-3 border ${canDiscount ? 'bg-panel border-hairline focus-within:border-ember' : 'bg-panel/50 border-hairline opacity-50'}`}>
                            <span className="font-mono text-[10px] uppercase text-slate shrink-0">İndirim ₺</span>
                            <input type="number" min="0" step="0.01" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0.00"
                              disabled={!canDiscount} title={!canDiscount ? 'İndirim yetkisi yok (Kasiyer/Admin)' : undefined}
                              className="w-full bg-transparent border-0 py-2 font-mono text-sm text-paper text-right focus:outline-none focus:ring-0 placeholder:text-slate/40 disabled:cursor-not-allowed" />
                          </div>
                        </div>

                        {error && <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 bg-panel py-2 rounded-r-lg" style={{ animation: 'pdFadeIn 0.2s ease-out' }}>{error}</p>}
                        {successMsg && <p className="text-moss text-sm font-medium border-l-2 border-moss pl-3 bg-panel py-2 rounded-r-lg" style={{ animation: 'pdFadeIn 0.2s ease-out' }}>{successMsg}</p>}
                      </div>

                      {/* Onay butonu */}
                      <footer className="px-5 py-4 border-t border-hairline shrink-0 bg-panel/80 backdrop-blur-md">
                        <button
                          type="button"
                          onClick={confirmPayment}
                          disabled={!isValid || submitting}
                          className="w-full flex items-center justify-center gap-2 font-mono text-sm uppercase tracking-wide text-cream bg-ember hover:bg-ember/90 active:bg-ember/80 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl px-6 py-4 min-h-[3.5rem] transition-all shadow-lg shadow-ember/20 active:translate-y-[1px]"
                        >
                          {submitting ? 'İşleniyor…' : (
                            <>
                              <span>Ödemeyi Onayla</span>
                              <span className="tabular-nums">— {money(appliedAmount)}</span>
                              <span className="hidden sm:inline font-mono text-[10px] text-cream/60 border border-cream/20 rounded px-1.5 py-0.5 ml-1">↵</span>
                            </>
                          )}
                        </button>
                      </footer>
                    </>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
