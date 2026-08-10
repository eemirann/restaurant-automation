import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from 'recharts';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';

// ============================================================
// Ürün Türü Rozeti — Şurup/Ekstra sayfaları kaldırıldığı için, hangi stok
// kaleminin bir hammadde/şurup/ekstra olduğu artık burada, satırın
// içinde küçük bir renkli rozet + emoji ile ayırt ediliyor.
// ============================================================
function TypeBadge({ isSyrup, isExtra }) {
  if (isSyrup) {
    return (
      <span className="inline-flex items-center gap-1 border border-violet-400/40 bg-violet-400/10 text-violet-300
                        rounded-full px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide shrink-0">
        🧴 Şurup
      </span>
    );
  }
  if (isExtra) {
    return (
      <span className="inline-flex items-center gap-1 border border-[#FF6B6B]/40 bg-[#FF6B6B]/10 text-[#FF6B6B]
                        rounded-full px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide shrink-0">
        ➕ Ekstra
      </span>
    );
  }
  return null;
}

export default function Stock() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'Admin';
  const { StockChartEnabled } = useSettings();
  const chartEnabled = StockChartEnabled !== false;

  // Veriler
  const [stockItems, setStockItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  // Arama / sıralama / filtre
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name-asc');
  const [statusFilter, setStatusFilter] = useState('all');

  // Pasifleştirilmiş kalemler VARSAYILAN OLARAK gizli — Toast/Square gibi
  // POS'larda "86'd" ürünler ayrı bir görünümde toplanır, ana listeyi
  // kirletmez (bkz. Toast Menu Item Inventory, Square "Sold out" akışı).
  // Kullanıcı isterse "Pasifleri Göster" ile açar.
  const [showInactive, setShowInactive] = useState(false);

  // Yeni stok kalemi ekleme çekmecesi
  const [showAddDrawer, setShowAddDrawer] = useState(false);

  // Stok alımı çekmecesi ("Alım Ekle" butonu)
  const [purchaseItem, setPurchaseItem] = useState(null);

  // Stok kalemi düzenleme çekmecesi ("Düzenle" butonu — Adet/Min. Stok direkt güncelleme)
  const [editItem, setEditItem] = useState(null);

  // Stok listesini backend'den çek (basit fonksiyon, useCallback yok)
  const fetchStock = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/stock');
      setStockItems(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Stok listesi getirilemedi.');
    } finally {
      setLoading(false);
    }
  };

  // Sayfa ilk açıldığında stok ve ürün listesini getir
  useEffect(() => {
    fetchStock();
    // raw: 'stockable' -> hammadde + ekstra + şurup (SADECE malzemeler).
    // Satılan bitmiş menü ürünleri (ör. "Cappuccino") burada seçilebilir
    // OLMAMALI — stok, ürünlerde kullanılan malzemeleri takip eder
    // (bkz. controllers/productController.js).
    client.get('/products', { params: { raw: 'stockable' } }).then((res) => setProducts(res.data)).catch(() => {});
  }, []);

  const isItemTracked = (item) => item.IsTracked !== false && item.IsTracked !== 0;

  // Önce ürün adına göre ara (basit, memoization yok)
  let filteredItems = stockItems.filter((item) =>
    item.ProductName.toLocaleLowerCase('tr-TR').includes(searchTerm.toLocaleLowerCase('tr-TR'))
  );

  const inactiveCount = filteredItems.filter((item) => !isItemTracked(item)).length;

  // Pasifleştirilmiş kalemler varsayılan olarak listeden tamamen çıkarılır
  // (bkz. showInactive tanımı) — "Pasifleri Göster" açıkken geri gelirler.
  if (!showInactive) {
    filteredItems = filteredItems.filter((item) => isItemTracked(item));
  }

  // Sonra duruma göre filtrele
  if (statusFilter === 'available') {
    filteredItems = filteredItems.filter((item) => item.Quantity > item.MinStockLevel);
  } else if (statusFilter === 'low') {
    filteredItems = filteredItems.filter((item) => item.Quantity > 0 && item.Quantity <= item.MinStockLevel);
  } else if (statusFilter === 'out') {
    filteredItems = filteredItems.filter((item) => item.Quantity <= 0);
  }

  // Son olarak sırala (orijinal listeyi bozmamak için kopyası üzerinde)
  filteredItems = [...filteredItems];
  if (sortBy === 'name-asc') {
    filteredItems.sort((a, b) => a.ProductName.localeCompare(b.ProductName, 'tr-TR'));
  } else if (sortBy === 'name-desc') {
    filteredItems.sort((a, b) => b.ProductName.localeCompare(a.ProductName, 'tr-TR'));
  } else if (sortBy === 'stock-asc') {
    filteredItems.sort((a, b) => a.Quantity - b.Quantity);
  } else if (sortBy === 'stock-desc') {
    filteredItems.sort((a, b) => b.Quantity - a.Quantity);
  } else if (sortBy === 'recent') {
    filteredItems.sort((a, b) => new Date(b.UpdatedAt) - new Date(a.UpdatedAt));
  }
  // Seçilen sıralamadan BAĞIMSIZ olarak pasif kalemler her zaman en alta
  // sinker (Toast/Square'de "86'd" ürünlerin ayrı/geri planda durmasıyla
  // aynı amaç — göz önce aktif ürünleri görsün).
  if (showInactive) {
    filteredItems.sort((a, b) => Number(!isItemTracked(a)) - Number(!isItemTracked(b)));
  }

  const outOfStockCount = stockItems.filter((item) => item.Quantity <= 0).length;
  const lowStockCount = stockItems.filter((item) => item.Quantity > 0 && item.Quantity <= item.MinStockLevel).length;

  // Grafik verisi: filtrelenmiş listeden, adete göre çoktan aza, en fazla 15 ürün
  // (tablo sıralamasından bağımsız — grafik her zaman en yüksek/en düşük stoğu net göstersin diye)
  const CHART_LIMIT = 15;
  const chartSource = [...filteredItems].sort((a, b) => b.Quantity - a.Quantity);
  const chartData = chartSource.slice(0, CHART_LIMIT).map((item) => ({
    name: item.ProductName,
    Adet: item.Quantity,
    isOut: item.Quantity <= 0,
    isLow: item.Quantity > 0 && item.Quantity <= item.MinStockLevel,
  }));
  const barColor = (d) => (d.isOut ? 'rgb(var(--color-slate))' : d.isLow ? 'rgb(var(--color-ember))' : '#00C853');

  // Satır içi mini çubuklar için ölçek: listedeki en yüksek adede göre orantılı genişlik
  const maxQuantity = Math.max(1, ...filteredItems.map((item) => item.Quantity));

  // Stoğu 1 artır — hiçbir pencere/soru çıkmaz, direkt artırır.
  // Her artış otomatik olarak bir "IN" hareketi olarak kaydedilir (tarih/tür otomatik).
  const handleIncrease = async (item) => {
    setActionError('');
    try {
      await client.patch(`/stock/${item.StockId}/increase`, { amount: 1 });
      fetchStock();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Stok artırılamadı.');
    }
  };

  // Stoğu 1 azalt — hiçbir pencere/soru çıkmaz, direkt azaltır.
  // Her azalış otomatik olarak bir "OUT" hareketi olarak kaydedilir (tarih/tür otomatik).
  const handleDecrease = async (item) => {
    setActionError('');
    try {
      await client.patch(`/stock/${item.StockId}/decrease`, { amount: 1 });
      fetchStock();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Stok azaltılamadı.');
    }
  };

  // Stok kalemini pasifleştir (soft-delete — geçmiş alım/hareket kayıtları korunur)
  const handleDeactivate = async (item) => {
    if (!window.confirm(`"${item.ProductName}" pasifleştirilsin mi? Bu üründen artık sipariş anında stok düşülmez.`)) return;
    setActionError('');
    try {
      await client.delete(`/stock/${item.StockId}`);
      fetchStock();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Stok kalemi pasifleştirilemedi.');
    }
  };

  const handleReactivate = async (item) => {
    setActionError('');
    try {
      await client.patch(`/stock/${item.StockId}/reactivate`);
      fetchStock();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Stok kalemi aktifleştirilemedi.');
    }
  };

  return (
    <div className="p-10">
      {/* Başlık */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="text-[10px] font-bold text-[#FF6B6B] tracking-[0.3em] uppercase mb-2">
            Depo · Envanter
          </p>
          <h1 className="text-4xl font-extrabold text-paper tracking-tight">Stok Yönetimi</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchStock}
            className="text-[11px] font-bold uppercase tracking-wide text-slate hover:text-paper
                       border border-hairline rounded-xl px-3 py-2 bg-panel shadow-sm transition-colors"
          >
            ↻ Yenile
          </button>
          <button
            onClick={() => navigate('/stock-movements')}
            className="text-[11px] font-bold uppercase tracking-wide text-slate hover:text-paper
                       border border-hairline rounded-xl px-3 py-2 bg-panel shadow-sm transition-colors"
          >
            🕘 Hareket Geçmişi
          </button>
          {inactiveCount > 0 && (
            <button
              onClick={() => setShowInactive((v) => !v)}
              title="Pasifleştirilmiş kalemler varsayılan olarak gizlenir"
              className={`text-[11px] font-bold uppercase tracking-wide border rounded-xl px-3 py-2 shadow-sm transition-colors ${
                showInactive
                  ? 'border-[#FF6B6B] text-[#FF6B6B] bg-[#FF6B6B]/10'
                  : 'border-hairline text-slate hover:text-paper bg-panel'
              }`}
            >
              {showInactive ? '🙈 Pasifleri Gizle' : `👁 Pasifleri Göster (${inactiveCount})`}
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => setShowAddDrawer(true)}
              className="text-[11px] font-bold uppercase tracking-wide text-white bg-[#FF6B6B]
                         hover:bg-[#ff5555] rounded-xl px-4 py-2 shadow-lg shadow-red-500/10 transition-all"
            >
              + Yeni Stok
            </button>
          )}
        </div>
      </div>

      {/* Durum özeti */}
      <div className="flex flex-wrap gap-6 mb-6 font-mono text-xs text-slate">
        <span><span className="text-paper font-semibold">{stockItems.length}</span> toplam ürün</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full inline-block bg-ember" />
          {lowStockCount} düşük stokta
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full inline-block bg-slate" />
          {outOfStockCount} stokta yok
        </span>
      </div>

      {/* Stok grafiği — ürün başına adet, duruma göre renklendirilmiş çubuk grafik (Ayarlar'dan aç/kapa) */}
      {chartEnabled && !loading && chartData.length > 0 && (
        <div className="border border-hairline rounded-sm bg-panel p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-slate">
              Stok Grafiği{chartSource.length > CHART_LIMIT ? ` · İlk ${CHART_LIMIT} ürün` : ''}
            </p>
            <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-wide text-slate">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full inline-block" style={{ background: '#00C853' }} />Yeterli</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full inline-block bg-ember" />Düşük</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full inline-block bg-slate" />Yok</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 34)}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
              <CartesianGrid horizontal={false} stroke="rgb(var(--color-hairline))" />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontSize: 11, fill: 'rgb(var(--color-slate))', fontFamily: 'IBM Plex Mono, monospace' }}
                axisLine={{ stroke: 'rgb(var(--color-hairline))' }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 12, fill: 'rgb(var(--color-paper))', fontFamily: 'IBM Plex Mono, monospace' }}
                axisLine={false}
                tickLine={false}
                width={140}
              />
              <Tooltip
                cursor={{ fill: 'rgb(var(--color-hairline))', opacity: 0.4 }}
                formatter={(value) => [value, 'Adet']}
                contentStyle={{
                  borderRadius: 10,
                  border: '1px solid rgb(var(--color-hairline))',
                  background: 'rgb(var(--color-panel))',
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: 12,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                }}
                itemStyle={{ color: 'rgb(var(--color-paper))' }}
                labelStyle={{ color: 'rgb(var(--color-paper))' }}
              />
              <Bar dataKey="Adet" radius={[0, 4, 4, 0]} maxBarSize={22}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={barColor(d)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Arama / Sırala / Filtrele */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search product..."
          className="flex-1 min-w-[16rem] max-w-sm border border-hairline rounded-sm px-4 py-2.5 font-body text-paper
                     focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
        />

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="border border-hairline rounded-sm px-3 py-2.5 font-mono text-xs uppercase tracking-wide text-paper bg-panel
                     focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
        >
          <option value="name-asc">Ürün Adı (A-Z)</option>
          <option value="name-desc">Ürün Adı (Z-A)</option>
          <option value="stock-asc">Stok (Az → Çok)</option>
          <option value="stock-desc">Stok (Çok → Az)</option>
          <option value="recent">Son Güncellenen</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-hairline rounded-sm px-3 py-2.5 font-mono text-xs uppercase tracking-wide text-paper bg-panel
                     focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
        >
          <option value="all">Tümü</option>
          <option value="available">Yeterli</option>
          <option value="low">Düşük Stok</option>
          <option value="out">Stokta Yok</option>
        </select>
      </div>

      {(error || actionError) && (
        <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 mb-6">
          {error || actionError}
        </p>
      )}

      {loading ? (
        <p className="text-slate font-mono text-sm">Yükleniyor...</p>
      ) : filteredItems.length === 0 ? (
        <div className="border border-dashed border-hairline rounded-3xl p-10 text-center bg-panel/50">
          <p className="text-slate font-mono text-sm">Gösterilecek stok kaydı bulunamadı.</p>
        </div>
      ) : (
        <div className="border border-stone-100 rounded-3xl overflow-hidden bg-panel shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-hairline/60 border-b border-hairline text-left font-mono text-[10px] uppercase tracking-widest text-slate">
                <th className="px-5 py-3">Ürün</th>
                <th className="px-5 py-3">Adet</th>
                <th className="px-5 py-3">Min. Stok</th>
                <th className="px-5 py-3">Durum</th>
                {chartEnabled && <th className="px-5 py-3">Grafik</th>}
                {isAdmin && <th className="px-5 py-3 text-right">İşlemler</th>}
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const isOut = item.Quantity <= 0;
                const isLow = !isOut && item.Quantity <= item.MinStockLevel;
                const statusLabel = isOut ? 'Stokta Yok' : isLow ? 'Düşük Stok' : 'Yeterli';
                const statusBadgeClass = isOut
                  ? 'border-slate/40 bg-slate/5'
                  : isLow
                  ? 'border-ember/40 bg-ember/5'
                  : 'border-moss/40 bg-moss/5';
                const statusDotClass = isOut ? 'bg-slate' : isLow ? 'bg-ember' : 'bg-moss';
                const isTracked = item.IsTracked !== false && item.IsTracked !== 0;
                return (
                  <tr
                    key={item.StockId}
                    className={`border-b border-hairline last:border-b-0 hover:bg-hairline/30 ${
                      !isTracked ? 'opacity-45 hover:opacity-100 transition-opacity' : ''
                    }`}
                  >
                    <td className="px-5 py-3 text-paper font-medium">
                      <span className="flex items-center gap-2">
                        {item.ProductName}
                        <TypeBadge isSyrup={item.IsSyrup} isExtra={item.IsExtra} />
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-paper">{item.Quantity}</td>
                    <td className="px-5 py-3 font-mono text-slate">{item.MinStockLevel}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`inline-flex items-center gap-1.5 border rounded-sm px-2 py-1 text-xs font-mono uppercase tracking-wide ${statusBadgeClass}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${statusDotClass}`} />
                          {statusLabel}
                        </span>
                        {!isTracked && (
                          <span className="inline-flex items-center gap-1.5 border border-slate/40 bg-slate/5 rounded-sm px-2 py-1 text-xs font-mono uppercase tracking-wide">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate" />
                            Pasif
                          </span>
                        )}
                      </div>
                    </td>
                    {chartEnabled && (
                      <td className="px-5 py-3">
                        <div className="w-24 h-1.5 rounded-full bg-hairline overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max((item.Quantity / maxQuantity) * 100, item.Quantity > 0 ? 4 : 0)}%`,
                              background: isOut ? 'rgb(var(--color-slate))' : isLow ? 'rgb(var(--color-ember))' : '#00C853',
                            }}
                          />
                        </div>
                      </td>
                    )}
                    {isAdmin && (
                      <td className="px-5 py-3">
                        <div className="flex justify-end items-center gap-2 flex-wrap">
                          {/* Pasif kalemde stok hareketi anlamsız — azalt/artır/alım
                              butonları gizlenir, sadece Düzenle + Aktif Et kalır
                              (bkz. Toast/Square: "86'd" ürünlerde satış aksiyonları
                              devre dışı kalır, sadece geri açma seçeneği kalır). */}
                          {isTracked && (
                            <>
                              <button
                                onClick={() => handleDecrease(item)}
                                title="1 azalt"
                                className="w-11 h-11 flex items-center justify-center font-mono text-paper border border-hairline rounded-xl
                                           hover:border-[#FF6B6B] hover:text-[#FF6B6B] transition-colors"
                              >
                                −
                              </button>
                              <button
                                onClick={() => handleIncrease(item)}
                                title="1 artır"
                                className="w-11 h-11 flex items-center justify-center font-mono text-white bg-[#FF6B6B] rounded-xl
                                           hover:bg-[#ff5555] transition-colors"
                              >
                                +
                              </button>
                              <button
                                onClick={() => setPurchaseItem(item)}
                                title="Stok alımı ekle"
                                className="text-[11px] font-bold uppercase tracking-wide text-slate hover:text-paper border border-hairline rounded-xl px-2.5 py-1.5 transition-colors"
                              >
                                Alım Ekle
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => setEditItem(item)}
                            title="Adet / Min. stok düzenle"
                            className="text-[11px] font-bold uppercase tracking-wide text-slate hover:text-azure border border-hairline rounded-xl px-2.5 py-1.5 transition-colors"
                          >
                            Düzenle
                          </button>
                          {isTracked ? (
                            <button
                              onClick={() => handleDeactivate(item)}
                              className="text-[11px] font-bold uppercase tracking-wide text-[#FF6B6B] hover:text-white hover:bg-[#FF6B6B] border border-[#FF6B6B]/40 rounded-xl px-2.5 py-1.5 transition-all"
                            >
                              Pasife Al
                            </button>
                          ) : (
                            <button
                              onClick={() => handleReactivate(item)}
                              className="text-[11px] font-bold uppercase tracking-wide text-moss hover:text-moss/80 border border-moss/40 rounded-xl px-2.5 py-1.5 transition-colors"
                            >
                              Aktif Et
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Yeni stok kalemi ekleme çekmecesi (stoğu olan ürünler de seçilip düzenlenebilir) */}
      {showAddDrawer && (
        <StockAddDrawer
          products={products}
          stockItems={stockItems}
          onClose={() => setShowAddDrawer(false)}
          onSaved={() => {
            setShowAddDrawer(false);
            fetchStock();
          }}
        />
      )}

      {/* Stok alımı çekmecesi ("Alım Ekle" butonu) */}
      {purchaseItem && (
        <StockPurchaseDrawer
          item={purchaseItem}
          onClose={() => setPurchaseItem(null)}
          onSaved={() => {
            setPurchaseItem(null);
            fetchStock();
          }}
        />
      )}

      {/* Stok kalemi düzenleme çekmecesi ("Düzenle" butonu) */}
      {editItem && (
        <StockEditDrawer
          item={editItem}
          onClose={() => setEditItem(null)}
          onSaved={() => {
            setEditItem(null);
            fetchStock();
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Yeni Stok Kalemi Ekleme Çekmecesi — StockPurchaseDrawer ile aynı
// sağdan kayan çekmece görünümü (tam ekran modal değil).
// Ürün ya listeden seçilir ya da yeni bir ürün adı yazılır (yeni bir
// "hammadde" olarak oluşturulur, menüde hiç görünmez). Girilen ilk
// adet de bir alım olarak kaydedilir (Birim Fiyat/Tedarikçi/Fatura/Not opsiyonel).
//
// Listeden zaten stoğu OLAN bir ürün seçilirse (ör. daha önce eklenmiş),
// yeni kayıt oluşturulmaz — bunun yerine mevcut stoğu üzerine adet eklenir
// (Düzenle butonundaki alım akışıyla aynı: POST /stock/:id/purchase).
// ============================================================
function StockAddDrawer({ products, stockItems, onClose, onSaved }) {
  const [productId, setProductId] = useState('');
  const [newProductName, setNewProductName] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [minStockLevel, setMinStockLevel] = useState(5);
  const [unitPrice, setUnitPrice] = useState('');
  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Tür: 'raw' (hammadde) | 'syrup' | 'extra' — Şurup/Ekstra sayfaları
  // kaldırıldığı için yeni bir şurup/ekstra artık doğrudan bu tek formdan
  // açılıyor (bkz. controllers/stockController.js createStockItem).
  const [itemType, setItemType] = useState('raw');
  const [typePrice, setTypePrice] = useState('');
  const [servingSize, setServingSize] = useState('');

  // Ürün listesinde ara / A-Z sırala (Stok listesindeki arama/sıralama ile aynı mantık)
  const [productSearch, setProductSearch] = useState('');
  const [productSort, setProductSort] = useState('name-asc');

  const sortedProducts = [...products]
    .filter((p) => p.Name.toLocaleLowerCase('tr-TR').includes(productSearch.toLocaleLowerCase('tr-TR')))
    .sort((a, b) =>
      productSort === 'name-asc'
        ? a.Name.localeCompare(b.Name, 'tr-TR')
        : b.Name.localeCompare(a.Name, 'tr-TR')
    );

  // Seçilen ürünün zaten bir stok kaydı var mı? Varsa "düzenleme" (mevcut
  // stoğa ekleme) moduna geçilir, minimum stok alanı gizlenir.
  const existingStock = productId
    ? stockItems.find((s) => s.ProductId === Number(productId))
    : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!productId && !newProductName.trim()) {
      setError('Listeden bir ürün seçin veya yeni bir ürün adı yazın.');
      return;
    }
    if (quantity < 0 || minStockLevel < 0) {
      setError('Adet ve minimum stok negatif olamaz.');
      return;
    }
    if (!existingStock && itemType !== 'raw' && (typePrice === '' || Number(typePrice) < 0)) {
      setError('Şurup/Ekstra için negatif olmayan bir Fiyat girin.');
      return;
    }

    setSubmitting(true);
    try {
      if (existingStock) {
        // Zaten stoğu olan bir ürün seçildi -> mevcut stoğu düzenle (alım ekle)
        await client.post(`/stock/${existingStock.StockId}/purchase`, {
          Quantity: Number(quantity),
          UnitPrice: unitPrice ? Number(unitPrice) : undefined,
          Supplier: supplier.trim() || undefined,
          InvoiceNumber: invoiceNumber.trim() || undefined,
          Notes: notes.trim() || undefined,
        });
      } else {
        await client.post('/stock', {
          ProductId: productId ? Number(productId) : undefined,
          ProductName: productId ? undefined : newProductName.trim(),
          Quantity: Number(quantity),
          MinStockLevel: Number(minStockLevel),
          UnitPrice: unitPrice ? Number(unitPrice) : undefined,
          Supplier: supplier.trim() || undefined,
          InvoiceNumber: invoiceNumber.trim() || undefined,
          Notes: notes.trim() || undefined,
          Type: itemType,
          Price: itemType !== 'raw' ? Number(typePrice) : undefined,
          ServingSize: itemType !== 'raw' && servingSize !== '' ? Number(servingSize) : undefined,
        });
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'İşlem başarısız oldu.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      {/* Karartma */}
      <div className="absolute inset-0 bg-ink/50" onClick={() => !submitting && onClose()} />

      {/* Çekmece */}
      <div className="relative w-full max-w-md h-full bg-panel shadow-2xl flex flex-col animate-[slideIn_0.2s_ease-out]">
        <style>{`
          @keyframes slideIn {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `}</style>

        {/* Başlık */}
        <div className="px-6 py-4 border-b border-hairline flex items-start justify-between shrink-0 bg-panel">
          <div>
            <p className="text-[10px] font-bold text-[#FF6B6B] tracking-[0.25em] uppercase mb-1">Stok</p>
            <h2 className="font-display text-lg font-semibold text-paper leading-tight">
              {existingStock ? 'Mevcut Stoğu Güncelle' : 'Yeni Stok Kalemi'}
            </h2>
          </div>
          <button
            onClick={() => !submitting && onClose()}
            className="font-mono text-xs text-slate hover:text-paper w-9 h-9 flex items-center justify-center shrink-0 rounded-sm hover:bg-charcoal transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Gövde (kaydırılabilir) */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-auto px-6 py-5 bg-hairline/10 space-y-4">
          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Ürün</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Ürün ara..."
                className="flex-1 border border-hairline rounded-sm px-3 py-2 font-body text-sm text-paper bg-panel
                           focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
              />
              <select
                value={productSort}
                onChange={(e) => setProductSort(e.target.value)}
                className="border border-hairline rounded-sm px-2 py-2 font-mono text-[11px] uppercase tracking-wide text-paper bg-panel
                           focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
              >
                <option value="name-asc">A-Z</option>
                <option value="name-desc">Z-A</option>
              </select>
            </div>
            <select
              value={productId}
              onChange={(e) => { setProductId(e.target.value); if (e.target.value) setNewProductName(''); }}
              className="w-full border border-hairline rounded-sm px-3 py-2.5 font-body text-paper bg-panel
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            >
              <option value="">Listeden seçin...</option>
              {sortedProducts.map((p) => {
                const hasStock = stockItems.some((s) => s.ProductId === p.ProductId);
                return (
                  <option key={p.ProductId} value={p.ProductId}>
                    {p.Name}{hasStock ? ' — stokta var, üzerine eklenir' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {existingStock && (
            <p className="font-mono text-[11px] text-slate bg-hairline/60 border border-hairline rounded-sm px-3 py-2">
              Bu üründe zaten stok kaydı var (şu an {existingStock.Quantity} adet). Aşağıda girdiğin adet, mevcut stoğa <span className="text-paper font-semibold">eklenecek</span>.
            </p>
          )}

          {!existingStock && (
            <>
              <div className="flex items-center gap-2">
                <span className="flex-1 h-px bg-hairline" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-slate">veya</span>
                <span className="flex-1 h-px bg-hairline" />
              </div>

              <div>
                <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
                  Yeni Ürün Adı <span className="normal-case text-slate/70">(menüde görünmez, sadece envanter için)</span>
                </label>
                <input
                  type="text"
                  value={newProductName}
                  onChange={(e) => { setNewProductName(e.target.value); if (e.target.value) setProductId(''); }}
                  placeholder="ör. Süt, Kağıt Bardak..."
                  className="w-full border border-hairline rounded-sm px-3 py-2.5 font-body text-paper bg-panel
                             focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
                />
              </div>

              {/* Tür: bu kalem sipariş ekranında bir şurup/ekstra seçeneği
                  olarak da çıksın mı? (bkz. controllers/stockController.js) */}
              <div>
                <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Tür</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'raw', label: '🥩 Hammadde' },
                    { value: 'syrup', label: '🧴 Şurup' },
                    { value: 'extra', label: '➕ Ekstra' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setItemType(opt.value)}
                      className={`text-[11px] font-bold uppercase tracking-wide rounded-xl px-2 py-2 border transition-colors ${
                        itemType === opt.value
                          ? 'border-[#FF6B6B] text-[#FF6B6B] bg-[#FF6B6B]/10'
                          : 'border-hairline text-slate hover:text-paper'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {itemType !== 'raw' && (
                <>
                  <div>
                    <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
                      {itemType === 'syrup' ? 'Şurup' : 'Ekstra'} Ücreti <span className="normal-case text-slate/70">(sipariş ekranında eklenince müşteriden alınacak fiyat)</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={typePrice}
                      onChange={(e) => setTypePrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full border border-hairline rounded-sm px-3 py-2.5 font-mono text-paper bg-panel
                                 focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
                    />
                  </div>
                  <div>
                    <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
                      1 Porsiyon Kaç ml Tüketir? <span className="normal-case text-slate/70">(opsiyonel — girilmezse stoktan otomatik düşülmez)</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={servingSize}
                      onChange={(e) => setServingSize(e.target.value)}
                      placeholder="ör. 10"
                      className="w-full border border-hairline rounded-sm px-3 py-2.5 font-mono text-paper bg-panel
                                 focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
                    />
                  </div>
                </>
              )}
            </>
          )}

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Adet</label>
              <input
                type="number"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full border border-hairline rounded-sm px-3 py-2.5 font-mono text-paper bg-panel
                           focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
              />
            </div>
            {!existingStock && (
            <div className="flex-1">
              <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Minimum Stok</label>
              <input
                type="number"
                min="0"
                value={minStockLevel}
                onChange={(e) => setMinStockLevel(e.target.value)}
                className="w-full border border-hairline rounded-sm px-3 py-2.5 font-mono text-paper bg-panel
                           focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
              />
            </div>
            )}
          </div>

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
              Birim Fiyat <span className="normal-case text-slate/70">(opsiyonel)</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="0.00"
              className="w-full border border-hairline rounded-sm px-3 py-2.5 font-mono text-paper bg-panel
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
              Tedarikçi <span className="normal-case text-slate/70">(opsiyonel)</span>
            </label>
            <input
              type="text"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              className="w-full border border-hairline rounded-sm px-3 py-2.5 font-body text-paper bg-panel
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
              Fatura No <span className="normal-case text-slate/70">(opsiyonel)</span>
            </label>
            <input
              type="text"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              className="w-full border border-hairline rounded-sm px-3 py-2.5 font-body text-paper bg-panel
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
              Not <span className="normal-case text-slate/70">(opsiyonel)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-hairline rounded-sm px-3 py-2.5 font-body text-sm text-paper bg-panel
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>

          {error && (
            <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 bg-panel py-2">{error}</p>
          )}
        </form>

        {/* Alt aksiyon çubuğu */}
        <div className="px-6 py-4 border-t border-hairline shrink-0 bg-panel flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 text-xs font-bold uppercase tracking-wide text-slate hover:text-paper
                       border border-hairline rounded-xl px-4 py-3 transition-colors disabled:opacity-50"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 text-xs font-bold uppercase tracking-wide text-white bg-[#FF6B6B]
                       hover:bg-[#ff5555] active:bg-[#ff4444] disabled:opacity-40 disabled:cursor-not-allowed
                       rounded-xl px-6 py-3 shadow-lg shadow-red-500/10 transition-all"
          >
            {submitting ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Stok Alımı Çekmecesi — Tables sayfasındaki PaymentDrawer ile aynı
// sağdan kayan çekmece görünümünü kullanır (tam ekran modal değil).
// "Düzenle" butonuna basınca açılır; kaydedince stok adedini artırır,
// StockPurchases'a kaydeder, çekmeceyi kapatır ve listeyi tazeler.
// ============================================================
function StockPurchaseDrawer({ item, onClose, onSaved }) {
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState('');
  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!Number.isInteger(Number(quantity)) || Number(quantity) <= 0) {
      setError('Adet pozitif bir tam sayı olmalıdır.');
      return;
    }

    setSubmitting(true);
    try {
      await client.post(`/stock/${item.StockId}/purchase`, {
        Quantity: Number(quantity),
        UnitPrice: unitPrice ? Number(unitPrice) : undefined,
        Supplier: supplier.trim() || undefined,
        InvoiceNumber: invoiceNumber.trim() || undefined,
        Notes: notes.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Stok alımı kaydedilemedi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      {/* Karartma */}
      <div className="absolute inset-0 bg-ink/50" onClick={() => !submitting && onClose()} />

      {/* Çekmece */}
      <div className="relative w-full max-w-md h-full bg-panel shadow-2xl flex flex-col animate-[slideIn_0.2s_ease-out]">
        <style>{`
          @keyframes slideIn {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `}</style>

        {/* Başlık */}
        <div className="px-6 py-4 border-b border-hairline flex items-start justify-between shrink-0 bg-panel">
          <div>
            <p className="text-[10px] font-bold text-[#FF6B6B] tracking-[0.25em] uppercase mb-1">Stok Alımı</p>
            <h2 className="font-display text-lg font-semibold text-paper leading-tight">{item.ProductName}</h2>
          </div>
          <button
            onClick={() => !submitting && onClose()}
            className="font-mono text-xs text-slate hover:text-paper w-9 h-9 flex items-center justify-center shrink-0 rounded-sm hover:bg-charcoal transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Gövde (kaydırılabilir) */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-auto px-6 py-5 bg-hairline/10 space-y-4">
          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Ürün</label>
            <p className="text-paper font-medium bg-panel border border-hairline rounded-sm px-3 py-2.5">{item.ProductName}</p>
          </div>
          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Adet</label>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full border border-hairline rounded-sm px-3 py-2.5 font-mono text-paper bg-panel
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
              Birim Fiyat <span className="normal-case text-slate/70">(opsiyonel)</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="0.00"
              className="w-full border border-hairline rounded-sm px-3 py-2.5 font-mono text-paper bg-panel
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
              Tedarikçi <span className="normal-case text-slate/70">(opsiyonel)</span>
            </label>
            <input
              type="text"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              className="w-full border border-hairline rounded-sm px-3 py-2.5 font-body text-paper bg-panel
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
              Fatura No <span className="normal-case text-slate/70">(opsiyonel)</span>
            </label>
            <input
              type="text"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              className="w-full border border-hairline rounded-sm px-3 py-2.5 font-body text-paper bg-panel
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
              Not <span className="normal-case text-slate/70">(opsiyonel)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-hairline rounded-sm px-3 py-2.5 font-body text-sm text-paper bg-panel
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>

          {error && (
            <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 bg-panel py-2">{error}</p>
          )}
        </form>

        {/* Alt aksiyon çubuğu */}
        <div className="px-6 py-4 border-t border-hairline shrink-0 bg-panel flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 text-xs font-bold uppercase tracking-wide text-slate hover:text-paper
                       border border-hairline rounded-xl px-4 py-3 transition-colors disabled:opacity-50"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 text-xs font-bold uppercase tracking-wide text-white bg-[#FF6B6B]
                       hover:bg-[#ff5555] active:bg-[#ff4444] disabled:opacity-40 disabled:cursor-not-allowed
                       rounded-xl px-6 py-3 shadow-lg shadow-red-500/10 transition-all"
          >
            {submitting ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Stok Kalemi Düzenleme Çekmecesi — Adet ve Minimum Stok'u doğrudan
// üzerine yazarak günceller (PUT /stock/:id). Alım kaydı OLUŞTURMAZ,
// hareket geçmişine düşmez — StockPurchaseDrawer'dan (alım ekleme,
// mevcut adede üstüne ekleme) farklı, doğrudan düzeltme amaçlıdır
// (ör. sayım farkı düzeltme).
// ============================================================
function StockEditDrawer({ item, onClose, onSaved }) {
  const [quantity, setQuantity] = useState(item.Quantity);
  const [minStockLevel, setMinStockLevel] = useState(item.MinStockLevel);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Bu stok kalemine bağlı ürünü şurup/ekstra olarak işaretleme — YENİ bir
  // kayıt açmaz, doğrudan bu ürünü günceller (bkz. backend: setStockItemType).
  const [isSyrup, setIsSyrup] = useState(!!item.IsSyrup);
  const [isExtra, setIsExtra] = useState(!!item.IsExtra);
  const [typePrice, setTypePrice] = useState(item.Price ?? '');
  const [typeSaving, setTypeSaving] = useState(false);
  const [typeError, setTypeError] = useState('');
  const [typeSaved, setTypeSaved] = useState(false);

  const typeChanged = isSyrup !== !!item.IsSyrup || isExtra !== !!item.IsExtra;

  const saveType = async () => {
    setTypeError('');
    setTypeSaved(false);
    if ((isSyrup || isExtra) && (typePrice === '' || Number(typePrice) < 0)) {
      setTypeError('Şurup/Ekstra ücretini girin (negatif olmayan bir sayı).');
      return;
    }
    setTypeSaving(true);
    try {
      await client.patch(`/stock/${item.StockId}/type`, {
        IsSyrup: isSyrup,
        IsExtra: isExtra,
        Price: (isSyrup || isExtra) ? Number(typePrice) : undefined,
      });
      setTypeSaved(true);
      onSaved();
    } catch (err) {
      setTypeError(err.response?.data?.error || 'Kaydedilemedi.');
    } finally {
      setTypeSaving(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (quantity === '' || Number(quantity) < 0 || minStockLevel === '' || Number(minStockLevel) < 0) {
      setError('Adet ve minimum stok negatif olmayan birer sayı olmalıdır.');
      return;
    }

    setSubmitting(true);
    try {
      await client.put(`/stock/${item.StockId}`, {
        Quantity: Number(quantity),
        MinStockLevel: Number(minStockLevel),
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Stok kalemi güncellenemedi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-ink/50" onClick={() => !submitting && onClose()} />

      <div className="relative w-full max-w-md h-full bg-panel shadow-2xl flex flex-col animate-[slideIn_0.2s_ease-out]">
        <style>{`
          @keyframes slideIn {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `}</style>

        <div className="px-6 py-4 border-b border-hairline flex items-start justify-between shrink-0 bg-panel">
          <div>
            <p className="text-[10px] font-bold text-[#FF6B6B] tracking-[0.25em] uppercase mb-1">Stok Düzenle</p>
            <h2 className="font-display text-lg font-semibold text-paper leading-tight">{item.ProductName}</h2>
          </div>
          <button
            onClick={() => !submitting && onClose()}
            className="font-mono text-xs text-slate hover:text-paper w-9 h-9 flex items-center justify-center shrink-0 rounded-sm hover:bg-charcoal transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-auto px-6 py-5 bg-hairline/10 space-y-4">
          <p className="font-mono text-[11px] text-slate bg-hairline/60 border border-hairline rounded-sm px-3 py-2">
            Buradaki değişiklik doğrudan stok kaydını günceller, hareket geçmişine işlenmez. Yeni alım eklemek için "Alım Ekle" butonunu kullanın.
          </p>

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Adet</label>
            <input
              type="number"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full border border-hairline rounded-sm px-3 py-2.5 font-mono text-paper bg-panel
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Minimum Stok</label>
            <input
              type="number"
              min="0"
              value={minStockLevel}
              onChange={(e) => setMinStockLevel(e.target.value)}
              className="w-full border border-hairline rounded-sm px-3 py-2.5 font-mono text-paper bg-panel
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>

          {error && (
            <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 bg-panel py-2">{error}</p>
          )}

          {/* Şurup/Ekstra olarak işaretleme — ayrı bir "kaydet" akışı, adet/min
              stok formunu tetiklemez (backend'de ayrı bir uç, /stock/:id/type). */}
          <div className="border-t border-hairline pt-4 mt-2">
            <p className="font-mono text-xs uppercase tracking-wide text-slate mb-2.5">Ürün Türü</p>
            <div className="space-y-2 mb-3">
              <label className="flex items-center gap-2.5 text-sm text-paper cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSyrup}
                  onChange={(e) => { setIsSyrup(e.target.checked); setTypeSaved(false); }}
                  className="w-4 h-4 accent-[#FF6B6B]"
                />
                Şurup olarak işaretle (sipariş ekranında şurup seçeneği olarak çıkar)
              </label>
              <label className="flex items-center gap-2.5 text-sm text-paper cursor-pointer">
                <input
                  type="checkbox"
                  checked={isExtra}
                  onChange={(e) => { setIsExtra(e.target.checked); setTypeSaved(false); }}
                  className="w-4 h-4 accent-[#FF6B6B]"
                />
                Ekstra olarak işaretle (sipariş ekranında ekstra seçeneği olarak çıkar)
              </label>
            </div>

            {(isSyrup || isExtra) && (
              <div className="mb-3">
                <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Ekstra Ücret</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={typePrice}
                  onChange={(e) => { setTypePrice(e.target.value); setTypeSaved(false); }}
                  placeholder="0.00"
                  className="w-full border border-hairline rounded-sm px-3 py-2.5 font-mono text-paper bg-panel
                             focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
                />
              </div>
            )}

            {typeError && <p className="text-ember text-xs font-medium mb-2">{typeError}</p>}
            {typeSaved && !typeChanged && <p className="text-moss text-xs font-medium mb-2">Kaydedildi ✓</p>}

            <button
              type="button"
              onClick={saveType}
              disabled={typeSaving || !typeChanged}
              className="w-full text-xs font-bold uppercase tracking-wide text-paper border border-hairline
                         hover:border-[#FF6B6B] hover:text-[#FF6B6B] disabled:opacity-40 disabled:cursor-not-allowed
                         rounded-xl px-4 py-2.5 transition-colors"
            >
              {typeSaving ? 'Kaydediliyor...' : 'Ürün Türünü Kaydet'}
            </button>
          </div>
        </form>

        <div className="px-6 py-4 border-t border-hairline shrink-0 bg-panel flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 text-xs font-bold uppercase tracking-wide text-slate hover:text-paper
                       border border-hairline rounded-xl px-4 py-3 transition-colors disabled:opacity-50"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 text-xs font-bold uppercase tracking-wide text-cream bg-azure
                       hover:bg-azure/90 active:bg-azure/80 disabled:opacity-40 disabled:cursor-not-allowed
                       rounded-xl px-6 py-3 shadow-sm transition-colors"
          >
            {submitting ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}
