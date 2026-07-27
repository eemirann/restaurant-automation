import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import client from '../api/client';
import { getSocket } from '../api/socket';
import { useAuth } from './AuthContext';

// Vardiya açması gereken roller (kasa/servis). Yönetici (Admin) muaf —
// gözetim/override yapar, kendi kasası olmadan panele erişebilir.
export const SHIFT_ROLES = ['Cashier', 'Waiter'];

const ShiftContext = createContext(null);

export function ShiftProvider({ children }) {
  const { user } = useAuth();
  const [shift, setShift] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setShift(null); setLoading(false); return null; }
    try {
      const res = await client.get('/shifts/current');
      const s = res.data.shift;
      // Süreyi istemci saatine sabitle (saat dilimi bağımsız): sunucudan gelen
      // ElapsedSeconds ile başlangıç anını istemci saatine göre yeniden kur.
      if (s && typeof s.ElapsedSeconds === 'number') {
        s.startedAtClient = Date.now() - s.ElapsedSeconds * 1000;
      }
      setShift(s);
      return s;
    } catch {
      return undefined; // ağ hatası: mevcut durumu koru
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { setLoading(true); refresh(); }, [refresh]);

  // Periyodik + gerçek zamanlı tazeleme (beklenen nakit / satış / sipariş canlı kalsın,
  // yönetici zorla kapatınca kasiyer de fark etsin).
  useEffect(() => {
    if (!user) return undefined;
    const i = setInterval(refresh, 20000);
    const socket = getSocket();
    const h = () => refresh();
    if (socket) { socket.on('tables:changed', h); socket.on('connect', h); }
    return () => {
      clearInterval(i);
      if (socket) { socket.off('tables:changed', h); socket.off('connect', h); }
    };
  }, [user, refresh]);

  const openShift = useCallback(async (OpeningFloat, OpeningNote) => {
    const res = await client.post('/shifts/open', { OpeningFloat, OpeningNote: OpeningNote || undefined });
    await refresh();
    return res.data;
  }, [refresh]);

  const closeShift = useCallback(async (CountedCash, Note) => {
    const res = await client.post('/shifts/close', { CountedCash, Note: Note || undefined });
    setShift(null);
    return res.data;
  }, []);

  return (
    <ShiftContext.Provider value={{ shift, loading, refresh, openShift, closeShift }}>
      {children}
    </ShiftContext.Provider>
  );
}

export function useShift() {
  return useContext(ShiftContext);
}
