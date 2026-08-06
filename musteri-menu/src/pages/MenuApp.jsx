import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import client from '../api/client';
import BottomNav from '../components/BottomNav';
import MenuView from '../components/MenuView';
import CartView from '../components/CartView';
import StaffView from '../components/StaffView';
import ProductDetailModal from '../components/ProductDetailModal';
import LanguageToggle from '../components/LanguageToggle';
import InfoDrawer from '../components/InfoDrawer';
import CampaignCarousel from '../components/CampaignCarousel';
import LoyaltyGate from '../components/LoyaltyGate';
import WhoPaysGame from '../components/WhoPaysGame';
import { useLanguage } from '../i18n';
import { isOpenNow } from '../utils/businessHours';
import { useLoyaltyAccount } from '../hooks/useLoyaltyAccount';

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

  // Kampanya/combo karüseli — { [ComboOfferId]: quantity }. Combo bilgisi
  // (isim/fiyat/içerik) sepette gösterilirken campaigns listesinden bulunur,
  // ayrıca saklanmaz (tek doğruluk kaynağı: GET .../campaigns).
  const [campaigns, setCampaigns] = useState([]);
  const [comboCart, setComboCart] = useState({});

  const [orderNote, setOrderNote] = useState('');
  const [username, setUsername] = useState('');
  const [tipAmount, setTipAmount] = useState(0);

  // Cihazda hatırlanan sadakat hesabı — varsa Username otomatik doldurulur,
  // müşteri her siparişte tekrar yazmak zorunda kalmaz (bkz. hooks/
  // useLoyaltyAccount.js). Opt-in: hesap yoksa <LoyaltyGate> ile sunulur.
  const loyalty = useLoyaltyAccount(qrToken);
  useEffect(() => {
    if (loyalty.account?.username && !username) setUsername(loyalty.account.username);
  }, [loyalty.account?.username]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [status, setStatus] = useState(null);
  const [sendingRequest, setSendingRequest] = useState(false);
  const statusIntervalRef = useRef(null);

  // Restoran adı/logo/açılış-kapanış saati — RESTAURANT (masa/qrToken'a bağlı
  // değil, tüm restoran için tek), InfoDrawer'ın lazy-fetch etmesi yerine
  // burada EAGER fetch edilir: "kapalı" banner'ı çekmece açılmadan, sayfa
  // yüklenir yüklenmez görünmeli (bkz. GET /api/settings — kimlik
  // doğrulamasız, panelin login ekranıyla da paylaşılan aynı uç).
  const [info, setInfo] = useState(null);
  useEffect(() => {
    let active = true;
    client.get('/settings').then((res) => { if (active) setInfo(res.data); }).catch(() => { if (active) setInfo({}); });
    return () => { active = false; };
  }, []);

  // Sunucu zaten POST .../order'da bunu YETKİLİ olarak reddediyor (bkz.
  // controllers/publicMenuController.js) — buradaki hesap sadece anında
  // banner göstermek ve "gönder" düğmesini önceden kapatmak içindir.
  const closed = info ? !isOpenNow(info.OpeningTime, info.ClosingTime) : false;

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

  // Kampanya karüseli — menüyle birlikte, ayrı ve sessizce (hata olursa
  // karüsel sadece hiç render edilmez, ana menüyü etkilemez).
  useEffect(() => {
    let active = true;
    client.get(`/public/menu/${qrToken}/campaigns`)
      .then((res) => { if (active) setCampaigns(res.data); })
      .catch(() => {});
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

  const addComboToCart = (comboOfferId, delta = 1) => {
    setComboCart((prev) => {
      const next = (prev[comboOfferId] || 0) + delta;
      const clone = { ...prev };
      if (next <= 0) delete clone[comboOfferId];
      else clone[comboOfferId] = next;
      return clone;
    });
  };

  const removeComboFromCart = (comboOfferId) => {
    setComboCart((prev) => {
      const next = { ...prev };
      delete next[comboOfferId];
      return next;
    });
  };

  const cartCount = Object.values(cart).reduce((sum, l) => sum + l.quantity, 0)
    + Object.values(comboCart).reduce((sum, q) => sum + q, 0);

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
      const Combos = Object.entries(comboCart).map(([comboOfferId, quantity]) => ({
        ComboOfferId: Number(comboOfferId),
        Quantity: quantity,
      }));

      await client.post(`/public/menu/${qrToken}/order`, {
        Items: Items.length > 0 ? Items : undefined,
        Combos: Combos.length > 0 ? Combos : undefined,
        Note: orderNote || undefined,
        Username: username.trim() || undefined,
        TipAmount: tipAmount > 0 ? tipAmount : undefined,
      });

      setCart({});
      setComboCart({});
      setOrderNote('');
      setTipAmount(0);
      fetchStatus();
      loyalty.refresh();
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
      <div className="min-h-screen flex items-center justify-center bg-paper font-body">
        <LanguageToggle />
        <InfoDrawer info={info} />
        <p className="text-muted text-sm tracking-wide">{t('loadingMenu')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center bg-paper font-body">
        <LanguageToggle />
        <InfoDrawer info={info} />
        <div>
          <p className="text-5xl mb-4">😕</p>
          <p className="font-display text-lg font-semibold text-ink mb-2">{t('errorTitle')}</p>
          <p className="text-muted text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper font-body pb-24">
      <LanguageToggle />
      <InfoDrawer info={info} />
      {closed && (
        <div className="sticky top-0 z-40 bg-ink text-cream text-center py-2.5 px-4 text-xs font-medium tracking-wide">
          {info.OpeningTime && info.ClosingTime
            ? t('closedWithHours', { open: info.OpeningTime, close: info.ClosingTime })
            : t('closedNow')}
        </div>
      )}
      {view === 'menu' && (
        <>
          {!loyalty.account && <LoyaltyGate loyalty={loyalty} />}
          <CampaignCarousel campaigns={campaigns} onAddCombo={(comboOfferId) => addComboToCart(comboOfferId, 1)} />
          <MenuView
            tableNumber={menu.table.TableNumber}
            categories={menu.categories}
            products={menu.products}
            cart={cart}
            onOpenProduct={(p) => openProduct(p)}
            logoUrl={info?.LogoUrl}
            restaurantName={info?.RestaurantName}
          />
        </>
      )}
      {view === 'cart' && (
        <CartView
          products={menu.products}
          cart={cart}
          optionsCache={optionsCache}
          campaigns={campaigns}
          comboCart={comboCart}
          onComboQuantityChange={addComboToCart}
          onRemoveCombo={removeComboFromCart}
          note={orderNote}
          onNoteChange={setOrderNote}
          username={username}
          onUsernameChange={setUsername}
          loyalty={loyalty}
          onTipAmountChange={setTipAmount}
          onEditLine={(product, line) => openProduct(product, line)}
          onSubmit={submitOrder}
          submitting={submitting}
          error={submitError}
          closed={closed}
        />
      )}
      {view === 'staff' && (
        <StaffView
          qrToken={qrToken}
          tableNumber={menu.table.TableNumber}
          status={status}
          onSendRequest={sendServiceRequest}
          sending={sendingRequest}
          loyalty={loyalty}
        />
      )}
      {view === 'game' && <WhoPaysGame />}

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
