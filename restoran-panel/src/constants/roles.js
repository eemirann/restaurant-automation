// ============================================================
// Rol sabitleri — TEK KAYNAK.
// Backend rol değerleri (DB/API kontratı, bkz. controllers/userController.js
// VALID_ROLES ve migrations/2026_08_08_kitchen_role.sql) -> ekran etiketleri.
// Daha önce bu tablo Layout/Login/Users içinde ayrı ayrı kopyalanıyordu.
// ============================================================
export const ROLE_LABELS = {
  Admin: 'Yönetici',
  Cashier: 'Kasiyer',
  Waiter: 'Garson',
  Kitchen: 'Mutfak',
};

// Yeni kullanıcı / rol değiştirme seçeneklerinde kullanılan sıra
export const ROLE_OPTIONS = ['Waiter', 'Cashier', 'Kitchen', 'Admin'];

// Rolün giriş sonrası açılış sayfası. Panel (Dashboard) yalnızca yöneticiye
// gösterildiğinden diğer roller kendi asıl ekranıyla başlar
// (bkz. ProtectedRoute.jsx — '/' adresine gidilse bile buraya yönlendirilir).
export const ROLE_HOME = {
  Admin: '/',
  Cashier: '/tables',
  Waiter: '/tables',
  Kitchen: '/kds',
};

export const homeFor = (role) => ROLE_HOME[role] || '/tables';
