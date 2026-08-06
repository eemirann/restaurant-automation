import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '../i18n';

// Masada telefonu ortaya koyup herkesin parmağını dokundurduğu, "kader"in
// rastgele birini seçtiği eğlenceli bir parti oyunu. Tek cihaz, çoklu
// dokunma (multi-touch) üzerine kurulu — ekstra QR/oturum/backend
// gerekmez, tamamen client-side.
const COLORS = ['#FF6B6B', '#4ECDC4', '#FFD93D', '#6C5CE7', '#00D2A0', '#FF9F1C', '#EE4266', '#3A86FF'];
const MIN_PLAYERS = 2;

// Sabit 3sn yerine her turda 3-7sn arası rastgele bir bekleme süresi —
// süre EKRANDA GÖSTERİLMEZ (bkz. aşağıdaki 'counting' render'ı), kaç
// saniye kaldığı belli olmasın diye. Parmakların büyüyüp parlama
// animasyonu da sabit hızda döner, bu rastgele süreyle senkron değildir.
const randomCountdownMs = () => (3 + Math.floor(Math.random() * 5)) * 1000; // 3,4,5,6,7 sn

export default function WhoPaysGame() {
  const { t, randomGameResult } = useLanguage();
  // 'idle' -> 'placing' -> 'counting' -> 'result'
  const [phase, setPhase] = useState('idle');
  const [touches, setTouches] = useState({}); // { [identifier]: { x, y, color } }
  const [winnerId, setWinnerId] = useState(null);
  const [resultText, setResultText] = useState('');
  const usedColors = useRef([]);
  const countdownTimeoutRef = useRef(null);

  const nextColor = useCallback(() => {
    const free = COLORS.find((c) => !usedColors.current.includes(c));
    const color = free || COLORS[Math.floor(Math.random() * COLORS.length)];
    usedColors.current.push(color);
    return color;
  }, []);

  const clearTimers = () => {
    if (countdownTimeoutRef.current) clearTimeout(countdownTimeoutRef.current);
  };

  useEffect(() => clearTimers, []);

  const reset = () => {
    clearTimers();
    usedColors.current = [];
    setTouches({});
    setWinnerId(null);
    setResultText('');
    setPhase('placing');
  };

  const pickWinner = (currentTouches) => {
    const ids = Object.keys(currentTouches);
    if (ids.length === 0) { setPhase('placing'); return; }
    const winner = ids[Math.floor(Math.random() * ids.length)];
    setWinnerId(winner);
    setResultText(randomGameResult());
    setPhase('result');
  };

  const startCountdown = () => {
    clearTimers();
    // Her tur (ve her yeniden başlatmada — ör. sırasında yeni bir parmak
    // eklenirse) süre YENİDEN rastgele seçilir, kaç saniye olduğu asla
    // ekranda gösterilmez.
    countdownTimeoutRef.current = setTimeout(() => {
      clearTimers();
      setTouches((prev) => { pickWinner(prev); return prev; });
    }, randomCountdownMs());
  };

  const handleTouchStart = (e) => {
    if (phase !== 'placing' && phase !== 'counting') return;
    e.preventDefault();
    setTouches((prev) => {
      const next = { ...prev };
      for (const touch of e.changedTouches) {
        if (next[touch.identifier]) continue;
        next[touch.identifier] = { x: touch.clientX, y: touch.clientY, color: nextColor() };
      }
      const count = Object.keys(next).length;
      if (count >= MIN_PLAYERS) {
        setPhase('counting');
        startCountdown();
      } else {
        clearTimers();
        setPhase('placing');
      }
      return next;
    });
  };

  const handleTouchMove = (e) => {
    if (phase !== 'placing' && phase !== 'counting') return;
    setTouches((prev) => {
      const next = { ...prev };
      for (const touch of e.changedTouches) {
        if (next[touch.identifier]) {
          next[touch.identifier] = { ...next[touch.identifier], x: touch.clientX, y: touch.clientY };
        }
      }
      return next;
    });
  };

  const handleTouchEnd = (e) => {
    if (phase !== 'placing' && phase !== 'counting') return;
    setTouches((prev) => {
      const next = { ...prev };
      for (const touch of e.changedTouches) delete next[touch.identifier];
      const count = Object.keys(next).length;
      if (count < MIN_PLAYERS) {
        clearTimers();
        setPhase('placing');
      }
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-30 bg-ink flex flex-col items-center justify-center overflow-hidden select-none pb-16">
      {phase === 'idle' && (
        <div className="text-center px-8">
          <p className="text-5xl mb-4">🫵</p>
          <h1 className="font-display text-2xl font-semibold text-paper mb-2">{t('gameTitle')}</h1>
          <p className="text-paper/60 text-sm mb-6 leading-relaxed">{t('gameIntro')}</p>
          <button
            type="button"
            onClick={reset}
            className="text-xs uppercase tracking-[0.2em] font-semibold text-ink bg-gold hover:bg-gold/90
                       rounded-full px-6 py-3.5 transition-colors"
          >
            {t('gameStartCta')}
          </button>
        </div>
      )}

      {(phase === 'placing' || phase === 'counting') && (
        <div
          className="absolute inset-0"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          <div className="absolute top-10 left-0 right-0 text-center px-6 pointer-events-none">
            <p className="text-paper/70 text-xs uppercase tracking-[0.2em] font-semibold">
              {phase === 'counting' ? t('gameCountingHint') : t('gamePlacingHint')}
            </p>
          </div>
          {Object.entries(touches).map(([id, tp]) => (
            <div
              key={id}
              className="absolute rounded-full pointer-events-none transition-transform"
              style={{
                left: tp.x - 32, top: tp.y - 32, width: 64, height: 64,
                backgroundColor: tp.color, opacity: 0.85,
                boxShadow: `0 0 24px ${tp.color}`,
                animation: phase === 'counting' ? 'whoPaysPulse 0.6s ease-in-out infinite' : 'none',
              }}
            />
          ))}
        </div>
      )}

      {phase === 'result' && (
        <div className="absolute inset-0">
          {Object.entries(touches).map(([id, tp]) => {
            const isWinner = id === winnerId;
            return (
              <div
                key={id}
                className="absolute rounded-full pointer-events-none transition-all duration-500"
                style={{
                  left: tp.x - (isWinner ? 56 : 24), top: tp.y - (isWinner ? 56 : 24),
                  width: isWinner ? 112 : 48, height: isWinner ? 112 : 48,
                  backgroundColor: tp.color, opacity: isWinner ? 1 : 0.2,
                  boxShadow: isWinner ? `0 0 48px ${tp.color}` : 'none',
                  animation: isWinner ? 'whoPaysPulse 0.9s ease-in-out infinite' : 'none',
                }}
              />
            );
          })}
          <div className="absolute inset-x-0 bottom-24 px-8 text-center">
            <p className="text-4xl mb-3">🎉</p>
            <p className="font-display text-lg font-semibold text-paper leading-snug mb-6">{resultText}</p>
            <button
              type="button"
              onClick={reset}
              className="text-xs uppercase tracking-[0.2em] font-semibold text-ink bg-gold hover:bg-gold/90
                         rounded-full px-6 py-3.5 transition-colors"
            >
              {t('gamePlayAgain')}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes whoPaysPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.12); }
        }
      `}</style>
    </div>
  );
}
