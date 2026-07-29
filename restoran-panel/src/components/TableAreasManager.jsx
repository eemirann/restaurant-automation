import { useState } from 'react';
import client from '../api/client';
import { areaLabelOf } from '../utils/tableAreas';

// Masa Bölümleri Yönetimi (Salon/Teras/Bahçe/VIP/Bar vb.) — Admin.
// Ekleme, yeniden adlandırma (masalardaki Area değeri de otomatik
// taşınır, bkz. backend: controllers/tableAreaController.js), sıralama
// (↑/↓ ile DisplayOrder değişimi) ve silme (soft-delete).
//
// ModalShell İÇERMEZ — saf içerik. Tables.jsx bunu bir modal içinde,
// Settings.jsx (Masa Alanları sekmesi) doğrudan bir kart içinde kullanır.
export default function TableAreasManager({ areas, onChanged }) {
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const sorted = [...areas].sort((a, b) => a.DisplayOrder - b.DisplayOrder);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError('');
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const nextOrder = sorted.length > 0 ? Math.max(...sorted.map((a) => a.DisplayOrder)) + 1 : 1;
      await client.post('/table-areas', { Name: newName.trim(), DisplayOrder: nextOrder });
      setNewName('');
      onChanged();
    } catch (err) {
      setError(err.response?.data?.error || 'Bölüm eklenemedi.');
    } finally {
      setBusy(false);
    }
  };

  const startRename = (a) => { setEditingId(a.AreaId); setEditingName(a.Name); setError(''); };

  const saveRename = async (a) => {
    if (!editingName.trim() || editingName.trim() === a.Name) { setEditingId(null); return; }
    setBusy(true);
    setError('');
    try {
      await client.put(`/table-areas/${a.AreaId}`, { Name: editingName.trim() });
      setEditingId(null);
      onChanged();
    } catch (err) {
      setError(err.response?.data?.error || 'Bölüm yeniden adlandırılamadı.');
    } finally {
      setBusy(false);
    }
  };

  const move = async (a, direction) => {
    const idx = sorted.findIndex((x) => x.AreaId === a.AreaId);
    const swapWith = sorted[idx + direction];
    if (!swapWith) return;
    setBusy(true);
    setError('');
    try {
      await Promise.all([
        client.put(`/table-areas/${a.AreaId}`, { DisplayOrder: swapWith.DisplayOrder }),
        client.put(`/table-areas/${swapWith.AreaId}`, { DisplayOrder: a.DisplayOrder }),
      ]);
      onChanged();
    } catch (err) {
      setError(err.response?.data?.error || 'Sıralama değiştirilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (a) => {
    if (!window.confirm(`"${areaLabelOf(a.Name)}" bölümü kaldırılsın mı? Bu bölümdeki masalar etkilenmez, sadece yeni masa eklerken artık seçilemez.`)) return;
    setBusy(true);
    setError('');
    try {
      await client.delete(`/table-areas/${a.AreaId}`);
      onChanged();
    } catch (err) {
      setError(err.response?.data?.error || 'Bölüm kaldırılamadı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="font-mono text-[11px] text-slate mb-4">
        Salon, Teras, Bahçe, Bar gibi bölümler — masa oluştururken/düzenlerken buradan seçilir.
        Bir bölümü yeniden adlandırırsan, o bölümdeki tüm masalar otomatik olarak yeni isme taşınır.
      </p>

      <div className="space-y-2 mb-5">
        {sorted.map((a, idx) => (
          <div key={a.AreaId} className="flex items-center gap-2 border border-hairline rounded-sm px-3 py-2.5 bg-charcoal">
            <div className="flex flex-col shrink-0">
              <button
                type="button"
                disabled={busy || idx === 0}
                onClick={() => move(a, -1)}
                className="text-slate hover:text-ember disabled:opacity-20 leading-none text-xs"
              >
                ▲
              </button>
              <button
                type="button"
                disabled={busy || idx === sorted.length - 1}
                onClick={() => move(a, 1)}
                className="text-slate hover:text-ember disabled:opacity-20 leading-none text-xs"
              >
                ▼
              </button>
            </div>

            {editingId === a.AreaId ? (
              <input
                autoFocus
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveRename(a); if (e.key === 'Escape') setEditingId(null); }}
                onBlur={() => saveRename(a)}
                maxLength={30}
                className="flex-1 border border-ember/40 rounded-sm px-2.5 py-1.5 font-body text-sm text-paper bg-panel
                           focus:outline-none focus:ring-2 focus:ring-ember/40"
              />
            ) : (
              <button
                type="button"
                onClick={() => startRename(a)}
                className="flex-1 text-left font-body text-sm text-paper hover:text-ember transition-colors"
                title="Yeniden adlandırmak için tıkla"
              >
                {areaLabelOf(a.Name)}
              </button>
            )}

            <button
              type="button"
              disabled={busy}
              onClick={() => handleDelete(a)}
              className="font-mono text-[11px] uppercase tracking-wide text-slate hover:text-ember disabled:opacity-40 shrink-0"
            >
              Kaldır
            </button>
          </div>
        ))}
      </div>

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Yeni bölüm adı (ör. Kış Bahçesi)"
          maxLength={30}
          className="flex-1 border border-hairline rounded-sm px-3 py-2.5 font-body text-sm text-paper bg-charcoal
                     focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
        />
        <button
          type="submit"
          disabled={busy || !newName.trim()}
          className="font-mono text-xs uppercase tracking-wide text-cream bg-ember hover:bg-ember/90
                     disabled:opacity-40 rounded-sm px-4 py-2.5 transition-colors shrink-0"
        >
          + Ekle
        </button>
      </form>

      {error && (
        <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 mt-4">{error}</p>
      )}
    </div>
  );
}
