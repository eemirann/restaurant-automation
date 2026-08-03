const path = require('path');

// ============================================================
// YAZILABİLİR VERİ KLASÖRLERİ (tek kaynak)
//
// Varsayılanlar proje köküne görelidir — geliştirmede ve Docker'da davranış
// AYNEN KORUNUR (docker-compose.yml uploads/ ve logs/ volume'larını bu
// yollara bağlar).
//
// NEDEN ENV İLE GEÇERSİZ KILINABİLİR: Masaüstü (Tauri) kurulumunda uygulama
// "C:\Program Files\RESTO POS" altına kurulur ve orası standart kullanıcı için
// SALT OKUNURDUR. Backend açılışta logs/ ve uploads/ klasörlerini oluşturmaya
// çalıştığı için EPERM ile çöküyordu. Tauri kabuğu bu değişkenleri kullanıcı
// veri klasörüne yönlendirir (bkz. src-tauri/src/main.rs).
//
// Aynı desen zaten BACKUP_FS_DIR için kullanılıyor (utils/backupScheduler.js).
// ============================================================

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, '..', 'logs');

// Ürün görsellerinin fiziksel klasörü. URL yolu ('/uploads/products/...')
// bundan BAĞIMSIZDIR ve değişmez — istemciler etkilenmez.
const PRODUCT_IMAGE_DIR = path.join(UPLOAD_DIR, 'products');

module.exports = { UPLOAD_DIR, LOG_DIR, PRODUCT_IMAGE_DIR };
