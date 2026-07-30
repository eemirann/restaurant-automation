import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getSocket } from '../api/socket';
import { playNotificationDing } from '../utils/notificationSound';

const MAX_EVENTS = 20;

// kds:new / kds:updated / customerRequests:new payload'larından kısa,
// okunabilir bir Türkçe açıklama üretir (bkz. config/socket.js, backend
// bu event'leri sadece "sinyal" olarak taşır — burada sadece gösterim amaçlı
// kısa bir özet çıkarılır, tek doğruluk kaynağı yine ilgili REST uçlarıdır).
function describeEvent(event, payload) {
  if (event === 'kds:new') {
    return payload?.tableId ? `Mutfağa yeni sipariş düştü · Masa ${payload.tableId}` : 'Mutfağa yeni sipariş düştü';
  }
  if (event === 'kds:updated') {
    return `Bir sipariş kaleminin durumu değişti${payload?.prepStatus ? ` · ${payload.prepStatus}` : ''}`;
  }
  if (event === 'customerRequests:new') {
    if (payload?.type === 'service') {
      return `Müşteriden hizmet isteği · Masa ${payload.tableNumber ?? payload.tableId ?? '—'}`;
    }
    return `Müşteriden yeni sipariş isteği · Masa ${payload.tableNumber ?? payload.tableId ?? '—'}`;
  }
  return event;
}

export default function NotificationCenter() {
  const [events, setEvents] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // 'tables:changed' bilerek dışarıda bırakılır — çok sık tetiklenir ve
    // bildirim listesini anlamsız şekilde doldurur (bkz. görev spesifikasyonu).
    const watched = ['kds:new', 'kds:updated', 'customerRequests:new'];

    const handlers = watched.map((event) => {
      const handler = (payload) => {
        setEvents((prev) => [
          { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, event, payload, at: Date.now(), text: describeEvent(event, payload) },
          ...prev,
        ].slice(0, MAX_EVENTS));
        setUnreadCount((n) => n + 1);

        if (event === 'kds:new' || event === 'customerRequests:new') {
          playNotificationDing();
        }
      };
      socket.on(event, handler);
      return { event, handler };
    });

    return () => {
      handlers.forEach(({ event, handler }) => socket.off(event, handler));
    };
  }, []);

  // Dışarı tıklayınca kapat
  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const toggleOpen = () => {
    setOpen((v) => !v);
    if (!open) setUnreadCount(0);
  };

  const timeAgo = (ts) => {
    const diffMin = Math.floor((Date.now() - ts) / 60000);
    if (diffMin < 1) return 'az önce';
    if (diffMin < 60) return `${diffMin} dk önce`;
    const diffHr = Math.floor(diffMin / 60);
    return `${diffHr} sa önce`;
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={toggleOpen}
        title="Bildirimler"
        className="relative w-9 h-9 flex items-center justify-center rounded-full text-slate hover:text-paper hover:bg-hairline/30 transition-colors"
      >
        <IconBell />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-ember text-cream text-[10px] font-mono font-semibold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-panel border border-hairline rounded-xl shadow-lg z-50"
          >
            <div className="px-4 py-3 border-b border-hairline">
              <p className="font-mono text-[10px] uppercase tracking-widest text-slate">Bildirimler</p>
            </div>
            {events.length === 0 ? (
              <p className="px-4 py-6 text-center font-mono text-xs text-slate">Henüz bildirim yok.</p>
            ) : (
              <ul>
                {events.map((e) => (
                  <li key={e.id} className="px-4 py-3 border-b border-hairline/60 last:border-b-0">
                    <p className="text-sm text-paper">{e.text}</p>
                    <p className="font-mono text-[10px] text-slate mt-0.5">{timeAgo(e.at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function IconBell() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
