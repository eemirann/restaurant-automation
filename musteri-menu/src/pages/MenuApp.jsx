import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import client from '../api/client';
import BottomNav from '../components/BottomNav';
import MenuView from '../components/MenuView';
import CartView from '../components/CartView';
import StaffView from '../components/StaffView';
import ProductDetailModal from '../components/ProductDetailModal';
import LanguageToggle from '../components/LanguageToggle';
import { useLanguage } from '../i18n';

// Ana orkestratör: menüyü yükler, sepeti ve görünüm (Menü/Sepet/Çağır)
// durumunu yönetir. Kimlik doğrulaması yok — erişim tamamen URL'deki
// QR token'a bağlı (bkz. backend: controllers/publicMenuController.js).
export default function MenuApp() {
  const { qrToken } = useParams();
  const { t } = useLanguage();

  const [menu, setMenu] = useState(null); // { table, categories, products }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [view, setView] = useState('menu');
  // { [ProductId]: { quantity, extras: {[id]: qty}, syrups: {[id]: qty} } }
  const [cart, setCart] = useState({});
  const [optionsCache, setOptionsCache] = useState({});
  const [selectedProduct, setSelectedProduct] = useState(null);

  const [orderNote, setOrderNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [status, setStatus] = useState(null);
  const [sendingRequest, setSendingRequest] = useState(false);
  const statusIntervalRef = useRef(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    client.get(`/public/menu/${qrToken}`)
      .then((res) => { if (active) setMenu(res.data); })
      .catch((err) => { if (active) setError(err.response?.data?.error || t('errorDefault')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [qrToken]);

  // Sipariş/hizmet isteği durumunu periyodik olarak (canlı soket yok,
  // anonim müşteri istemcisi kimlik doğrulanmış soket kanalına giremez)
  // yoklar. Sadece "Çağır" görünümündeyken anlamlı, ama küçük bir
  // maliyeti olduğu için sürekli çalıştırmakta sakınca yok.
  const fetchStatus = useCallback(() => {
    client.get(`/public/menu/${qrToken}/status`)
      .then((res) => setStatus(res.data))
      .catch(() => {});
  }, [qrToken]);

  useEffect(() => {
    fetchStatus();
    statusIntervalRef.current = setInterval(fetchStatus, 8000);
    return () => clearInterval(statusIntervalRef.current);
  }, [fetchStatus]);

  const setLineForProduct = (productId, line) => {
    setCart((prev) => ({ ...prev, [productId]: line }));
  };

  const removeLineFromCart = (productId) => {
    setCart((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  const openProduct = (product, initialLine) => {
    setSelectedProduct({ product, initialLine: initialLine || cart[product.ProductId] || null });
  };

  const cartCount = Object.values(cart).reduce((sum, l) => sum + l.quantity, 0);

  const submitOrder = async () => {
    setSubmitting(true);
    setSubmitError('');
    try {
      const Items = Object.entries(cart).map(([productId, line]) => ({
        ProductId: Number(productId),
        Quantity: line.quantity,
        Extras: Object.entries(line.extras || {}).map(([id, qty]) => ({ ExtraProductId: Number(id), Quantity: qty })),
        Syrups: Object.entries(line.syrups || {}).map(([id, qty]) => ({ SyrupProductId: Number(id), Quantity: qty })),
      }));

      await client.post(`/public/menu/${qrToken}/order`, { Items, Note: orderNote || undefined });

      setCart({});
      setOrderNote('');
      fetchStatus();
      setView('staff');
    } catch (err) {
      setSubmitError(err.response?.data?.error || t('orderSendError'));
    } finally {
      setSubmitting(false);
    }
  };

  const sendServiceRequest = async (type) => {
    setSendingRequest(true);
    try {
      await client.post(`/public/menu/${qrToken}/request`, { Type: type });
      fetchStatus();
    } catch {
      // Sessizce yut — buton üzerindeki "İletildi" geri bildirimi zaten
      // en fazla küçük bir gecikme yaşar, kritik bir akış değil.
    } finally {
      setSendingRequest(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-charcoal font-body">
        <LanguageToggle />
        <p className="text-slate font-mono text-sm">{t('loadingMenu')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center bg-charcoal font-body">
        <LanguageToggle />
        <div>
          <p className="text-5xl mb-4">😕</p>
          <p className="font-display text-lg font-semibold text-paper mb-2">{t('errorTitle')}</p>
          <p className="text-slate text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-charcoal font-body pb-20">
      <LanguageToggle />
      {view === 'menu' && (
        <MenuView
          tableNumber={menu.table.TableNumber}
          categories={menu.categories}
          products={menu.products}
          cart={cart}
          onOpenProduct={(p) => openProduct(p)}
        />
      )}
      {view === 'cart' && (
        <CartView
          products={menu.products}
          cart={cart}
          optionsCache={optionsCache}
          note={orderNote}
          onNoteChange={setOrderNote}
          onEditLine={(product, line) => openProduct(product, line)}
          onSubmit={submitOrder}
          submitting={submitting}
          error={submitError}
        />
      )}
      {view === 'staff' && (
        <StaffView
          tableNumber={menu.table.TableNumber}
          status={status}
          onSendRequest={sendServiceRequest}
          sending={sendingRequest}
        />
      )}

      <BottomNav
        active={view}
        onChange={setView}
        cartCount={cartCount}
        hasAlert={status?.pendingServiceRequests?.length > 0}
      />

      {selectedProduct && (
        <ProductDetailModal
          qrToken={qrToken}
          product={selectedProduct.product}
          initialLine={selectedProduct.initialLine}
          onOptionsLoaded={(productId, options) => setOptionsCache((prev) => ({ ...prev, [productId]: options }))}
          onClose={() => setSelectedProduct(null)}
          onConfirm={(line) => {
            setLineForProduct(selectedProduct.product.ProductId, line);
            setSelectedProduct(null);
          }}
          onRemove={() => {
            removeLineFromCart(selectedProduct.product.ProductId);
            setSelectedProduct(null);
          }}
        />
      )}
    </div>
  );
}
