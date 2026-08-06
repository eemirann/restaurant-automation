const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ürün resimleri buraya kaydedilir (varsayılan: <proje>/uploads/products/,
// masaüstü kurulumunda UPLOAD_DIR ile yazılabilir klasöre yönlendirilir).
const { PRODUCT_IMAGE_DIR, LOGO_DIR } = require('../utils/paths');
for (const dir of [PRODUCT_IMAGE_DIR, LOGO_DIR]) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

const imageFileFilter = (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Sadece jpeg/png/webp resim dosyaları kabul edilir'));
};

const productStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, PRODUCT_IMAGE_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `product-${req.params.id}-${Date.now()}${ext}`);
    }
});

const upload = multer({ storage: productStorage, fileFilter: imageFileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

// Restoran logosu (sidebar/giriş ekranı/QR menü üstü/fişler) — tek bir
// site-geneli görsel, ürün resimlerinden AYRI bir klasöre kaydedilir.
// Dosya adı kasıtlı zaman damgalı (üzerine yazmaz, eskisi diskte kalır):
// ürün resmi yüklemesiyle AYNI davranış — kod tabanındaki mevcut kalıp.
const logoStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, LOGO_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `logo-${Date.now()}${ext}`);
    }
});

const uploadLogo = multer({ storage: logoStorage, fileFilter: imageFileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

module.exports = { upload, uploadLogo };
