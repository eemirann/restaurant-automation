import { useState } from 'react';
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
export default function StaffView({ tableNumber, status, onSendRequest, sending }) {
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
    </div>
  );
}
