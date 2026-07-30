import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';

// Basit alt-dizi (subsequence) fuzzy eşleştirme: sorgudaki her karakter,
// hedef metinde SIRAYLA (ama aralarında başka karakter olabilir) geçiyorsa
// eşleşir. Skor, eşleşen karakterler ne kadar bitişikse o kadar yüksektir
// (ör. "sip" -> "Siparişler" tam baştan bitişik eşleşir, en üstte çıkar).
function fuzzyScore(query, target) {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (!q) return 0;

  let qi = 0;
  let score = 0;
  let streak = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++;
      streak++;
      score += streak;
    } else {
      streak = 0;
    }
  }
  return qi === q.length ? score : -1; // -1: sorgudaki tüm karakterler bulunamadı
}

export default function CommandPalette({ open, onClose, items }) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  const results = useMemo(() => {
    if (!query.trim()) return items;
    return items
      .map((item) => ({ item, score: fuzzyScore(query, item.label) }))
      .filter((r) => r.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.item);
  }, [query, items]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      // Açılış animasyonu bittikten hemen sonra odaklan.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const go = (to) => {
    navigate(to);
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = results[activeIndex];
      if (target) go(target.to);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-[100] bg-ink/60 backdrop-blur-sm flex items-start justify-center pt-[15vh] px-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.97 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-panel border border-hairline rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-hairline">
              <IconSearch />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Sayfa ara..."
                className="flex-1 bg-transparent outline-none text-sm text-paper placeholder:text-slate"
              />
              <kbd className="font-mono text-[10px] text-slate border border-hairline rounded px-1.5 py-0.5">Esc</kbd>
            </div>

            <div className="max-h-80 overflow-y-auto py-2">
              {results.length === 0 ? (
                <p className="px-4 py-6 text-center font-mono text-xs text-slate">Sonuç bulunamadı.</p>
              ) : (
                results.map((item, i) => (
                  <button
                    key={item.to}
                    onClick={() => go(item.to)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      i === activeIndex ? 'bg-ember/10 text-ember' : 'text-paper hover:bg-hairline/30'
                    }`}
                  >
                    <span className="text-base leading-none w-5 text-center shrink-0">{item.icon}</span>
                    <span className="text-sm">{item.label}</span>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate shrink-0">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
