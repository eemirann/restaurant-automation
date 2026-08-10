import { useEffect, useState, useCallback } from 'react';
import client from '../api/client';

const num = (n) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 }).format(Number(n) || 0);

export default function Recipes() {
  const [products, setProducts] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [units, setUnits] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const [recipe, setRecipe] = useState([]);
  const [loadingRecipe, setLoadingRecipe] = useState(false);
  const [error, setError] = useState('');

  // Yeni satır formu
  const [rawId, setRawId] = useState('');
  const [qty, setQty] = useState('');
  const [unitId, setUnitId] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    client.get('/products').then((r) => setProducts(r.data)).catch(() => {});
    client.get('/products', { params: { raw: 1 } }).then((r) => setRawMaterials(r.data)).catch(() => {});
    // Birim Dönüşüm Sistemi (bkz. migrations/2026_08_14_unit_conversion_system.sql)
    // — "Birim" artık serbest metin değil, bu listeden seçilir.
    client.get('/units').then((r) => setUnits(r.data)).catch(() => {});
  }, []);

  const loadRecipe = useCallback(async (productId) => {
    if (!productId) return;
    setLoadingRecipe(true);
    setError('');
    try {
      const res = await client.get(`/recipes/${productId}`);
      setRecipe(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Reçete getirilemedi.');
    } finally {
      setLoadingRecipe(false);
    }
  }, []);

  useEffect(() => { if (selectedId) loadRecipe(selectedId); }, [selectedId, loadRecipe]);

  const selectedProduct = products.find((p) => p.ProductId === selectedId);

  // Backend'deki reportController/dashboardController ile AYNI mantık VE
  // AYNI sayı: ConversionFactor da backend'den geliyor (dbo.fn_ProductUnitFactor),
  // burada ayrıca hesaplanmıyor — iki yerde farklı sonuç çıkma riski yok.
  // Reçetedeki hammaddelerden biri bile fiyatlanmamışsa (Cost=NULL) toplam
  // maliyet de yanıltıcı olmasın diye null döner.
  const calculatedCost = recipe.some((line) => line.RawMaterialCost == null)
    ? null
    : recipe.reduce((sum, line) => sum + Number(line.Quantity) * Number(line.ConversionFactor ?? 1) * Number(line.RawMaterialCost), 0);

  const normalizedSearch = search.trim().toLocaleLowerCase('tr-TR');
  const visibleProducts = products.filter((p) =>
    normalizedSearch ? p.Name.toLocaleLowerCase('tr-TR').includes(normalizedSearch) : true
  );

  const addLine = async () => {
    setError('');
    if (!rawId) { setError('Hammadde seçin.'); return; }
    if (!qty || Number(qty) <= 0) { setError('Miktar 0\'dan büyük olmalı.'); return; }
    setAdding(true);
    try {
      await client.post('/recipes', {
        ProductId: selectedId,
        RawMaterialProductId: Number(rawId),
        Quantity: Number(qty),
        UnitId: unitId ? Number(unitId) : undefined,
      });
      setRawId(''); setQty(''); setUnitId('');
      await loadRecipe(selectedId);
    } catch (err) {
      setError(err.response?.data?.error || 'Satır eklenemedi.');
    } finally {
      setAdding(false);
    }
  };

  const updateLine = async (line, patch) => {
    try {
      await client.put(`/recipes/${line.RecipeId}`, patch);
      await loadRecipe(selectedId);
    } catch (err) {
      setError(err.response?.data?.error || 'Satır güncellenemedi.');
    }
  };

  const deleteLine = async (line) => {
    if (!window.confirm(`${line.RawMaterialName} reçeteden çıkarılsın mı?`)) return;
    try {
      await client.delete(`/recipes/${line.RecipeId}`);
      await loadRecipe(selectedId);
    } catch (err) {
      setError(err.response?.data?.error || 'Satır silinemedi.');
    }
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <p className="text-[10px] font-bold text-[#FF6B6B] tracking-[0.3em] uppercase mb-1.5">Reçete · BOM</p>
        <h1 className="text-3xl font-extrabold text-paper leading-none tracking-tight">Ürün Reçeteleri</h1>
        <p className="font-mono text-xs text-slate mt-2">Menü ürünü satılınca reçetedeki hammaddeler stoktan otomatik düşer.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[20rem_1fr] gap-5">
        {/* SOL: ürün seçimi */}
        <div className="rounded-2xl border border-hairline bg-panel p-3 h-fit">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ürün ara…"
            className="w-full border border-hairline rounded-lg px-3 py-2 font-body text-sm text-paper bg-charcoal mb-2 focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
          />
          <div className="max-h-[32rem] overflow-auto space-y-1">
            {visibleProducts.length === 0 ? (
              <p className="text-slate font-mono text-xs p-2">Ürün yok.</p>
            ) : (
              visibleProducts.map((p) => (
                <button
                  key={p.ProductId}
                  onClick={() => setSelectedId(p.ProductId)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors text-sm ${
                    selectedId === p.ProductId ? 'bg-[#FF6B6B]/10 text-[#FF6B6B] font-semibold' : 'text-paper hover:bg-hairline/60'
                  }`}
                >
                  {p.Name}
                </button>
              ))
            )}
          </div>
        </div>

        {/* SAĞ: reçete editörü */}
        <div>
          {!selectedId ? (
            <div className="border border-dashed border-hairline rounded-2xl p-16 text-center bg-panel/50">
              <p className="text-slate font-mono text-sm">Reçetesini düzenlemek için soldan bir ürün seçin.</p>
            </div>
          ) : (
            <>
              <h2 className="font-display text-xl font-semibold text-paper mb-3">{selectedProduct?.Name} · Reçete</h2>

              {!loadingRecipe && recipe.length > 0 && (
                <div className="rounded-2xl border border-hairline bg-panel p-4 mb-4 flex items-center justify-between">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-1">Hesaplanan Maliyet</p>
                    {calculatedCost === null ? (
                      <p className="font-body text-sm text-amber-500">
                        Hesaplanamadı — bir veya daha fazla hammaddenin maliyeti (Cost) girilmemiş.
                      </p>
                    ) : (
                      <p className="font-display text-2xl font-semibold text-paper">₺{num(calculatedCost)}</p>
                    )}
                  </div>
                  <p className="font-mono text-[10px] text-slate max-w-xs text-right">
                    Raporlarda ve kâr hesabında bu ürün için elle girilen Ürün Maliyeti yerine
                    OTOMATİK olarak bu değer kullanılır.
                  </p>
                </div>
              )}

              {error && <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 mb-4">{error}</p>}

              <div className="rounded-2xl border border-hairline overflow-hidden bg-panel mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-hairline/60 border-b border-hairline text-left font-mono text-[10px] uppercase tracking-wide text-slate">
                      <th className="px-4 py-2.5">Hammadde</th>
                      <th className="px-4 py-2.5 w-28">Miktar</th>
                      <th className="px-4 py-2.5 w-32">Birim</th>
                      <th className="px-4 py-2.5 text-right w-28">Stok</th>
                      <th className="px-4 py-2.5 w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingRecipe ? (
                      <tr><td colSpan={5} className="px-4 py-4 text-slate text-sm animate-pulse">Yükleniyor…</td></tr>
                    ) : recipe.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-4 text-slate text-sm">Bu ürünün reçetesi yok. Aşağıdan hammadde ekleyin.</td></tr>
                    ) : (
                      recipe.map((line) => (
                        <tr key={line.RecipeId} className="border-b border-hairline last:border-b-0">
                          <td className="px-4 py-2 text-paper">{line.RawMaterialName}</td>
                          <td className="px-4 py-2">
                            <input
                              type="number" min="0" step="0.001" defaultValue={line.Quantity}
                              onBlur={(e) => { const v = Number(e.target.value); if (v > 0 && v !== Number(line.Quantity)) updateLine(line, { Quantity: v }); }}
                              className="w-24 border border-hairline rounded px-2 py-1 font-mono text-sm text-paper bg-charcoal focus:outline-none focus:ring-1 focus:ring-ember"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <select
                              defaultValue={line.UnitId ?? ''}
                              onChange={(e) => updateLine(line, { UnitId: e.target.value ? Number(e.target.value) : null })}
                              className="w-28 border border-hairline rounded px-2 py-1 font-mono text-xs text-paper bg-charcoal focus:outline-none focus:ring-1 focus:ring-ember"
                            >
                              <option value="">
                                {line.StockUnitCode ? `stok (${line.StockUnitCode})` : 'stok birimi'}
                              </option>
                              {units.map((u) => (
                                <option key={u.UnitId} value={u.UnitId}>{u.Code}</option>
                              ))}
                            </select>
                            {line.UnitId && line.StockUnitCode && (
                              <p className="font-mono text-[9px] text-slate mt-0.5">
                                = {num(Number(line.Quantity) * Number(line.ConversionFactor ?? 1))} {line.StockUnitCode}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-xs text-slate">{line.RawMaterialStock == null ? '—' : num(line.RawMaterialStock)}</td>
                          <td className="px-4 py-2 text-center">
                            <button onClick={() => deleteLine(line)} title="Sil" className="text-slate hover:text-red-500 font-mono text-sm">✕</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Yeni hammadde satırı ekle */}
              <div className="rounded-2xl border border-hairline bg-panel p-4">
                <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-3">Hammadde Ekle</p>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 min-w-[12rem]">
                    <label className="block font-mono text-[9px] uppercase tracking-wide text-slate/70 mb-1">Hammadde</label>
                    <select value={rawId} onChange={(e) => setRawId(e.target.value)}
                      className="w-full border border-hairline rounded-lg px-3 py-2 font-body text-sm text-paper bg-charcoal focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember">
                      <option value="">Seçin…</option>
                      {rawMaterials.map((rm) => (
                        <option key={rm.ProductId} value={rm.ProductId}>{rm.Name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="w-28">
                    <label className="block font-mono text-[9px] uppercase tracking-wide text-slate/70 mb-1">Miktar</label>
                    <input type="number" min="0" step="0.001" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0.000"
                      className="w-full border border-hairline rounded-lg px-3 py-2 font-mono text-sm text-paper bg-charcoal focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember" />
                  </div>
                  <div className="w-32">
                    <label className="block font-mono text-[9px] uppercase tracking-wide text-slate/70 mb-1">Birim</label>
                    <select value={unitId} onChange={(e) => setUnitId(e.target.value)}
                      className="w-full border border-hairline rounded-lg px-3 py-2 font-mono text-xs text-paper bg-charcoal focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember">
                      <option value="">stok birimi</option>
                      {units.map((u) => (
                        <option key={u.UnitId} value={u.UnitId}>{u.Code}</option>
                      ))}
                    </select>
                  </div>
                  <button onClick={addLine} disabled={adding}
                    className="text-xs font-bold uppercase tracking-wide text-white bg-[#FF6B6B] hover:bg-[#ff5555] disabled:opacity-40 rounded-lg px-4 py-2 min-h-[2.5rem] shadow-sm transition-all">
                    {adding ? 'Ekleniyor…' : '+ Ekle'}
                  </button>
                </div>
                {rawMaterials.length === 0 && (
                  <p className="font-mono text-[10px] text-slate mt-2">Henüz hammadde yok. Stok sayfasından hammadde ekleyebilirsiniz.</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
