import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import client from '../api/client';
import { getSocket } from '../api/socket';
import { useAuth } from './AuthContext';

// Vardiya kaydı tutulan roller (kasa/servis/mutfak). Yönetici (Admin) muaf —
// gözetim/override yapar, kendi kasası olmadan panele erişebilir.
//
// ÖNEMLİ — VARDİYA = OTURUM: Bu rollere kasa açılış/kapanış tutarı
// SORULMAZ. Vardiya giriş yapılır yapılmaz 0 açılış kasasıyla otomatik
// açılır, çıkışta sayım istenmeden sessizce kapatılır. Personelin vardiyayı
// elle açması/kapatması diye bir akış YOKTUR (bkz. pages/Shifts.jsx —
// o ekran artık salt görüntüleme).
//
// Kayıt yalnızca MESAİ TAKİBİ için tutulur (Vardiya / Aktif Vardiya
// ekranlarında süre görünür). Nakit sayımı gerektiğinde YÖNETİCİ, Aktif
// Vardiya ekranından sayım girerek kapatır — kasa mutabakatı yeteneği
// oradadır, personelde değil.
export const SHIFT_ROLES = ['Cashier', 'Waiter', 'Kitchen'];

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
    const res = await client.post('/shifts/close', {
      CountedCash: typeof CountedCash === 'number' ? CountedCash : undefined,
      Note: Note || undefined,
    });
    setShift(null);
    return res.data;
  }, []);

  // ============================================================
  // OTOMATİK VARDİYA AÇILIŞI — OTURUM BAŞINA TEK KEZ.
  //
  // Vardiya = oturum: girişte açılır, çıkışta kapanır (bkz. Layout.jsx >
  // handleLogout). Arada BAŞKA HİÇBİR ŞEY vardiya açmaz.
  //
  // Tetikleyici neden 'shift' DEĞİL de kullanıcı kimliği: efekt "vardiya
  // yok" durumuna tepki verseydi, vardiyanın BİLEREK kapatıldığı her anı
  // da "eksik" sayıp yeniden açardı. Bu üç yeri bozuyordu:
  //   1) Çıkış — handleLogout önce closeShift() çağırıyor, sonra
  //      /auth/logout isteğini BEKLİYOR; o bekleme sırasında shift null
  //      ama user hâlâ dolu olduğu için her çıkışta boşta bir vardiya
  //      açılıp kalıyordu.
  //   2) Vardiya ekranından kapatma — Shifts.jsx context'i kullanmadan
  //      doğrudan POST atıyor; 20 sn'lik refresh shift'i null yapınca
  //      vardiya kendiliğinden geri açılıyordu.
  //   3) Yöneticinin zorla kapatması (ActiveShifts.jsx) — aynı şekilde
  //      kasiyerin istemcisi tarafından geri alınıyordu.
  //
  // Bu yüzden 'oturum başına en fazla bir açılış denemesi' kuralına
  // bağlandı: ref o oturumda denendiğini tutar, çıkışta (user null) sıfırlanır.
  // ============================================================
  const otomatikAcilanKullanici = useRef(null);
  useEffect(() => {
    // Çıkış: bir sonraki giriş yeniden açabilsin diye işaret sıfırlanır.
    if (!user) { otomatikAcilanKullanici.current = null; return undefined; }

    // İlk refresh bitmeden karar verilemez (zaten açık vardiya olabilir).
    if (loading) return undefined;

    // Bu oturumda denendi — shift sonradan null olsa bile bir daha açma.
    if (otomatikAcilanKullanici.current === user.userId) return undefined;
    otomatikAcilanKullanici.current = user.userId;

    if (!SHIFT_ROLES.includes(user.role) || shift) return undefined;

    // Ağ/sunucu hatasında sınırlı sayıda yeniden dener. Efekt bir daha
    // tetiklenmeyeceği için (ref işaretlendi) tek şans burada.
    let iptal = false;
    (async () => {
      for (let deneme = 0; deneme < 3 && !iptal; deneme++) {
        try {
          await openShift(0);
          return;
        } catch (err) {
          // 409 = sunucuda zaten açık vardiya var (ör. başka bir cihazdan
          // giriş yapılmış). Açmaya çalışmak yerine mevcut olanı çekeriz.
          if (err?.response?.status === 409) { await refresh(); return; }
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    })();
    return () => { iptal = true; };
  }, [user, loading, shift, openShift, refresh]);

  return (
    <ShiftContext.Provider value={{ shift, loading, refresh, openShift, closeShift }}>
      {children}
    </ShiftContext.Provider>
  );
}

export function useShift() {
  return useContext(ShiftContext);
}
