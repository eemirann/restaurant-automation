import { createContext, useContext, useState } from 'react';
import client from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Ortak oturum kurma — başarıda kullanıcı nesnesini döner (rol'e göre
  // açılış sayfasına yönlendirmek için gerekli), başarısızlıkta null.
  const authenticate = async (path, body) => {
    setError('');
    setLoading(true);
    try {
      const res = await client.post(path, body);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      setUser(res.data.user);
      return res.data.user;
    } catch (err) {
      setError(err.response?.data?.message || 'Giriş yapılamadı.');
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Kullanıcı adı + şifre (bkz. controllers/authController.js > login)
  const login = (userName, password) =>
    authenticate('/auth/login', { UserName: userName, Password: password });

  // PIN ile hızlı giriş (tablet/kasa) — personel kartından seçilerek
  const loginWithPin = (userId, pin) =>
    authenticate('/auth/login-pin', { UserId: userId, Pin: pin });

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, loginWithPin, logout, error, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
