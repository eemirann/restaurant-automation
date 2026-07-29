import { useState } from 'react';
import { useLanguage } from '../i18n';

const QUICK_REQUEST_TYPES = [
  { type: 'RequestBill', labelKey: 'requestBill', icon: '🧾' },
  { type: 'AskForWater', labelKey: 'askForWater', icon: '💧' },
  { type: 'NeedNapkins', labelKey: 'needNapkins', icon: '🧻' },
  { type: 'ExtraCutlery', labelKey: 'extraCutlery', icon: '🍴' },
];

const ORDER_STATUS_KEYS = {
  Pending: { labelKey: 'statusPending', color: 'text-amber-400' },
  Approved: { labelKey: 'statusApproved', color: 'text-moss' },
  Rejected: { labelKey: 'statusRejected', color: 'text-ember' },
};

const SERVICE_TYPE_KEYS = {
  CallWaiter: 'serviceCallWaiter',
  RequestBill: 'serviceRequestBill',
  AskForWater: 'serviceAskForWater',
  NeedNapkins: 'serviceNeedNapkins',
  ExtraCutlery: 'serviceExtraCutlery',
};

// Personel çağırma + hızlı istekler + sipariş/istek durumu — mockup'taki
// "At your service" ekranının karşılığı.
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
    <div className="px-4 pt-4 pb-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-ember mb-1">{t('table', { n: tableNumber })}</p>
      <h1 className="font-display text-2xl font-semibold text-paper mb-4">{t('needAHand')}</h1>

      <button
        type="button"
        disabled={sending}
        onClick={() => send('CallWaiter')}
        className="w-full flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-ember/40 bg-ember/10
                   py-6 mb-4 disabled:opacity-50 transition-colors hover:bg-ember/15"
      >
        <span className="text-4xl">🔔</span>
        <span className="font-mono text-sm uppercase tracking-wide text-ember font-semibold">
          {justSent === 'CallWaiter' ? t('waiterCalled') : t('callWaiter')}
        </span>
        <span className="font-mono text-[10px] text-slate">{t('staffComing')}</span>
      </button>

      <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-2">{t('quickRequests')}</p>
      <div className="grid grid-cols-2 gap-2 mb-6">
        {QUICK_REQUEST_TYPES.map((q) => (
          <button
            key={q.type}
            type="button"
            disabled={sending}
            onClick={() => send(q.type)}
            className="flex items-center gap-2 border border-hairline rounded-xl bg-panel px-3 py-3.5
                       disabled:opacity-50 hover:border-ember/40 transition-colors"
          >
            <span className="text-xl">{q.icon}</span>
            <span className="font-mono text-xs text-paper text-left">
              {justSent === q.type ? t('sent') : t(q.labelKey)}
            </span>
          </button>
        ))}
      </div>

      {(status?.lastOrderRequest || status?.pendingServiceRequests?.length > 0) && (
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-2">{t('orderStatus')}</p>
          <div className="space-y-2">
            {status?.lastOrderRequest && (
              <div className="border border-hairline rounded-xl bg-panel p-3">
                <p className={`font-mono text-sm font-semibold ${orderCfg?.color || 'text-paper'}`}>
                  {orderCfg ? t(orderCfg.labelKey) : status.lastOrderRequest.Status}
                </p>
                {status.lastOrderRequest.Status === 'Rejected' && status.lastOrderRequest.RejectionReason && (
                  <p className="text-xs text-slate mt-1">{status.lastOrderRequest.RejectionReason}</p>
                )}
              </div>
            )}
            {(status?.pendingServiceRequests || []).map((r) => (
              <div key={r.ServiceRequestId} className="border border-hairline rounded-xl bg-panel p-3 flex items-center justify-between">
                <span className="font-mono text-xs text-slate">{SERVICE_TYPE_KEYS[r.Type] ? t(SERVICE_TYPE_KEYS[r.Type]) : r.Type}</span>
                <span className="font-mono text-[10px] uppercase text-amber-400">{t('waitingStatus')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
