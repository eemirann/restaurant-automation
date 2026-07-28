import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';

const ROLE_LABELS = {
  Admin: 'Yönetici',
  Cashier: 'Kasiyer',
  Waiter: 'Garson',
};

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
  const [staff, setStaff] = useState([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffError, setStaffError] = useState('');
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);
  const { loginWithPin, error, loading } = useAuth();
  const { RestaurantName } = useSettings();
  const navigate = useNavigate();

  useEffect(() => {
    client
      .get('/auth/staff')
      .then((res) => setStaff(res.data))
      .catch(() => setStaffError('Personel listesi getirilemedi.'))
      .finally(() => setStaffLoading(false));
  }, []);

  const selectUser = (user) => {
    setSelected(user);
    setPin('');
  };

  const backToStaff = () => {
    setSelected(null);
    setPin('');
  };

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
      const success = await loginWithPin(selected.UserId, nextPin);
      if (success) {
        navigate('/');
      } else {
        setShake(true);
        setTimeout(() => setShake(false), 400);
        setPin('');
      }
    }
  };

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
            <div
              className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center font-display font-bold text-xl text-cream mb-4 shadow-sm"
              style={{ background: 'linear-gradient(145deg, rgb(var(--color-ember)), #C23000)' }}
            >
              {(RestaurantName || 'R').trim()[0]?.toLocaleUpperCase('tr-TR')}
            </div>
            <p className="font-mono text-[11px] tracking-[0.3em] text-slate uppercase mb-1.5">
              Personel Girişi
            </p>
            <h1 className="font-display text-2xl font-semibold text-paper">{RestaurantName || 'Restoran'} Panel</h1>
          </div>

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
                    Aktif personel bulunamadı.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {staff.map((s) => (
                      <button
                        key={s.UserId}
                        onClick={() => selectUser(s)}
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
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-6">
                  <button
                    onClick={backToStaff}
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

                {error && (
                  <p className="text-ember text-sm font-medium text-center mb-4">{error}</p>
                )}

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
        </div>

        <p className="text-center text-slate text-xs mt-5 font-mono">
          Kasiyer · Garson · Admin erişimi
        </p>
      </div>
    </div>
  );
}
