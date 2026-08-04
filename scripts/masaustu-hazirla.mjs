// ============================================================
// RESTO POS — masaüstü paketleme ön hazırlığı
//
// `tauri build` bu script'i beforeBuildCommand olarak çalıştırır. Görevleri:
//   1) React panelini derler (restoran-panel/dist)
//   2) Express backend'ini src-tauri/backend-dist'e SADECE üretim
//      bağımlılıklarıyla kopyalar (jest/supertest gibi devDeps paketlenmez)
//   3) Node çalıştırılabilirini Tauri "sidecar" adlandırmasıyla kopyalar
//
// Böylece kurulan makinede Node.js kurulu OLMASI GEREKMEZ.
//
// Kullanım:  node scripts/masaustu-hazirla.mjs
// ============================================================
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcTauri = path.join(kok, 'src-tauri');
const backendDist = path.join(srcTauri, 'backend-dist');
const binaries = path.join(srcTauri, 'binaries');

function adim(mesaj) {
    console.log(`\n==> ${mesaj}`);
}

function calistir(komut, argumanlar, calismaDizini = kok, ekOrtam = {}) {
    execFileSync(komut, argumanlar, {
        stdio: 'inherit',
        cwd: calismaDizini,
        env: { ...process.env, ...ekOrtam },
    });
}

// Windows'ta npm bir .cmd dosyasıdır ve Node 20+ bunu shell olmadan
// çalıştırmayı reddeder (EINVAL). npm-cli.js doğrudan node ile çağrılır.
function npm(argumanlar, calismaDizini, ekOrtam) {
    const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    if (existsSync(npmCli)) {
        calistir(process.execPath, [npmCli, ...argumanlar], calismaDizini, ekOrtam);
    } else {
        // Yedek: npm PATH'te farklı bir yerde kuruluysa
        calistir(process.platform === 'win32' ? 'npm.cmd' : 'npm', argumanlar, calismaDizini, ekOrtam);
    }
}

// ---------- 1) Paneli derle ----------
adim('React paneli derleniyor...');
// VITE_API_URL BİLEREK localhost'a sabitlenir: restoran-panel/.env içinde
// dağıtım için bir LAN IP'si (ör. http://10.30.80.139:4091/api) yazılı
// olabilir; masaüstü uygulamasında backend HER ZAMAN aynı makinede çalışır,
// o adres kullanılırsa paket başka makinede/IP değişince bozulur ve dar CSP
// tarafından da engellenir. Vite'ta process.env, .env dosyasını EZER.
// (src/api/client.js ayrıca çalışma anında Tauri'yi tespit edip localhost'a
// döner — bu iki katmanlı güvence bilinçlidir.)
npm(['--prefix', 'restoran-panel', 'run', 'build'], kok, {
    VITE_API_URL: 'http://localhost:4091/api',
});

// ---------- 2) Backend'i üretim bağımlılıklarıyla hazırla ----------
adim('Backend paketleniyor (sadece üretim bağımlılıkları)...');
rmSync(backendDist, { recursive: true, force: true });
mkdirSync(backendDist, { recursive: true });

// Çalışma zamanında GEREKEN dosyalar. Testler, geliştirme araçları,
// yükleme klasörü ve loglar bilerek DIŞARIDA bırakılır (boyut + gizlilik).
const kopyalanacakKlasorler = ['config', 'controllers', 'middleware', 'migrations', 'routes', 'utils'];
const kopyalanacakDosyalar = ['server.js', 'package.json', 'package-lock.json'];

for (const klasor of kopyalanacakKlasorler) {
    const kaynak = path.join(kok, klasor);
    if (existsSync(kaynak)) {
        cpSync(kaynak, path.join(backendDist, klasor), { recursive: true });
        console.log(`  ✓ ${klasor}/`);
    }
}
for (const dosya of kopyalanacakDosyalar) {
    const kaynak = path.join(kok, dosya);
    if (existsSync(kaynak)) {
        copyFileSync(kaynak, path.join(backendDist, dosya));
        console.log(`  ✓ ${dosya}`);
    }
}

// package.json'daki devDependencies'i temizle: npm ci bunları kurmasın.
const pkgYolu = path.join(backendDist, 'package.json');
const pkg = JSON.parse(readFileSync(pkgYolu, 'utf8'));
delete pkg.devDependencies;
pkg.scripts = { migrate: 'node scripts/migrate.js' };
writeFileSync(pkgYolu, JSON.stringify(pkg, null, 2) + '\n');

adim('Üretim bağımlılıkları kuruluyor (npm ci --omit=dev)...');
npm(['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], backendDist);

// ---------- 3) Node çalıştırılabilirini sidecar olarak kopyala ----------
adim('Node çalıştırılabiliri sidecar olarak kopyalanıyor...');
mkdirSync(binaries, { recursive: true });

// Tauri sidecar adlandırması: <isim>-<hedef üçlüsü><uzantı>
const hedefUclusu = execFileSync('rustc', ['-vV'], { encoding: 'utf8' })
    .split('\n')
    .find((satir) => satir.startsWith('host:'))
    .replace('host:', '')
    .trim();

const uzanti = process.platform === 'win32' ? '.exe' : '';
const sidecarYolu = path.join(binaries, `node-${hedefUclusu}${uzanti}`);
copyFileSync(process.execPath, sidecarYolu);
console.log(`  ✓ ${path.relative(kok, sidecarYolu)} (${process.version})`);

adim('Hazırlık tamamlandı.');
