// ============================================================
// Basit migration çalıştırıcı.
// migrations/ altındaki tüm .sql dosyalarını DOSYA ADI (tarih)
// sırasına göre çalıştırır. Tüm migration'lar IF NOT EXISTS ile
// korumalı olduğundan tekrar çalıştırmak güvenlidir (idempotent).
//
// Kullanım:  node scripts/migrate.js   (veya: npm run migrate)
// ============================================================
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { connectDB, sql } = require('../config/db');

async function run() {
    const dir = path.join(__dirname, '..', 'migrations');
    const files = fs.readdirSync(dir)
        .filter((f) => f.toLowerCase().endsWith('.sql'))
        .sort(); // dosya adları tarih önekli olduğu için alfabetik sıra = kronolojik sıra

    if (files.length === 0) {
        console.log('Çalıştırılacak migration bulunamadı.');
        return;
    }

    const pool = await connectDB();
    console.log(`\n${files.length} migration bulundu. Sırayla çalıştırılıyor...\n`);

    for (const file of files) {
        const content = fs.readFileSync(path.join(dir, file), 'utf8');
        try {
            // .batch() T-SQL GO ayırıcılarını da destekler
            await pool.request().batch(content);
            console.log(`  ✓ ${file}`);
        } catch (err) {
            console.error(`  ✗ ${file} -> HATA: ${err.message}`);
            throw err; // sıralı bağımlılık olduğu için ilk hatada dur
        }
    }

    console.log('\nTüm migration\'lar başarıyla uygulandı.');
    await sql.close();
}

run().catch((err) => {
    console.error('\nMigration çalıştırma başarısız:', err.message);
    process.exit(1);
});
