import { useState, useCallback, useEffect } from 'react';
import client from '../api/client';

const STORAGE_KEY = 'loyaltyAccount'; // { username } — sadece kullanıcı adı saklanır, PIN ASLA

// ============================================================
// Cihazda hatırlanan sadakat hesabı. QR ilk okutulduğunda opsiyonel
// giriş/kayıt sunulur (bkz. components/LoyaltyGate.jsx); kullanıcı adı
// localStorage'a yazılır, PIN bir daha sorulmaz — sonraki ziyaretlerde
// bakiye sessizce (arka planda) tazelenir. Backend PIN'i asla
// döndürmez, sadece Username+LoyaltyPoints (bkz. controllers/
// publicMenuController.js: registerLoyaltyAccount/loginLoyaltyAccount).
// ============================================================
export function useLoyaltyAccount(qrToken) {
  const [account, setAccount] = useState(null); // { username, points }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    let username;
    try { ({ username } = JSON.parse(saved)); } catch { return; }
    if (!username) return;

    let active = true;
    client.get(`/public/menu/${qrToken}/loyalty/${encodeURIComponent(username)}`)
      .then((res) => { if (active) setAccount({ username: res.data.Username, points: res.data.LoyaltyPoints }); })
      .catch(() => { if (active) localStorage.removeItem(STORAGE_KEY); });
    return () => { active = false; };
  }, [qrToken]);

  const persist = (username, points) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ username }));
    setAccount({ username, points });
  };

  const register = useCallback(async (username, pin) => {
    setLoading(true);
    setError('');
    try {
      const res = await client.post(`/public/menu/${qrToken}/loyalty/register`, { Username: username, Pin: pin });
      persist(res.data.Username, res.data.LoyaltyPoints);
      return true;
    } catch (err) {
      setError(err.response?.data?.error || 'Hesap oluşturulamadı.');
      return false;
    } finally {
      setLoading(false);
    }
  }, [qrToken]);

  const login = useCallback(async (username, pin) => {
    setLoading(true);
    setError('');
    try {
      const res = await client.post(`/public/menu/${qrToken}/loyalty/login`, { Username: username, Pin: pin });
      persist(res.data.Username, res.data.LoyaltyPoints);
      return true;
    } catch (err) {
      setError(err.response?.data?.error || 'Giriş yapılamadı.');
      return false;
    } finally {
      setLoading(false);
    }
  }, [qrToken]);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setAccount(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!account?.username) return;
    try {
      const res = await client.get(`/public/menu/${qrToken}/loyalty/${encodeURIComponent(account.username)}`);
      setAccount({ username: res.data.Username, points: res.data.LoyaltyPoints });
    } catch {
      // sessiz — banner/kart eski değeri göstermeye devam eder
    }
  }, [qrToken, account?.username]);

  return { account, loading, error, register, login, logout, refresh, clearError: () => setError('') };
}
