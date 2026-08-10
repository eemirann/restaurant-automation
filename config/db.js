const sql = require('mssql');
require('dotenv').config({ quiet: true });

// ============================================================
// DB_SERVER iki biçimi de kabul eder:
//   1) 'localhost'            -> DB_PORT (varsayılan 1433) üzerinden bağlanır
//   2) 'localhost\SQLEXPRESS' -> ADLANDIRILMIŞ INSTANCE
//
// (2) neden gerekli: Docker'daki mssql/server konteyneri varsayılan instance
// olarak 1433'ü dinliyordu. SQL Server Express ise kendini ADLANDIRILMIŞ bir
// instance (MSSQL$SQLEXPRESS) olarak kurar ve varsayılan TCP portu DİNAMİKTİR.
// tedious'ta instanceName ile port BİRLİKTE verilemez (karşılıklı dışlayan
// seçenekler, "Port and instanceName are mutually exclusive" hatası) — bu
// yüzden instance adı verildiğinde port BİLEREK atlanır ve portu SQL Browser
// servisi (UDP 1434) çözer. installer/kurulum-sql-express.ps1 hem SQL
// Browser'ı otomatik başlatmaya alır hem de instance'a 1433 sabit portunu
// atar; böylece HER İKİ biçim de çalışır.
// ============================================================
const rawServer = (process.env.DB_SERVER || 'localhost').trim();
const [serverHost, instanceName] = rawServer.split('\\');

const dbConfig = {
    server: serverHost,
    database: process.env.DB_DATABASE,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        // KRİTİK: mssql/tedious varsayılanı useUTC=true'dur — yani SQL Server'dan
        // dönen DATETIME değerlerini UTC sanıp öyle işler. Ama GETDATE() (tüm
        // migration'larda CreatedAt/PaymentDate/vb. için kullanılıyor) sunucunun
        // YEREL saatini döner (Türkiye, UTC+3). Bu uyuşmazlık yüzünden her
        // tarih/saat, ekrana (toLocaleString ile yerel saate ikinci kez
        // çevrilince) OLDUĞUNDAN ~3 SAAT İLERİ görünüyordu (ör. Denetim
        // Günlüğü'nde giriş saati 19:49 yazıp gerçekte 16:52 olması gibi).
        // useUTC: false ile sürücü, DB'den gelen değeri zaten yerel saat kabul
        // eder (dönüştürmez) — GETDATE()'in gerçek davranışıyla eşleşir.
        useUTC: false
    }
};

if (instanceName) {
    dbConfig.options.instanceName = instanceName;
} else {
    dbConfig.port = parseInt(process.env.DB_PORT, 10) || 1433;
}

async function connectDB() {
    try {
        const pool = await sql.connect(dbConfig);
        console.log('Başarılı');
        return pool;
    } catch (err) {
        console.error('Başarısız:', err);
        throw err;
    }
}

module.exports = { connectDB, sql };