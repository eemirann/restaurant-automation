import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client, { imageUrl } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { ROLE_LABELS, homeFor } from '../constants/roles';

const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'];

const initials = (fullName) =>
  fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

export default function Login() {
  // Varsayılan giriş yöntemi kullanıcı adı + şifre. PIN, tablet/kasa için
  // ikincil yol olarak duruyor ('PIN ile giriş' bağlantısı).
  const [mode, setMode] = useState('password');
  const { login, loginWithPin, error, loading } = useAuth();
  const { RestaurantName, LogoUrl } = useSettings();
  const navigate = useNavigate();

  // Giriş sonrası rolün açılış sayfasına git (Panel yalnızca yöneticide).
  const goHome = (user) => navigate(homeFor(user.role), { replace: true });

  return (
    <div className="min-h-screen bg-charcoal flex items-center justify-center px-4 font-body relative overflow-hidden">
      {/* Premium arka plan dokusu */}
      <div
        className="absolute inset-0 opacity-[0.4] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(rgb(var(--color-paper) / .05) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />
      <div
        className="absolute w-[560px] h-[560px] rounded-full pointer-events-none"
        style={{
          top: '-220px',
          right: '-160px',
          background: 'radial-gradient(circle, rgba(255,71,19,.14), transparent 65%)',
        }}
      />

      <div className="relative w-full max-w-md">
        <div className="bg-panel border border-hairline rounded-2xl shadow-lg overflow-hidden">
          {/* Marka başlığı */}
          <div className="px-8 pt-9 pb-7 text-center border-b border-hairline bg-gradient-to-b from-hairline/60 to-panel">
            {LogoUrl ? (
              <img
                src={imageUrl(LogoUrl)}
                alt={RestaurantName || 'Restoran'}
                className="w-14 h-14 mx-auto rounded-2xl object-contain mb-4 shadow-sm bg-panel"
              />
            ) : (
              <div
                className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center font-display font-bold text-xl text-cream mb-4 shadow-sm"
                style={{ background: 'linear-gradient(145deg, rgb(var(--color-ember)), #C23000)' }}
              >
                {(RestaurantName || 'R').trim()[0]?.toLocaleUpperCase('tr-TR')}
              </div>
            )}
            <p className="font-mono text-[11px] tracking-[0.3em] text-slate uppercase mb-1.5">
              Personel Girişi
            </p>
            <h1 className="font-display text-2xl font-semibold text-paper">{RestaurantName || 'Restoran'} Panel</h1>
          </div>

          {mode === 'password' ? (
            <PasswordForm
              login={login}
              error={error}
              loading={loading}
              onSuccess={goHome}
              onUsePin={() => setMode('pin')}
            />
          ) : (
            <PinForm
              loginWithPin={loginWithPin}
              error={error}
              loading={loading}
              onSuccess={goHome}
              onUsePassword={() => setMode('password')}
            />
          )}
        </div>

        <p className="text-center text-slate text-xs mt-5 font-mono">
          Kasiyer · Garson · Mutfak · Admin erişimi
        </p>
      </div>
    </div>
  );
}

