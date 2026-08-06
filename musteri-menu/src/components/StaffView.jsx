import { useState } from 'react';
import client from '../api/client';
import { useLanguage } from '../i18n';

const QUICK_REQUEST_TYPES = [
  { type: 'RequestBill', labelKey: 'requestBill', icon: '🧾' },
  { type: 'AskForWater', labelKey: 'askForWater', icon: '💧' },
  { type: 'NeedNapkins', labelKey: 'needNapkins', icon: '🧻' },
  { type: 'ExtraCutlery', labelKey: 'extraCutlery', icon: '🍴' },
];

const ORDER_STATUS_KEYS = {
  Pending: { labelKey: 'statusPending', color: 'text-gold' },
  Approved: { labelKey: 'statusApproved', color: 'text-success' },
  Rejected: { labelKey: 'statusRejected', color: 'text-danger' },
};

const SERVICE_TYPE_KEYS = {
  CallWaiter: 'serviceCallWaiter',
  RequestBill: 'serviceRequestBill',
  AskForWater: 'serviceAskForWater',
  NeedNapkins: 'serviceNeedNapkins',
  ExtraCutlery: 'serviceExtraCutlery',
};

// Personel çağırma + hızlı istekler + sipariş/istek durumu. Beyaz/premium
// tasarım dili — restoran-panel'in koyu POS temasından bağımsız.
export default function StaffView({ qrToken, tableNumber, status, onSendRequest, sending, loyalty }) {
  const { t } = useLanguage();
  const [justSent, setJustSent] = useState(null);

  const send = async (type) => {
    setJustSent(type);
    await onSendRequest(type);
    setTimeout(() => setJustSent(null), 2000);
  };

  const orderCfg = status?.lastOrderRequest ? ORDER_STATUS_KEYS[status.lastOrderRequest.Status] : null;

  return (
    <div className="px-5 pt-6 pb-4">
      <p className="text-[11px] uppercase tracking-[0.25em] text-gold font-semibold mb-1.5">{t('table', { n: tableNumber })}</p>
      <h1 className="font-display text-3xl font-semibold text-ink mb-5 leading-tight">{t('needAHand')}</h1>

      <button
        type="button"
        disabled={sending}
        onClick={() => send('CallWaiter')}
        className="w-full flex flex-col items-center justify-center gap-1.5 rounded-3xl bg-ink
                   py-7 mb-5 disabled:opacity-50 transition-colors hover:bg-ink/90 shadow-lift"
      >
        <span className="text-4xl">🔔</span>
        <span className="text-sm uppercase tracking-[0.2em] text-paper font-semibold">
          {justSent === 'CallWaiter' ? t('waiterCalled') : t('callWaiter')}
        </span>
        <span className="text-[11px] text-paper/60">{t('staffComing')}</span>
      </button>

      <p className="text-[11px] uppercase tracking-[0.2em] text-muted font-semibold mb-2.5">{t('quickRequests')}</p>
      <div className="grid grid-cols-2 gap-2.5 mb-7">
        {QUICK_REQUEST_TYPES.map((q) => (
          <button
            key={q.type}
            type="button"
            disabled={sending}
            onClick={() => send(q.type)}
            className="flex items-center gap-2.5 rounded-2xl bg-white shadow-card px-3.5 py-4
                       disabled:opacity-50 hover:shadow-lift transition-shadow"
          >
            <span className="text-xl">{q.icon}</span>
            <span className="text-xs text-ink font-medium text-left">
              {justSent === q.type ? t('sent') : t(q.labelKey)}
            </span>
          </button>
        ))}
      </div>

      {(status?.lastOrderRequest || status?.pendingServiceRequests?.length > 0) && (
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted font-semibold mb-2.5">{t('orderStatus')}</p>
          <div className="space-y-2.5">
            {status?.lastOrderRequest && (
              <div className="rounded-2xl bg-white shadow-card p-4">
                <p className={`text-sm font-semibold ${orderCfg?.color || 'text-ink'}`}>
                  {orderCfg ? t(orderCfg.labelKey) : status.lastOrderRequest.Status}
                </p>
                {status.lastOrderRequest.Status === 'Rejected' && status.lastOrderRequest.RejectionReason && (
                  <p className="text-xs text-muted mt-1">{status.lastOrderRequest.RejectionReason}</p>
                )}
              </div>
            )}
            {(status?.pendingServiceRequests || []).map((r) => (
              <div key={r.ServiceRequestId} className="rounded-2xl bg-white shadow-card p-4 flex items-center justify-between">
                <span className="text-xs text-muted">{SERVICE_TYPE_KEYS[r.Type] ? t(SERVICE_TYPE_KEYS[r.Type]) : r.Type}</span>
                <span className="text-[11px] uppercase tracking-wide text-gold font-semibold">{t('waitingStatus')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {loyalty?.account ? (
        <LoggedInPointsCard loyalty={loyalty} t={t} />
      ) : (
        <LoyaltyBalanceCard qrToken={qrToken} t={t} />
      )}
      <FeedbackCard qrToken={qrToken} t={t} />
    </div>
  );
}

// ============================================================
// Giriş yapılmışsa: bakiye zaten hooks/useLoyaltyAccount.js tarafından
// tutuluyor, tekrar kullanıcı adı sormaya gerek yok — sadece göster +
// çıkış seçeneği sun.
// ============================================================
function LoggedInPointsCard({ loyalty, t }) {
  return (
    <div className="mt-7">
      <p className="text-[11px] uppercase tracking-[0.2em] text-muted font-semibold mb-2.5">{t('myPointsTitle')}</p>
      <div className="rounded-2xl bg-white shadow-card p-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-ink font-semibold">{loyalty.account.username}</p>
          <p className="font-display text-lg font-semibold text-gold">{t('loyaltyPointsShort', { points: loyalty.account.points })}</p>
        </div>
        <button
          type="button"
          onClick={loyalty.logout}
          className="text-xs uppercase tracking-[0.15em] font-semibold text-muted hover:text-danger transition-colors"
        >
          {t('loyaltyLogout')}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// "Puanlarım" kartı — müşteri kullanıcı adını yazıp kendi sadaklık puan
// bakiyesini görebilir (bkz. backend: getPublicMenuLoyaltyBalance).
// Sadece hesaba giriş YAPILMAMIŞSA gösterilir (bkz. yukarıdaki
// LoggedInPointsCard) — PIN'siz eski usul müşteriler için hâlâ çalışır.
// ============================================================
function LoyaltyBalanceCard({ qrToken, t }) {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const checkBalance = async () => {
    const trimmed = username.trim();
    if (!trimmed) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await client.get(`/public/menu/${qrToken}/loyalty/${encodeURIComponent(trimmed)}`);
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || t('loyaltyLookupError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-7">
      <p className="text-[11px] uppercase tracking-[0.2em] text-muted font-semibold mb-2.5">{t('myPointsTitle')}</p>
      <div className="rounded-2xl bg-white shadow-card p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t('usernamePlaceholder')}
            maxLength={50}
            className="flex-1 border border-line rounded-2xl px-4 py-2.5 bg-cream text-ink text-sm placeholder:text-muted
                       focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold"
          />
          <button
            type="button"
            disabled={loading || !username.trim()}
            onClick={checkBalance}
            className="text-xs uppercase tracking-[0.15em] font-semibold text-paper bg-ink hover:bg-ink/90
                       disabled:opacity-50 rounded-full px-4 py-2.5 transition-colors shrink-0"
          >
            {loading ? t('loading') : t('checkBalance')}
          </button>
        </div>
        {error && <p className="text-danger text-xs font-medium mt-2.5">{error}</p>}
        {result && (
          <p className="text-sm text-ink mt-2.5">
            {t('pointsBalanceLabel', { username: result.Username })}: <span className="font-display text-lg font-semibold text-gold">{result.LoyaltyPoints}</span>
          </p>
        )}
      </div>
    </div>
  );
}

const FEEDBACK_CATEGORIES = [
  { key: 'TasteRating', labelKey: 'feedbackTaste' },
  { key: 'ServiceRating', labelKey: 'feedbackService' },
  { key: 'CleanlinessRating', labelKey: 'feedbackCleanliness' },
];
const FEEDBACK_EMOJIS = [
  { value: 1, emoji: '😞' },
  { value: 2, emoji: '😐' },
  { value: 3, emoji: '😄' },
];

// ============================================================
// "Deneyiminizi Değerlendir" kartı — 3 kategori (Lezzet/Hizmet/Temizlik),
// her biri 1-3 arası emoji puanı (bkz. backend: createFeedback). Anonim,
// tekrar gönderim engeli sadece client-side (bu oturumda tekrar gösterme).
// ============================================================
function FeedbackCard({ qrToken, t }) {
  const [ratings, setRatings] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const setRating = (key, value) => setRatings((prev) => ({ ...prev, [key]: value }));
  const complete = FEEDBACK_CATEGORIES.every((c) => ratings[c.key]);

  const submit = async () => {
    if (!complete || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await client.post(`/public/menu/${qrToken}/feedback`, ratings);
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.error || t('feedbackSendError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-7">
      <p className="text-[11px] uppercase tracking-[0.2em] text-muted font-semibold mb-2.5">{t('feedbackTitle')}</p>
      <div className="rounded-2xl bg-white shadow-card p-4">
        {sent ? (
          <p className="text-sm text-ink text-center py-2">{t('feedbackThanks')}</p>
        ) : (
          <>
            <div className="space-y-3">
              {FEEDBACK_CATEGORIES.map((c) => (
                <div key={c.key} className="flex items-center justify-between">
                  <span className="text-sm text-ink font-medium">{t(c.labelKey)}</span>
                  <div className="flex gap-1.5">
                    {FEEDBACK_EMOJIS.map((f) => (
                      <button
                        key={f.value}
                        type="button"
                        onClick={() => setRating(c.key, f.value)}
                        className={`w-9 h-9 flex items-center justify-center text-xl rounded-full border transition-colors ${
                          ratings[c.key] === f.value ? 'border-gold bg-gold/10' : 'border-line'
                        }`}
                      >
                        {f.emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {error && <p className="text-danger text-xs font-medium mt-2.5">{error}</p>}
            <button
              type="button"
              disabled={!complete || submitting}
              onClick={submit}
              className="w-full mt-3.5 text-sm uppercase tracking-[0.15em] font-semibold text-paper bg-ink hover:bg-ink/90
                         disabled:opacity-50 rounded-full px-4 py-3 transition-colors"
            >
              {submitting ? t('sending') : t('sendFeedback')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
