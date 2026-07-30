// ============================================================
// İLK ADMIN KULLANICISINI OLUŞTURUR.
//
// Neden gerekli: routes/auth.js'teki /register ucu SADECE Admin
// erişebilsin diye kasıtlı olarak korumalı (verifyToken +
// requireRole('Admin')) — bu yüzden veritabanı sıfırken (migration
// yeni çalıştırılmış, Users tablosu boş) panele giriş yapacak HİÇ
// kimse yok, "tavuk-yumurta" durumu. Bu script o döngüyü tek seferlik
// kırar: doğrudan veritabanına, PIN'i ve şifreyi bcrypt ile hash'leyip
// bir Admin satırı ekler. Login.jsx PIN pad'i sadece PinHash dolu
// (ve IsActive=1) kullanıcıları listelediği için (bkz.
// controllers/authController.js getStaff), bu script PinHash'i de
// mutlaka doldurur.
//
// Kullanım:
//   node scripts/createFirstAdmin.js "Ad Soyad" "kullaniciadi" "1234"
//   (Docker Compose ile: docker compose exec backend node scripts/createFirstAdmin.js "Ad Soyad" "kullaniciadi" "1234")
//
// PIN 4-6 haneli rakam olmalı (panel PIN pad'i buna göre). Sonradan
// panelin kendi Kullanıcılar sayfasından PIN/şifre değiştirilebilir,
// yeni personel eklenebilir — bu script SADECE ilk admin için, tekrar
// tekrar kullanılacak bir akış değil.
// ============================================================
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { connectDB, sql } = require('../config/db');

async function run() {
    const [, , fullName, userName, pin] = process.argv;

    if (!fullName || !userName || !pin) {
        console.error('Kullanım: node scripts/createFirstAdmin.js "Ad Soyad" "kullaniciadi" "1234"');
        process.exit(1);
    }
    if (!/^\d{4,6}$/.test(pin)) {
        console.error('PIN 4-6 haneli rakamlardan oluşmalı.');
        process.exit(1);
    }

    const pool = await connectDB();

    const existing = await pool.request()
        .input('UserName', sql.NVarChar(50), userName)
        .query('SELECT UserId FROM Users WHERE UserName = @UserName');

    if (existing.recordset.length > 0) {
        console.error(`"${userName}" kullanıcı adı zaten var — bu script sadece ilk kurulum içindir.`);
        await sql.close();
        process.exit(1);
    }

    // Şifre alanı da NOT NULL olduğu için dolduruluyor (panel PIN ile
    // giriş yapıyor, ama Users.PasswordHash şema gereği zorunlu).
    const passwordHash = await bcrypt.hash(pin, 10);
    const pinHash = await bcrypt.hash(pin, 10);

    await pool.request()
        .input('FullName', sql.NVarChar(150), fullName)
        .input('UserName', sql.NVarChar(100), userName)
        .input('PasswordHash', sql.NVarChar(255), passwordHash)
        .input('PinHash', sql.NVarChar(255), pinHash)
        .query(`
            INSERT INTO Users (FullName, UserName, PasswordHash, PinHash, Role, IsActive)
            VALUES (@FullName, @UserName, @PasswordHash, @PinHash, 'Admin', 1)
        `);

    console.log(`\n✓ "${fullName}" (${userName}) Admin olarak oluşturuldu. Panelde personel listesinden seçip PIN "${pin}" ile giriş yapabilirsin.\n`);
    await sql.close();
}

run().catch((err) => {
    console.error('İlk admin oluşturulamadı:', err.message);
    process.exit(1);
});