// ============================================================
// KULLANICI ADI + ŞİFRE (varsayılan)
// ============================================================
function PasswordForm({ login, error, loading, onSuccess, onUsePin }) {
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (loading) return;
    if (!userName.trim() || !password) {
      setLocalError('Kullanıcı adı ve şifre zorunludur.');
      return;
    }
    setLocalError('');
    const user = await login(userName.trim(), password);
    if (user) onSuccess(user);
    else setPassword('');
  };

  return (
    <form onSubmit={submit} className="px-8 py-8 space-y-4">
      <div>
        <label className="block font-mono text-[10px] uppercase tracking-wide text-slate mb-1.5">
          Kullanıcı Adı
        </label>
        <input
          autoFocus
          type="text"
          autoComplete="username"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          className="w-full border border-hairline rounded-lg px-3 py-3 font-body text-sm text-paper bg-charcoal
                     focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
        />
      </div>

      <div>
        <label className="block font-mono text-[10px] uppercase tracking-wide text-slate mb-1.5">
          Şifre
        </label>
        <div className="flex items-stretch gap-2">
          <input
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-hairline rounded-lg px-3 py-3 font-body text-sm text-paper bg-charcoal
                       focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            title={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
            className="shrink-0 px-3 border border-hairline rounded-lg text-slate hover:text-paper hover:border-ember transition-colors"
          >
            {showPassword ? '🙈' : '👁'}
          </button>
        </div>
      </div>

      {(localError || error) && (
        <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3">{localError || error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full font-mono text-sm uppercase tracking-wide text-cream bg-ember hover:bg-ember/90
                   disabled:opacity-50 rounded-xl py-4 min-h-[3.25rem] transition-colors active:translate-y-[1px]"
      >
        {loading ? 'Giriş yapılıyor…' : 'Giriş Yap'}
      </button>

      <button
        type="button"
        onClick={onUsePin}
        className="w-full font-mono text-xs uppercase tracking-wide text-slate hover:text-ember transition-colors pt-1"
      >
        PIN ile giriş →
      </button>
    </form>
  );
}

// ============================================================
// PIN İLE GİRİŞ — personel kartı seç + 4 haneli PIN
// ============================================================
function PinForm({ loginWithPin, error, loading, onSuccess, onUsePassword }) {
  const [staff, setStaff] = useState([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffError, setStaffError] = useState('');
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);

  useEffect(() => {
    client
      .get('/auth/staff')
      .then((res) => setStaff(res.data))
      .catch(() => setStaffError('Personel listesi getirilemedi.'))
      .finally(() => setStaffLoading(false));
  }, []);

  const pressKey = async (key) => {
    if (loading) return;

    if (key === 'C') {
      setPin('');
      return;
    }
    if (key === '⌫') {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (pin.length >= 4) return;

    const nextPin = pin + key;
    setPin(nextPin);

    if (nextPin.length === 4) {
      const user = await loginWithPin(selected.UserId, nextPin);
      if (user) {
        onSuccess(user);
      } else {
        setShake(true);
        setTimeout(() => setShake(false), 400);
        setPin('');
      }
    }
  };

  return (
    <div className={`px-8 py-8 transition-transform ${shake ? 'animate-[shake_.4s]' : ''}`}>
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-6px); }
          40%, 80% { transform: translateX(6px); }
        }
      `}</style>

      {!selected ? (
        <>
          <p className="font-mono text-xs uppercase tracking-wide text-slate mb-4 text-center">
            Devam etmek için personelinizi seçin
          </p>

          {staffLoading ? (
            <p className="text-slate font-mono text-sm text-center py-6">Yükleniyor...</p>
          ) : staffError ? (
            <p className="text-ember text-sm font-medium text-center py-6">{staffError}</p>
          ) : staff.length === 0 ? (
            <p className="text-slate font-mono text-sm text-center py-6">
              PIN tanımlı aktif personel bulunamadı.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {staff.map((s) => (
                <button
                  key={s.UserId}
                  onClick={() => { setSelected(s); setPin(''); }}
                  className="flex flex-col items-center gap-2 border border-hairline rounded-xl py-5 px-3
                             hover:border-ember hover:shadow-md hover:-translate-y-0.5 transition-all"
                >
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center font-display font-semibold text-cream"
                    style={{ background: 'linear-gradient(145deg, #FF4713, #C23000)' }}
                  >
                    {initials(s.FullName)}
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-paper leading-tight">{s.FullName}</p>
                    <p className="font-mono text-[10px] uppercase tracking-wide text-slate mt-0.5">
                      {ROLE_LABELS[s.Role] || s.Role}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={onUsePassword}
            className="w-full font-mono text-xs uppercase tracking-wide text-slate hover:text-ember transition-colors pt-6"
          >
            ← Kullanıcı adı & şifre ile giriş
          </button>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => { setSelected(null); setPin(''); }}
              className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full border border-hairline
                         text-slate hover:text-ember hover:border-ember transition-colors"
              title="Geri"
            >
              ←
            </button>
            <div
              className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center font-display font-semibold text-cream"
              style={{ background: 'linear-gradient(145deg, #FF4713, #C23000)' }}
            >
              {initials(selected.FullName)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-paper truncate">{selected.FullName}</p>
              <p className="font-mono text-[10px] uppercase tracking-wide text-slate">
                {ROLE_LABELS[selected.Role] || selected.Role}
              </p>
            </div>
          </div>

          <p className="font-mono text-xs uppercase tracking-wide text-slate mb-4 text-center">
            PIN kodunuzu girin
          </p>

          {/* PIN göstergesi */}
          <div className="flex items-center justify-center gap-3 mb-7">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full border-2 transition-colors ${
                  i < pin.length ? 'bg-ember border-ember' : 'border-hairline bg-transparent'
                }`}
              />
            ))}
          </div>

          {error && <p className="text-ember text-sm font-medium text-center mb-4">{error}</p>}

          {/* Numerik tuş takımı */}
          <div className="grid grid-cols-3 gap-3">
            {KEYPAD.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => pressKey(key)}
                disabled={loading}
                className={`h-14 rounded-xl font-display text-lg font-medium transition-colors
                            disabled:opacity-40 disabled:cursor-not-allowed
                            ${
                              key === 'C' || key === '⌫'
                                ? 'text-slate hover:text-ember bg-hairline/60 hover:bg-charcoal'
                                : 'text-paper bg-hairline/60 hover:bg-charcoal hover:text-ember'
                            }`}
              >
                {key}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
