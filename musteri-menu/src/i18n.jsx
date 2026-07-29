import { createContext, useContext, useState, useCallback } from 'react';

const STORAGE_KEY = 'musteri-menu-lang';

// Müşteri menüsü metinleri — TR varsayılan, sağ üstteki düğmeyle EN'e
// geçilebilir. Tercih localStorage'da saklanır (sayfa yenilense de kalır).
const dict = {
  tr: {
    loadingMenu: 'Menü yükleniyor...',
    errorTitle: 'Bir şeyler ters gitti',
    errorDefault: 'Menü getirilemedi. QR kodu tekrar okutmayı deneyin.',
    orderSendError: 'Sipariş gönderilemedi.',
    invalidLinkTitle: 'QR Kod Gerekli',
    invalidLinkBody: 'Menüyü görüntülemek için masanızdaki QR kodu okutun.',
    table: 'Masa {n}',
    menuTitle: 'Menü',
    searchPlaceholder: 'Menüde ara...',
    popularNow: 'Şu An Popüler',
    all: 'Tümü',
    noProducts: 'Ürün bulunamadı.',
    yourOrderLabel: 'Siparişiniz',
    cartTitle: 'Sepetim',
    emptyCartTitle: 'Sepetiniz boş',
    emptyCartBody: 'Menüden ürün ekleyerek başlayın.',
    tapToEdit: 'Düzenlemek için dokun →',
    kitchenNoteLabel: 'Mutfağa not (opsiyonel)',
    kitchenNotePlaceholder: 'ör. Az pişmiş, glutensiz vb.',
    total: 'Toplam',
    confirmSendQuestion: 'Siparişi göndermek istediğinize emin misiniz?',
    cancel: 'Vazgeç',
    confirmAndSend: 'Onayla ve Gönder',
    sending: 'Gönderiliyor...',
    sendOrder: 'Siparişi Gönder',
    needAHand: 'Yardım İster misiniz?',
    callWaiter: 'Garson Çağır',
    waiterCalled: 'Garson Çağrıldı ✓',
    staffComing: 'Personel size doğru geliyor',
    quickRequests: 'Hızlı İstekler',
    requestBill: 'Hesap İste',
    askForWater: 'Su İste',
    needNapkins: 'Peçete İste',
    extraCutlery: 'Çatal-Bıçak',
    sent: 'İletildi ✓',
    orderStatus: 'Sipariş Durumu',
    statusPending: 'Onay Bekliyor',
    statusApproved: 'Onaylandı — Hazırlanıyor',
    statusRejected: 'Reddedildi',
    serviceCallWaiter: 'Garson çağrıldı',
    serviceRequestBill: 'Hesap istendi',
    serviceAskForWater: 'Su istendi',
    serviceNeedNapkins: 'Peçete istendi',
    serviceExtraCutlery: 'Çatal-bıçak istendi',
    waitingStatus: 'Bekleniyor',
    navMenu: 'Menü',
    navCart: 'Sepet',
    navCall: 'Çağır',
    qty: 'Adet',
    loadingOptions: 'Seçenekler yükleniyor...',
    extras: 'Ekstralar',
    syrups: 'Şuruplar',
    removeFromCart: 'Sepetten Çıkar',
    updateCart: 'Sepeti Güncelle',
    addToCart: 'Sepete Ekle',
  },
  en: {
    loadingMenu: 'Loading menu...',
    errorTitle: 'Something went wrong',
    errorDefault: 'Could not load the menu. Try scanning the QR code again.',
    orderSendError: 'Could not send the order.',
    invalidLinkTitle: 'QR Code Required',
    invalidLinkBody: 'Scan the QR code on your table to view the menu.',
    table: 'Table {n}',
    menuTitle: 'Menu',
    searchPlaceholder: 'Search your menu...',
    popularNow: 'Popular Right Now',
    all: 'All',
    noProducts: 'No products found.',
    yourOrderLabel: 'Your Order',
    cartTitle: 'My Cart',
    emptyCartTitle: 'Your cart is empty',
    emptyCartBody: 'Add items from the menu to get started.',
    tapToEdit: 'Tap to edit →',
    kitchenNoteLabel: 'Note for the kitchen (optional)',
    kitchenNotePlaceholder: 'e.g. no onions, gluten-free...',
    total: 'Total',
    confirmSendQuestion: 'Are you sure you want to send the order?',
    cancel: 'Cancel',
    confirmAndSend: 'Confirm & Send',
    sending: 'Sending...',
    sendOrder: 'Send Order',
    needAHand: 'Need a hand?',
    callWaiter: 'Call Waiter',
    waiterCalled: 'Waiter Called ✓',
    staffComing: 'Someone will be with you shortly',
    quickRequests: 'Quick requests',
    requestBill: 'Request Bill',
    askForWater: 'Ask for Water',
    needNapkins: 'Need Napkins',
    extraCutlery: 'Extra Cutlery',
    sent: 'Sent ✓',
    orderStatus: 'Order status',
    statusPending: 'Pending Approval',
    statusApproved: 'Approved — Preparing',
    statusRejected: 'Rejected',
    serviceCallWaiter: 'Waiter called',
    serviceRequestBill: 'Bill requested',
    serviceAskForWater: 'Water requested',
    serviceNeedNapkins: 'Napkins requested',
    serviceExtraCutlery: 'Cutlery requested',
    waitingStatus: 'Pending',
    navMenu: 'Menu',
    navCart: 'Cart',
    navCall: 'Call',
    qty: 'Qty',
    loadingOptions: 'Loading options...',
    extras: 'Extras',
    syrups: 'Syrups',
    removeFromCart: 'Remove from Cart',
    updateCart: 'Update Cart',
    addToCart: 'Add to Cart',
  },
};

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'en' || stored === 'tr' ? stored : 'tr';
  });

  const toggleLang = useCallback(() => {
    setLang((prev) => {
      const next = prev === 'tr' ? 'en' : 'tr';
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const t = useCallback((key, vars) => {
    let str = dict[lang][key] ?? dict.tr[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(`{${k}}`, v);
      }
    }
    return str;
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage, LanguageProvider içinde kullanılmalı.');
  return ctx;
}
