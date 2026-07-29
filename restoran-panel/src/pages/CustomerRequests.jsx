import { useEffect, useState, useCallback, useRef } from 'react';
import QRCode from 'qrcode';
import client, { CUSTOMER_MENU_URL } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { getSocket } from '../api/socket';

const SERVICE_TYPE_LABELS = {
  CallWaiter: { label: 'Garson Çağırıyor', icon: '🔔' },
  RequestBill: { label: 'Hesap İstiyor', icon: '🧾' },
  AskForWater: { label: 'Su İstiyor', icon: '💧' },
  NeedNapkins: { label: 'Peçete İstiyor', icon: '🧻' },
  ExtraCutlery: { label: 'Çatal-Bıçak İstiyor', icon: '🍴' },
};

const timeAgo = (iso) => {
  if (!iso) return '—';
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return 'az önce';
  if (diffMin < 60) return `${diffMin} dk önce`;
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

// ============================================================
// Müşteri QR menüsünden gelen istekler — sipariş onay/red ve
// hızlı hizmet istekleri (garson çağır, hesap, su, peçete, çatal-bıçak).
// Ayrıca (SADECE ADMIN) masa QR kodlarını gösterir/yazdırır.
// ============================================================
export default function CustomerRequests() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';

  const [orderRequests, setOrderRequests] = useState([]);
  const [serviceRequests, setServiceRequests] = useState([]);
  const [productNames, setProductNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const [showQrCodes, setShowQrCodes] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [ordersRes, servicesRes] = await Promise.all([
        client.get('/customer-orders', { params: { status: 'Pending' } }),
        client.get('/service-requests', { params: { status: 'Pending' } }),
      ]);
      setOrderRequests(ordersRes.data);
      setServiceRequests(servicesRes.data);
    } catch (err) {
      setError(err.response?.data?.error || 'İstekler getirilemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Ürün/ekstra/şurup adlarını çözmek için tüm ürünleri (ekstra/şurup dahil) çek
  useEffect(() => {
    client.get('/products', { params: { raw: 'all' } })
      .then((res) => {
        const map = {};
        res.data.forEach((p) => { map[p.ProductId] = p.Name; });
        setProductNames(map);
      })
      .catch(() => {});
  }, []);

  // Yeni istek geldiğinde anlık tazele
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    const handler = () => fetchAll();
    socket.on('customerRequests:new', handler);
    return () => socket.off('customerRequests:new', handler);
  }, [fetchAll]);

  const approveOrder = async (id) => {
    setActionError('');
    setBusyId(id);
    try {
      await client.post(`/customer-orders/${id}/approve`);
      fetchAll();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Sipariş onaylanamadı.');
    } finally {
      setBusyId(null);
    }
  };

  const rejectOrder = async (id) => {
    if (!window.confirm('Bu sipariş isteği reddedilsin mi?')) return;
    setActionError('');
    setBusyId(id);
    try {
      await client.post(`/customer-orders/${id}/reject`);
      fetchAll();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Sipariş reddedilemedi.');
    } finally {
      setBusyId(null);
    }
  };

  const resolveService = async (id) => {
    setActionError('');
    setBusyId(id);
    try {
      await client.patch(`/service-requests/${id}/resolve`);
      fetchAll();
    } catch (err) {
      setActionError(err.response?.data?.error || 'İstek çözümlenemedi.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-10">
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="font-mono text-xs tracking-[0.3em] text-ember uppercase mb-2">
            Müşteri QR Menü
          </p>
          <h1 className="font-display text-3xl font-semibold text-paper">Müşteri İstekleri</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchAll}
            className="font-mono text-xs uppercase tracking-wide text-slate hover:text-ember
                       border border-hairline rounded-sm px-3 py-2 transition-colors"
          >
            ↻ Yenile
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowQrCodes(true)}
              className="font-mono text-xs uppercase tracking-wide text-cream bg-ember
                         hover:bg-ember/90 rounded-sm px-4 py-2 transition-colors"
            >
              📱 Masa QR Kodları
            </button>
          )}
        </div>
      </div>

      {(error || actionError) && (
        <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 mb-6">
          {error || actionError}
        </p>
      )}

      {loading ? (
        <p className="text-slate font-mono text-sm">Yükleniyor...</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Sipariş istekleri */}
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-3">
              Bekleyen Sipariş İstekleri ({orderRequests.length})
            </p>
            {orderRequests.length === 0 ? (
              <div className="border border-dashed border-hairline rounded-sm p-8 text-center bg-panel/50">
                <p className="text-slate font-mono text-sm">Bekleyen sipariş isteği yok.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {orderRequests.map((r) => (
                  <div key={r.CustomerOrderRequestId} className="border border-hairline rounded-lg bg-panel p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-display text-lg font-semibold text-paper">Masa {r.TableNumber}</span>
                      <span className="font-mono text-[11px] text-slate">{timeAgo(r.CreatedAt)}</span>
                    </div>
                    <div className="space-y-1.5 mb-3">
                      {r.items.map((item, i) => (
                        <div key={i} className="text-sm">
                          <span className="text-paper">{item.Quantity}x {item.ProductName}</span>
                          {(item.Extras?.length > 0 || item.Syrups?.length > 0) && (
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {(item.Extras || []).map((e, ei) => (
                                <span key={`e-${ei}`} className="font-mono text-[10px] text-slate border border-hairline rounded-full px-1.5 py-0.5">
                                  {e.Quantity}x {productNames[e.ExtraProductId] || `#${e.ExtraProductId}`}
                                </span>
                              ))}
                              {(item.Syrups || []).map((s, si) => (
                                <span key={`s-${si}`} className="font-mono text-[10px] text-slate border border-hairline rounded-full px-1.5 py-0.5">
                                  {s.Quantity}x {productNames[s.SyrupProductId] || `#${s.SyrupProductId}`}
                                </span>
                              ))}
                            </div>
                          )}
                          {item.Note && <p className="font-mono text-[11px] text-azure/90 mt-0.5">📝 {item.Note}</p>}
                        </div>
                      ))}
                    </div>
                    {r.Note && (
                      <p className="text-sm text-paper mb-3 border-l-2 border-hairline pl-2">{r.Note}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => approveOrder(r.CustomerOrderRequestId)}
                        disabled={busyId === r.CustomerOrderRequestId}
                        className="flex-1 font-mono text-xs uppercase tracking-wide text-cream bg-moss
                                   hover:bg-moss/90 disabled:opacity-50 rounded-sm px-4 py-2.5 transition-colors"
                      >
                        {busyId === r.CustomerOrderRequestId ? '...' : 'Onayla'}
                      </button>
                      <button
                        onClick={() => rejectOrder(r.CustomerOrderRequestId)}
                        disabled={busyId === r.CustomerOrderRequestId}
                        className="flex-1 font-mono text-xs uppercase tracking-wide text-ember hover:text-ember/80
                                   border border-ember/40 disabled:opacity-50 rounded-sm px-4 py-2.5 transition-colors"
                      >
                        Reddet
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Hizmet istekleri */}
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-3">
              Bekleyen Hizmet İstekleri ({serviceRequests.length})
            </p>
            {serviceRequests.length === 0 ? (
              <div className="border border-dashed border-hairline rounded-sm p-8 text-center bg-panel/50">
                <p className="text-slate font-mono text-sm">Bekleyen hizmet isteği yok.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {serviceRequests.map((r) => {
                  const cfg = SERVICE_TYPE_LABELS[r.Type] || { label: r.Type, icon: '❓' };
                  return (
                    <div key={r.ServiceRequestId} className="border border-hairline rounded-lg bg-panel p-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl leading-none">{cfg.icon}</span>
                        <div>
                          <p className="text-paper font-medium">Masa {r.TableNumber} — {cfg.label}</p>
                          <p className="font-mono text-[11px] text-slate">{timeAgo(r.CreatedAt)}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => resolveService(r.ServiceRequestId)}
                        disabled={busyId === r.ServiceRequestId}
                        className="font-mono text-xs uppercase tracking-wide text-cream bg-ember
                                   hover:bg-ember/90 disabled:opacity-50 rounded-sm px-4 py-2.5 transition-colors shrink-0"
                      >
                        {busyId === r.ServiceRequestId ? '...' : 'Hallettim'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {showQrCodes && <TableQrCodesModal onClose={() => setShowQrCodes(false)} />}
    </div>
  );
}

// ============================================================
// Masa QR kodları (SADECE ADMIN) — GET /api/tables/qrcodes
// Her masa için CUSTOMER_MENU_URL + '/' + QrToken linkini QR koda çevirir.
// ============================================================
function TableQrCodesModal({ onClose }) {
  const [tables, setTables] = useState([]);
  const [qrImages, setQrImages] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const printRef = useRef(null);

  useEffect(() => {
    let active = true;
    client.get('/tables/qrcodes')
      .then(async (res) => {
        if (!active) return;
        setTables(res.data);
        const images = {};
        for (const t of res.data) {
          const url = `${CUSTOMER_MENU_URL}/${t.QrToken}`;
          images[t.TableId] = await QRCode.toDataURL(url, { width: 220, margin: 1 });
        }
        if (active) setQrImages(images);
      })
      .catch((err) => { if (active) setError(err.response?.data?.error || 'QR kodları getirilemedi.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const printAll = () => {
    const w = window.open('', 'PRINT', 'height=800,width=600');
    if (!w || !printRef.current) return;
    w.document.write(`
      <html><head><title>Masa QR Kodları</title>
      <style>
        * { font-family: sans-serif; }
        .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; padding: 24px; }
        .card { text-align: center; border: 1px solid #ccc; border-radius: 8px; padding: 16px; page-break-inside: avoid; }
        .card img { width: 180px; height: 180px; }
        .card p { margin: 8px 0 0; font-weight: bold; }
      </style>
      </head><body>${printRef.current.innerHTML}</body></html>
    `);
    w.document.close();
    w.focus();
    w.print();
    w.close();
  };

  return (
    <div className="fixed inset-0 bg-ink/50 flex items-center justify-center px-4 z-50" onClick={onClose}>
      <div
        className="bg-panel rounded-lg border border-hairline w-full max-w-3xl max-h-[85vh] overflow-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-hairline flex items-center justify-between shrink-0 sticky top-0 bg-panel">
          <h2 className="font-display text-xl font-semibold text-paper">Masa QR Kodları</h2>
          <div className="flex gap-2">
            <button
              onClick={printAll}
              disabled={loading || tables.length === 0}
              className="font-mono text-xs uppercase tracking-wide text-cream bg-ember hover:bg-ember/90
                         disabled:opacity-40 rounded-sm px-4 py-2 transition-colors"
            >
              🖨 Tümünü Yazdır
            </button>
            <button onClick={onClose} className="font-mono text-xs text-slate hover:text-paper w-9 h-9 flex items-center justify-center">✕</button>
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <p className="text-slate font-mono text-sm">QR kodları oluşturuluyor...</p>
          ) : error ? (
            <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3">{error}</p>
          ) : (
            <div ref={printRef} className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {tables.map((t) => (
                <div key={t.TableId} className="card border border-hairline rounded-lg p-4 text-center bg-white">
                  {qrImages[t.TableId] && <img src={qrImages[t.TableId]} alt={`Masa ${t.TableNumber} QR`} className="mx-auto" />}
                  <p className="font-mono text-sm font-semibold text-ink mt-2">Masa {t.TableNumber}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
