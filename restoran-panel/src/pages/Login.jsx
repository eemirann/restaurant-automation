import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const { login, error, loading } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const success = await login(userName, password);
    if (success) navigate('/');
  };

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4 font-body">
      <div className="w-full max-w-sm">

        {/* Fiş üstü kesim efekti */}
        <div className="bg-ink text-cream rounded-t-sm px-8 pt-8 pb-6 text-center relative overflow-hidden">
          <div
            className="absolute top-0 left-0 right-0 h-2"
            style={{
              backgroundImage:
                'radial-gradient(circle at 6px 0px, transparent 6px, #F7F4EE 6px)',
              backgroundSize: '12px 12px',
              backgroundPosition: 'top',
            }}
          />
          <p className="font-mono text-xs tracking-[0.3em] text-sand/70 uppercase mb-2">
            Personel Girişi
          </p>
          <h1 className="font-display text-3xl font-semibold">Restoran Panel</h1>
        </div>

        {/* Form gövdesi */}
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-sand rounded-b-sm px-8 py-8 space-y-5 shadow-sm"
        >
          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
              Kullanıcı Adı
            </label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              required
              autoFocus
              className="w-full border border-sand rounded-sm px-3 py-2.5 font-body text-ink
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember
                         transition-colors"
              placeholder="ör. admin1"
            />
          </div>

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
              Şifre
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border border-sand rounded-sm px-3 py-2.5 font-body text-ink
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember
                         transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-ember text-cream font-semibold py-2.5 rounded-sm
                       hover:bg-ember/90 active:scale-[0.99] transition-all
                       disabled:opacity-50 disabled:cursor-not-allowed font-body"
          >
            {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>

        <p className="text-center text-slate text-xs mt-4 font-mono">
          Kasiyer · Garson · Admin erişimi
        </p>
      </div>
    </div>
  );
}
