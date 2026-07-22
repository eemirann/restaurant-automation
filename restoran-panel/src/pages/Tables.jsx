import { useEffect, useState, useCallback } from 'react';
import client, { imageUrl } from '../api/client';
import { useAuth } from '../context/AuthContext';
import PaymentDrawer from '../components/PaymentDrawer';

const STATUS_CONFIG = {
  Empty: { label: 'Boş', dot: 'bg-moss', border: 'border-sand', bg: 'bg-white' },
  Occupied: { label: 'Dolu', dot: 'bg-ember', border: 'border-ember/40', bg: 'bg-ember/5' },
  Reserved: { label: 'Rezerve', dot: 'bg-amber-500', border: 'border-amber-300', bg: 'bg-amber-50' },
};

const ORDER_STATUS_LABEL = {
  Pending: 'Bekliyor',
  Served: 'Servis Edildi',
  Paid: 'Ödendi',
  Cancelled: 'İptal Edildi',
  Merged: 'Birleştirildi',
};

const FILTERS = [
  { value: '', label: 'Tümü' },
  { value: 'Empty', label: 'Boş' },
  { value: 'Occupied', label: 'Dolu' },
  { value: 'Reserved', label: 'Rezerve' },
];

const money = (n) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(n) || 0);

export default function Tables() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';

  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);

  const [selectedTableId, setSelectedTableId] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTable, setEditingTable] = useState(null);

  const fetchTables = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/tables', {
        params: filter ? { status: filter } : {},
      });
      setTables(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Masalar getirilemedi.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  useEffect(() => {
    client.get('/products').then((res) => setProducts(res.data)).catch(() => {});
    client.get('/categories').then((res) => setCategories(res.data)).catch(() => {});
  }, []);

  const productName = (productId) =>
    products.find((p) => p.ProductId === productId)?.Name || `Ürün #${productId}`;

  const deleteTable = async (tableId) => {
    if (!window.confirm('Bu masayı silmek istediğinize emin misiniz?')) return;
    try {
      await client.delete(`/tables/${tableId}`);
      fetchTables();
    } catch (err) {
      alert(err.response?.data?.error || 'Masa silinemedi.');
    }
  };

  const counts = tables.reduce((acc, t) => {
    acc[t.Status] = (acc[t.Status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-10">
      {/* Başlık */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="font-mono text-xs tracking-[0.3em] text-ember uppercase mb-2">
            Masa Düzeni
          </p>
          <h1 className="font-display text-3xl font-semibold text-ink">Masalar</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchTables}
            className="font-mono text-xs uppercase tracking-wide text-slate hover:text-ember
                       border border-sand rounded-sm px-3 py-2 transition-colors"
          >
            ↻ Yenile
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="font-mono text-xs uppercase tracking-wide text-cream bg-ember
                         hover:bg-ember/90 rounded-sm px-4 py-2 transition-colors"
            >
              + Yeni Masa
            </button>
          )}
        </div>
      </div>

      {/* Durum özeti */}
      <div className="flex gap-6 mb-6 font-mono text-xs text-slate">
        <span><span className="text-ink font-semibold">{tables.length}</span> toplam</span>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full inline-block ${cfg.dot}`} />
            {counts[key] || 0} {cfg.label.toLowerCase()}
          </span>
        ))}
      </div>

      {/* Filtre sekmeleri */}
      <div className="flex gap-1 mb-8 border-b border-sand">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`font-mono text-xs uppercase tracking-wide px-4 py-2.5 border-b-2 transition-colors ${
              filter === f.value
                ? 'border-ember text-ink font-semibold'
                : 'border-transparent text-slate hover:text-ink'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 mb-6">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-slate font-mono text-sm">Yükleniyor...</p>
      ) : tables.length === 0 ? (
        <div className="border border-dashed border-sand rounded-sm p-10 text-center bg-white/50">
          <p className="text-slate font-mono text-sm">Gösterilecek masa bulunamadı.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {tables.map((table) => {
            const cfg = STATUS_CONFIG[table.Status] || STATUS_CONFIG.Empty;
            return (
              <div
                key={table.TableId}
                onClick={() => setSelectedTableId(table.TableId)}
                className={`relative rounded-sm border ${cfg.border} ${cfg.bg} px-5 py-6 cursor-pointer
                            transition-transform hover:-translate-y-0.5 hover:shadow-sm`}
              >
                <span className={`absolute top-4 right-4 w-2 h-2 rounded-full ${cfg.dot}`} />
                <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-3">
                  Masa
                </p>
                <p className="font-display text-3xl font-semibold text-ink mb-3">
                  {table.TableNumber}
                </p>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs text-slate">
                    {table.Capacity} kişilik
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wide text-slate">
                    {cfg.label}
                  </span>
                </div>
                {isAdmin && (
                  <div className="flex gap-2 pt-2 border-t border-sand/60 mt-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingTable(table); }}
                      className="font-mono text-[10px] uppercase tracking-wide text-slate hover:text-ember"
                    >
                      Düzenle
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteTable(table.TableId); }}
                      className="font-mono text-[10px] uppercase tracking-wide text-slate hover:text-ember"
                    >
                      Sil
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedTableId && (
        <TableDetailModal
          tableId={selectedTableId}
          tables={tables}
          products={products}
          categories={categories}
          userId={user?.userId}
          productName={productName}
          onClose={() => setSelectedTableId(null)}
          onChanged={fetchTables}
        />
      )}

      {showCreateModal && (
        <TableFormModal
          title="Yeni Masa"
          onClose={() => setShowCreateModal(false)}
          onSubmit={async (values) => {
            await client.post('/tables', values);
            setShowCreateModal(false);
            fetchTables();
          }}
        />
      )}

      {editingTable && (
        <TableFormModal
          title={`Masa ${editingTable.TableNumber} — Düzenle`}
          initial={editingTable}
          onClose={() => setEditingTable(null)}
          onSubmit={async (values) => {
            await client.patch(`/tables/${editingTable.TableId}`, values);
            setEditingTable(null);
            fetchTables();
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Masa detay paneli: aktif sipariş, elle durum değiştirme, taşı/birleştir
// ============================================================
function TableDetailModal({ tableId, tables, products, categories, userId, productName, onClose, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [showTransferForm, setShowTransferForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get(`/tables/${tableId}`);
      setDetail(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Masa detayı getirilemedi.');
    } finally {
      setLoading(false);
    }
  }, [tableId]);

  useEffect(() => {
    load();
  }, [load]);

  const markStatus = async (status) => {
    setActionError('');
    setActionMessage('');
    try {
      await client.patch(`/tables/${tableId}/status`, { Status: status });
      setActionMessage(`Masa "${STATUS_CONFIG[status].label}" olarak işaretlendi.`);
      await load();
      onChanged();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Durum güncellenemedi.');
    }
  };

  if (loading) {
    return (
      <ModalShell onClose={onClose} title={`Masa ${tableId}`}>
        <p className="text-slate font-mono text-sm">Yükleniyor...</p>
      </ModalShell>
    );
  }

  if (error) {
    return (
      <ModalShell onClose={onClose} title={`Masa ${tableId}`}>
        <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3">{error}</p>
      </ModalShell>
    );
  }

  const cfg = STATUS_CONFIG[detail.Status] || STATUS_CONFIG.Empty;
  const otherTables = tables.filter((t) => t.TableId !== detail.TableId);

  return (
    <ModalShell onClose={onClose} title={`Masa ${detail.TableNumber}`} eyebrow="Masa Detayı" size="xl">
      <div className="flex flex-wrap gap-x-8 gap-y-2 mb-5 font-mono text-xs text-slate">
        <span>Kapasite <span className="text-ink font-semibold">{detail.Capacity} kişi</span></span>
        <span className="flex items-center gap-1.5">
          Durum
          <span className={`inline-flex items-center gap-1.5 border rounded-sm px-2 py-0.5 ${cfg.border} ${cfg.bg}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            <span className="text-ink font-semibold">{cfg.label}</span>
          </span>
        </span>
      </div>

      {(actionError || actionMessage) && (
        <p className={`text-sm font-medium border-l-2 pl-3 mb-4 ${actionError ? 'text-ember border-ember' : 'text-moss border-moss'}`}>
          {actionError || actionMessage}
        </p>
      )}

      {detail.activeOrder ? (
        <>
          <TableOrderCart
            tableId={detail.TableId}
            existingOrderId={detail.activeOrder.OrderId}
            existingOrder={detail.activeOrder}
            userId={userId}
            products={products}
            categories={categories}
            onOrdered={async (msg) => {
              setActionMessage(msg);
              setActionError('');
              await load();
              onChanged();
            }}
            onError={(msg) => setActionError(msg)}
          />

          {!['Paid', 'Cancelled', 'Merged'].includes(detail.activeOrder.Status) && (
            <div className="mt-6 pt-5 border-t border-sand">
              <PaymentDrawer
                order={detail.activeOrder}
                resolveProductName={(productId) => productName(productId)}
                tableLabel={`Masa ${detail.TableNumber}`}
                onPaid={async () => {
                  await load();
                  onChanged();
                }}
              />
            </div>
          )}

          <div className="mt-6 pt-5 border-t border-sand">
          {!showTransferForm ? (
            <button
              onClick={() => setShowTransferForm(true)}
              className="font-mono text-xs uppercase tracking-wide text-cream bg-ember
                         hover:bg-ember/90 rounded-sm px-4 py-2.5 transition-colors w-full"
            >
              Siparişi Taşı / Birleştir
            </button>
          ) : (
            <TransferForm
              fromTableId={detail.TableId}
              orderId={detail.activeOrder.OrderId}
              otherTables={otherTables}
              onCancel={() => setShowTransferForm(false)}
              onDone={(msg) => {
                setShowTransferForm(false);
                setActionMessage(msg);
                setActionError('');
                onChanged();
                onClose();
              }}
              onError={(msg) => setActionError(msg)}
            />
          )}
          </div>
        </>
      ) : (
        <>
          <TableOrderCart
            tableId={detail.TableId}
            userId={userId}
            products={products}
            categories={categories}
            onOrdered={async (msg) => {
              setActionMessage(msg);
              setActionError('');
              await load();
              onChanged();
            }}
            onError={(msg) => setActionError(msg)}
          />

          <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-2 mt-6">Durumu elle değiştir</p>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(STATUS_CONFIG).map(([key, c]) => (
              <button
                key={key}
                disabled={detail.Status === key}
                onClick={() => markStatus(key)}
                className="font-mono text-[11px] uppercase tracking-wide border rounded-sm px-3 py-2 transition-colors
                           disabled:opacity-40 disabled:cursor-not-allowed text-ink border-sand hover:border-ember hover:text-ember"
              >
                {c.label} olarak işaretle
              </button>
            ))}
          </div>
        </>
      )}
    </ModalShell>
  );
}

// ============================================================
// Masada aktif sipariş yokken: ürünleri (fotoğraflı) listele, sepete ekle,
// "Sipariş Ver" ile POST /api/orders çağır. Ekle'ye her basışta aynı yerde
// kalır, sadece o üründeki adet sayacı artar.
// ============================================================
function TableOrderCart({ tableId, existingOrderId, existingOrder, userId, products, categories, onOrdered, onError }) {
  const [cart, setCart] = useState({}); // { [ProductId]: quantity }
  const [activeCategoryId, setActiveCategoryId] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [cartFilter, setCartFilter] = useState('all'); // 'all' | 'inCart'
  const [showNoteField, setShowNoteField] = useState(false);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  const activeProducts = products.filter((p) => p.IsActive !== false && p.IsActive !== 0);

  // Sadece ürünü olan kategorileri sekme olarak göster
  const categoriesWithProducts = categories.filter((c) =>
    activeProducts.some((p) => p.CategoryId === c.CategoryId)
  );

  const normalizedSearch = searchTerm.trim().toLocaleLowerCase('tr-TR');

  const visibleProducts = activeProducts
    .filter((p) =>
      activeCategoryId === 'all' ? true : String(p.CategoryId) === String(activeCategoryId)
    )
    .filter((p) =>
      normalizedSearch ? p.Name.toLocaleLowerCase('tr-TR').includes(normalizedSearch) : true
    )
    .filter((p) => (cartFilter === 'inCart' ? Boolean(cart[p.ProductId]) : true));

  const addToCart = (productId) => {
    setCart((prev) => ({ ...prev, [productId]: (prev[productId] || 0) + 1 }));
  };

  const removeFromCart = (productId) => {
    setCart((prev) => {
      const next = { ...prev };
      if (!next[productId]) return prev;
      next[productId] -= 1;
      if (next[productId] <= 0) delete next[productId];
      return next;
    });
  };

  // Sepetten ürünü tamamen çıkar (sepet panelindeki "çıkar" butonu için)
  const removeLineFromCart = (productId) => {
    setCart((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  const cartEntries = Object.entries(cart); // [[productId, qty], ...]
  const itemCount = cartEntries.reduce((sum, [, qty]) => sum + qty, 0);
  const total = cartEntries.reduce((sum, [productId, qty]) => {
    const product = products.find((p) => String(p.ProductId) === String(productId));
    return sum + (product ? Number(product.Price) * qty : 0);
  }, 0);

  const money = (n) =>
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(n) || 0);

  const submitOrder = async () => {
    setLocalError('');
    if (!existingOrderId && !userId) {
      setLocalError('Kullanıcı bilgisi bulunamadı, tekrar giriş yapın.');
      return;
    }
    if (cartEntries.length === 0) {
      setLocalError('Sepete en az bir ürün ekleyin.');
      return;
    }
    setSubmitting(true);
    try {
      const itemsPayload = cartEntries.map(([productId, quantity]) => ({
        ProductId: Number(productId),
        Quantity: quantity,
      }));

      if (existingOrderId) {
        await client.post(`/orders/${existingOrderId}/items`, { Items: itemsPayload });
      } else {
        await client.post('/orders', {
          TableId: tableId,
          UserId: userId,
          Items: itemsPayload,
          Note: note.trim() || undefined,
        });
      }

      setCart({});
      setNote('');
      setShowNoteField(false);
      await onOrdered?.(existingOrderId ? 'Ürünler siparişe eklendi.' : 'Sipariş oluşturuldu.');
    } catch (err) {
      const msg = err.response?.data?.error || 'İşlem başarısız oldu.';
      setLocalError(msg);
      onError?.(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-2">Sipariş Oluştur</p>

      <div className="flex gap-4 items-start">
        {/* SOL: kategori + arama + ürün listesi (~%70) */}
        <div className="flex-[7] min-w-0">
          {/* Ürün arama kutusu + sepet durum filtresi */}
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Ürün ara..."
              className="flex-1 border border-sand rounded-sm px-4 py-3 min-h-[2.75rem] font-body text-base text-ink
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
            <div className="flex gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setCartFilter('all')}
                className={`font-mono text-xs uppercase tracking-wide px-4 min-h-[2.75rem] rounded-sm border transition-colors ${
                  cartFilter === 'all'
                    ? 'border-ember bg-ember/10 text-ember font-semibold'
                    : 'border-sand text-slate hover:text-ink'
                }`}
              >
                Tümü
              </button>
              <button
                type="button"
                onClick={() => setCartFilter('inCart')}
                className={`font-mono text-xs uppercase tracking-wide px-4 min-h-[2.75rem] rounded-sm border transition-colors whitespace-nowrap ${
                  cartFilter === 'inCart'
                    ? 'border-ember bg-ember/10 text-ember font-semibold'
                    : 'border-sand text-slate hover:text-ink'
                }`}
              >
                Sepettekiler{itemCount > 0 ? ` (${itemCount})` : ''}
              </button>
            </div>
          </div>

          <div className="flex gap-4">
            {categoriesWithProducts.length > 0 && (
              <div className="w-32 shrink-0 flex flex-col gap-1.5 border-r border-sand pr-3">
                <button
                  type="button"
                  onClick={() => setActiveCategoryId('all')}
                  className={`text-left font-mono text-xs uppercase tracking-wide px-3 min-h-[2.75rem] rounded-sm transition-colors ${
                    activeCategoryId === 'all'
                      ? 'bg-ember/10 text-ember font-semibold'
                      : 'text-slate hover:bg-cream/60 hover:text-ink'
                  }`}
                >
                  Tümü
                </button>
                {categoriesWithProducts.map((c) => (
                  <button
                    key={c.CategoryId}
                    type="button"
                    onClick={() => setActiveCategoryId(c.CategoryId)}
                    className={`text-left font-mono text-xs uppercase tracking-wide px-3 min-h-[2.75rem] rounded-sm transition-colors ${
                      String(activeCategoryId) === String(c.CategoryId)
                        ? 'bg-ember/10 text-ember font-semibold'
                        : 'text-slate hover:bg-cream/60 hover:text-ink'
                    }`}
                  >
                    {c.Name}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 min-w-0">
              {visibleProducts.length === 0 ? (
                <p className="text-sm text-slate mb-4">
                  {cartFilter === 'inCart'
                    ? 'Sepette ürün yok.'
                    : normalizedSearch
                    ? 'Aramanızla eşleşen ürün bulunamadı.'
                    : 'Bu kategoride ürün yok.'}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 max-h-[28rem] overflow-auto pr-1">
                  {visibleProducts.map((p) => {
                    const qty = cart[p.ProductId] || 0;
                    return (
                      <div
                        key={p.ProductId}
                        className="border border-sand rounded-sm p-4 flex items-center gap-3 bg-white"
                      >
                        {p.ImageUrl ? (
                          <img
                            src={imageUrl(p.ImageUrl)}
                            alt={p.Name}
                            className="w-16 h-16 object-cover rounded-sm border border-sand shrink-0"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-sm border border-dashed border-sand shrink-0 flex items-center justify-center text-slate text-[10px] font-mono">
                            —
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-ink font-medium truncate">{p.Name}</p>
                          <p className="font-mono text-xs text-slate">{money(p.Price)}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {qty > 0 && (
                            <>
                              <button
                                type="button"
                                onClick={() => removeFromCart(p.ProductId)}
                                className="w-11 h-11 flex items-center justify-center font-mono text-lg text-slate hover:text-ember active:bg-cream border border-sand rounded-sm select-none"
                              >
                                −
                              </button>
                              <span className="font-mono text-sm text-ink w-5 text-center">{qty}</span>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => addToCart(p.ProductId)}
                            className="w-11 h-11 flex items-center justify-center font-mono text-lg text-cream bg-ember hover:bg-ember/90 active:bg-ember/80 rounded-sm select-none"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SAĞ: sabit sepet paneli (~%30) */}
        <div className="flex-[3] shrink-0 border border-sand rounded-sm bg-cream/20 flex flex-col max-h-[32rem]">
          <div className="px-4 pt-4 pb-2">
            <p className="font-mono text-[10px] uppercase tracking-widest text-slate">
              Sepet {itemCount > 0 ? `(${itemCount})` : ''}
            </p>
            {existingOrder && (
              <p className="font-mono text-[10px] text-slate mt-0.5">
                Sipariş #{existingOrder.OrderId} · {ORDER_STATUS_LABEL[existingOrder.Status] || existingOrder.Status}
              </p>
            )}
          </div>

          <div className="flex-1 overflow-auto px-4 space-y-2 min-h-[4rem]">
            {existingOrder && existingOrder.items?.length > 0 && (
              <div className="mb-3">
                <p className="font-mono text-[10px] uppercase tracking-wide text-slate mb-1.5">Sipariş Edilenler</p>
                <div className="border border-sand rounded-sm divide-y divide-sand bg-white/60">
                  {existingOrder.items.map((item, i) => {
                    const product = products.find((p) => p.ProductId === item.ProductId);
                    return (
                      <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="text-ink">{product?.Name || `Ürün #${item.ProductId}`}</span>
                        <span className="font-mono text-xs text-slate">
                          <span className="text-ink">{item.Quantity}×</span> {money(item.UnitPrice)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {existingOrder && existingOrder.items?.length > 0 && (
              <p className="font-mono text-[10px] uppercase tracking-wide text-slate mb-1.5">Yeni Eklenecekler</p>
            )}

            {cartEntries.length === 0 ? (
              <p className="text-sm text-slate py-6 text-center">
                {existingOrder ? 'Eklenecek ürün seçilmedi' : 'Sepet boş'}
              </p>
            ) : (
              cartEntries.map(([productId, qty]) => {
                const product = products.find((p) => String(p.ProductId) === String(productId));
                return (
                  <div key={productId} className="border border-sand rounded-sm bg-white p-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-sm text-ink font-medium leading-tight">
                        {product?.Name || `Ürün #${productId}`}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeLineFromCart(productId)}
                        className="font-mono text-xs text-slate hover:text-ember shrink-0 w-8 h-8 flex items-center justify-center"
                        title="Sepetten çıkar"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => removeFromCart(productId)}
                          className="w-9 h-9 flex items-center justify-center font-mono text-base text-slate hover:text-ember active:bg-cream border border-sand rounded-sm select-none"
                        >
                          −
                        </button>
                        <span className="font-mono text-sm text-ink w-5 text-center">{qty}</span>
                        <button
                          type="button"
                          onClick={() => addToCart(productId)}
                          className="w-9 h-9 flex items-center justify-center font-mono text-base text-cream bg-ember hover:bg-ember/90 active:bg-ember/80 rounded-sm select-none"
                        >
                          +
                        </button>
                      </div>
                      <span className="font-mono text-xs text-slate">
                        {money((Number(product?.Price) || 0) * qty)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="px-4 pt-3 border-t border-sand mt-2">
            {/* Not ekleme — sadece yeni sipariş oluştururken (masada aktif sipariş yokken) */}
            {!existingOrderId && (
              <div className="mb-3">
                {!showNoteField ? (
                  <button
                    type="button"
                    onClick={() => setShowNoteField(true)}
                    className="font-mono text-[11px] uppercase tracking-wide text-slate hover:text-ember"
                  >
                    + Not Ekle
                  </button>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-mono text-[10px] uppercase tracking-wide text-slate">Sipariş Notu</label>
                      <button
                        type="button"
                        onClick={() => { setShowNoteField(false); setNote(''); }}
                        className="font-mono text-[10px] text-slate hover:text-ember"
                      >
                        Kaldır
                      </button>
                    </div>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      placeholder="ör. Az pişmiş, glutensiz vb."
                      className="w-full border border-sand rounded-sm px-3 py-2 font-body text-sm text-ink
                                 focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
                    />
                  </div>
                )}
              </div>
            )}

            {localError && (
              <p className="text-ember text-xs font-medium border-l-2 border-ember pl-2 mb-3">{localError}</p>
            )}

            {existingOrder ? (
              <div className="mb-3 space-y-1">
                <div className="flex items-center justify-between font-mono text-xs text-slate">
                  <span>Mevcut Tutar</span>
                  <span>{money(existingOrder.TotalAmount)}</span>
                </div>
                <div className="flex items-center justify-between font-mono text-xs text-slate">
                  <span>Eklenecek</span>
                  <span>{money(total)}</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-sand">
                  <span className="font-mono text-xs text-slate uppercase tracking-wide">Genel Toplam</span>
                  <span className="font-mono text-ink font-semibold text-base">
                    {money(Number(existingOrder.TotalAmount || 0) + total)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-xs text-slate uppercase tracking-wide">Toplam</span>
                <span className="font-mono text-ink font-semibold text-base">{money(total)}</span>
              </div>
            )}

            <button
              type="button"
              onClick={submitOrder}
              disabled={submitting || itemCount === 0}
              className="w-full font-mono text-sm uppercase tracking-wide text-cream bg-ember
                         hover:bg-ember/90 active:bg-ember/80 disabled:opacity-40 disabled:cursor-not-allowed
                         rounded-sm px-6 py-3.5 min-h-[3rem] transition-colors mb-4"
            >
              {submitting ? 'Gönderiliyor...' : existingOrderId ? 'Siparişe Ekle' : 'Sipariş Ver'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Taşı / Birleştir alt formu
// ============================================================
function TransferForm({ fromTableId, orderId, otherTables, onCancel, onDone, onError }) {
  const [toTableId, setToTableId] = useState('');
  const [transferType, setTransferType] = useState('Move');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setLocalError('');
    if (!toTableId) {
      setLocalError('Hedef masa seçmelisiniz.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await client.post(`/tables/${fromTableId}/transfer`, {
        OrderId: orderId,
        ToTableId: Number(toTableId),
        TransferType: transferType,
        Reason: reason || undefined,
      });
      onDone(res.data.message || 'İşlem tamamlandı.');
    } catch (err) {
      const msg = err.response?.data?.error || 'Taşıma/birleştirme işlemi başarısız oldu.';
      setLocalError(msg);
      onError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border border-sand rounded-sm p-4 space-y-3 bg-cream/30">
      <div>
        <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Hedef Masa</label>
        <select
          value={toTableId}
          onChange={(e) => setToTableId(e.target.value)}
          className="w-full border border-sand rounded-sm px-3 py-2 font-body text-sm text-ink
                     focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
        >
          <option value="">Masa seçin</option>
          {otherTables.map((t) => (
            <option key={t.TableId} value={t.TableId}>
              Masa {t.TableNumber} ({STATUS_CONFIG[t.Status]?.label || t.Status})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">İşlem Türü</label>
        <div className="flex gap-4 font-mono text-xs text-ink">
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={transferType === 'Move'} onChange={() => setTransferType('Move')} />
            Taşı (hedef masa boş olmalı)
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={transferType === 'Merge'} onChange={() => setTransferType('Merge')} />
            Birleştir (hedefte aktif sipariş olmalı)
          </label>
        </div>
      </div>

      <div>
        <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Sebep (opsiyonel)</label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full border border-sand rounded-sm px-3 py-2 font-body text-sm text-ink
                     focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
          placeholder="ör. Misafir talebi"
        />
      </div>

      {localError && (
        <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3">{localError}</p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="font-mono text-xs uppercase tracking-wide text-slate hover:text-ink
                     border border-sand rounded-sm px-3 py-2 transition-colors"
        >
          Vazgeç
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="font-mono text-xs uppercase tracking-wide text-cream bg-ember
                     hover:bg-ember/90 disabled:opacity-50 rounded-sm px-4 py-2 transition-colors"
        >
          {submitting ? 'İşleniyor...' : 'Onayla'}
        </button>
      </div>
    </form>
  );
}

// ============================================================
// Masa oluşturma / düzenleme formu (Admin)
// ============================================================
function TableFormModal({ title, initial, onClose, onSubmit }) {
  const [tableNumber, setTableNumber] = useState(initial?.TableNumber ?? '');
  const [capacity, setCapacity] = useState(initial?.Capacity ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!tableNumber || !capacity) {
      setError('Masa numarası ve kapasite zorunludur.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ TableNumber: Number(tableNumber), Capacity: Number(capacity) });
    } catch (err) {
      setError(err.response?.data?.error || 'İşlem başarısız oldu.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell onClose={onClose} title={title} eyebrow="Masa">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Masa Numarası</label>
          <input
            type="number"
            min="1"
            value={tableNumber}
            onChange={(e) => setTableNumber(e.target.value)}
            className="w-full border border-sand rounded-sm px-3 py-2.5 font-body text-ink
                       focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
          />
        </div>
        <div>
          <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Kapasite</label>
          <input
            type="number"
            min="1"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            className="w-full border border-sand rounded-sm px-3 py-2.5 font-body text-ink
                       focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
          />
        </div>

        {error && (
          <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3">{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-xs uppercase tracking-wide text-slate hover:text-ink
                       border border-sand rounded-sm px-4 py-2.5 transition-colors"
          >
            Vazgeç
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="font-mono text-xs uppercase tracking-wide text-cream bg-ember
                       hover:bg-ember/90 disabled:opacity-50 rounded-sm px-4 py-2.5 transition-colors"
          >
            {submitting ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ============================================================
// Ortak modal kabuğu
// ============================================================
function ModalShell({ title, eyebrow, onClose, children, size = 'md' }) {
  const widthClass = size === 'xl' ? 'max-w-[90vw]' : size === 'lg' ? 'max-w-3xl' : 'max-w-lg';
  const heightClass = size === 'xl' ? 'max-h-[92vh]' : 'max-h-[88vh]';
  return (
    <div className="fixed inset-0 bg-ink/40 flex items-center justify-center px-4 z-50" onClick={onClose}>
      <div
        className={`bg-white rounded-sm border border-sand w-full ${widthClass} ${heightClass} overflow-auto shadow-lg`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-sand flex items-start justify-between">
          <div>
            {eyebrow && <p className="font-mono text-xs tracking-[0.2em] text-ember uppercase mb-1">{eyebrow}</p>}
            <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
          </div>
          <button onClick={onClose} className="font-mono text-xs text-slate hover:text-ink">
            Kapat ✕
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
