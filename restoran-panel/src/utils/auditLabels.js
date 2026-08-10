// ============================================================
// Denetim günlüğü (AuditLog) aksiyon etiketleri + yardımcı formatlayıcılar.
// Hem Audit.jsx (genel denetim günlüğü sayfası) hem Orders.jsx (sipariş
// detayındaki "Geçmiş" zaman çizelgesi) AYNI AuditLog kayıtlarını farklı
// filtrelerle gösterdiği için tek yerde toplanır (kod tekrarından kaçın).
// ============================================================

export const ACTIONS = {
  ORDER_CANCEL: { label: 'Sipariş İptal', cls: 'border-red-500/40 bg-red-500/10 text-red-500' },
  ORDER_ITEM_ADD: { label: 'Ürün Eklendi', cls: 'border-moss/40 bg-moss/10 text-moss' },
  ORDER_ITEM_REMOVE: { label: 'Ürün Çıkarıldı', cls: 'border-red-500/40 bg-red-500/10 text-red-500' },
  ORDER_ITEM_QTY_CHANGE: { label: 'Adet Değişti', cls: 'border-amber-500/40 bg-amber-500/10 text-amber-500' },
  ORDER_STATUS_CHANGE: { label: 'Durum Değişti', cls: 'border-azure/40 bg-azure/10 text-azure' },
  PAYMENT_REFUND: { label: 'İade', cls: 'border-red-500/40 bg-red-500/10 text-red-500' },
  PAYMENT_DELETE: { label: 'Ödeme Silme', cls: 'border-red-500/40 bg-red-500/10 text-red-500' },
  DISCOUNT_APPLIED: { label: 'İndirim', cls: 'border-amber-500/40 bg-amber-500/10 text-amber-500' },
  TABLE_TRANSFER: { label: 'Masa Transfer', cls: 'border-azure/40 bg-azure/10 text-azure' },
  SHIFT_OPEN: { label: 'Vardiya Açıldı', cls: 'border-moss/40 bg-moss/10 text-moss' },
  SHIFT_CLOSE: { label: 'Vardiya Kapandı', cls: 'border-slate/40 bg-slate/10 text-slate' },
  PRODUCT_86: { label: 'Tükendi', cls: 'border-ember/40 bg-ember/10 text-ember' },
  LOGIN: { label: 'Giriş', cls: 'border-moss/40 bg-moss/10 text-moss' },
  LOGOUT: { label: 'Çıkış', cls: 'border-slate/40 bg-slate/10 text-slate' },
  FORCED_CLOSE: { label: 'Zorla Kapatma', cls: 'border-red-500/40 bg-red-500/10 text-red-500' },
  FORCED_LOGOUT: { label: 'Zorla Çıkış', cls: 'border-red-500/40 bg-red-500/10 text-red-500' },
  SHIFT_TRANSFER: { label: 'Vardiya Devri', cls: 'border-azure/40 bg-azure/10 text-azure' },
  USER_CREATE: { label: 'Kullanıcı Oluştur', cls: 'border-moss/40 bg-moss/10 text-moss' },
  USER_ROLE_CHANGE: { label: 'Rol Değişimi', cls: 'border-amber-500/40 bg-amber-500/10 text-amber-500' },
  USER_DEACTIVATE: { label: 'Kullanıcı Pasife Alma', cls: 'border-red-500/40 bg-red-500/10 text-red-500' },
  USER_REACTIVATE: { label: 'Kullanıcı Aktifleştirme', cls: 'border-moss/40 bg-moss/10 text-moss' },
  USER_PASSWORD_RESET: { label: 'Şifre Sıfırlama', cls: 'border-azure/40 bg-azure/10 text-azure' },
  USER_PIN_RESET: { label: 'PIN Sıfırlama', cls: 'border-azure/40 bg-azure/10 text-azure' },
  SETTINGS_UPDATE: { label: 'Ayar Güncelleme', cls: 'border-slate/40 bg-slate/10 text-slate' },
  INVOICE_PROVIDER_SETTINGS_UPDATE: { label: 'e-Fatura Ayarı', cls: 'border-slate/40 bg-slate/10 text-slate' },
  STOCK_ITEM_DELETE: { label: 'Stok Kalemi Sil', cls: 'border-red-500/40 bg-red-500/10 text-red-500' },
  STOCK_ITEM_REACTIVATE: { label: 'Stok Kalemi Aktifleştir', cls: 'border-moss/40 bg-moss/10 text-moss' },
  CAMPAIGN_CREATE: { label: 'Kampanya Oluştur', cls: 'border-moss/40 bg-moss/10 text-moss' },
  CAMPAIGN_DELETE: { label: 'Kampanya Sil', cls: 'border-red-500/40 bg-red-500/10 text-red-500' },
  CAMPAIGN_ACTIVITY_CHANGE: { label: 'Kampanya Aktiflik', cls: 'border-amber-500/40 bg-amber-500/10 text-amber-500' },
  CATEGORY_DELETE: { label: 'Kategori Sil', cls: 'border-red-500/40 bg-red-500/10 text-red-500' },
  EXTRA_DELETE: { label: 'Ekstra Sil', cls: 'border-red-500/40 bg-red-500/10 text-red-500' },
  SYRUP_DELETE: { label: 'Şurup Sil', cls: 'border-red-500/40 bg-red-500/10 text-red-500' },
};

export const dt = (v) => (v ? new Date(v).toLocaleString('tr-TR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
}) : '—');

export const fmtDetails = (d) => {
  if (!d) return '';
  try {
    const o = typeof d === 'string' ? JSON.parse(d) : d;
    return Object.entries(o).map(([k, v]) => `${k}: ${v}`).join(' · ');
  } catch {
    return String(d);
  }
};
