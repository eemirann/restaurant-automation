// ============================================================
// RESTO POS — ikon üretim hattı (SVG -> tüm PNG/ICO/ICNS boyutları)
//
// TEK KAYNAK: branding/resto-icon.svg
// Bu script SVG'yi 1024x1024 PNG'ye rasterize eder, ardından Tauri CLI'nin
// `icon` komutuna devrederek platformların istediği TÜM boyutları üretir
// (Windows .ico, macOS .icns, Linux/Store PNG'leri).
//
// Ayrıca açılış (splash) ve hakkında ekranı için ayrı PNG'ler üretir.
//
// Kullanım:  npm run ikon
// ============================================================
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const kaynakSvg = path.join(kok, 'branding', 'resto-icon.svg');
const dagitim = path.join(kok, 'branding', 'dist');
const ikonKlasoru = path.join(kok, 'src-tauri', 'icons');

if (!existsSync(kaynakSvg)) {
    console.error(`HATA: kaynak SVG bulunamadı: ${kaynakSvg}`);
    process.exit(1);
}

mkdirSync(dagitim, { recursive: true });

function adim(mesaj) {
    console.log(`\n==> ${mesaj}`);
}

// SVG'yi verilen kenar uzunluğunda PNG'ye rasterize eder.
// density: SVG vektörünü hedef boyutta net render etmek için yükseltilir
// (varsayılan 72 DPI büyük boyutlarda bulanıklaşmaya yol açar).
async function svgToPng(boyut, hedefYol) {
    await sharp(kaynakSvg, { density: Math.min(2400, Math.ceil((boyut / 1024) * 384)) })
        .resize(boyut, boyut, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9 })
        .toFile(hedefYol);
    console.log(`  ✓ ${path.relative(kok, hedefYol)} (${boyut}x${boyut})`);
}

adim('Ana ikon 1024x1024 PNG olarak üretiliyor...');
const ana1024 = path.join(dagitim, 'resto-icon-1024.png');
await svgToPng(1024, ana1024);

adim('Açılış ekranı / hakkında logoları üretiliyor...');
// Splash ve about ekranlarında kullanılan sabit boyutlar (retina için 2x dahil).
for (const boyut of [128, 256, 512]) {
    await svgToPng(boyut, path.join(dagitim, `resto-logo-${boyut}.png`));
}

adim('Tauri platform ikonları (PNG + ICO + ICNS) üretiliyor...');
// Eski ikonları temizle: Tauri varsayılan logosu artıkları kalmasın.
if (existsSync(ikonKlasoru)) {
    rmSync(ikonKlasoru, { recursive: true, force: true });
}
mkdirSync(ikonKlasoru, { recursive: true });

// Tauri CLI tüm platform boyutlarını tek komutta üretir:
//   32x32.png, 128x128.png, 128x128@2x.png, icon.ico, icon.icns,
//   Square*Logo.png (Windows Store), StoreLogo.png
//
// NOT: npx.cmd doğrudan spawn edilmez — Node 20+ Windows'ta .cmd dosyalarını
// shell olmadan çalıştırmayı reddediyor (EINVAL). Yerel kurulu CLI'nin JS
// giriş dosyası node ile çağrılır: hem taşınabilir hem de sürüm sabit.
const tauriCli = path.join(kok, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
execFileSync(
    process.execPath,
    [tauriCli, 'icon', ana1024, '--output', ikonKlasoru],
    { stdio: 'inherit', cwd: kok },
);

adim('Tamamlandı.');
console.log(`Kaynak : ${path.relative(kok, kaynakSvg)}`);
console.log(`Çıktı  : ${path.relative(kok, ikonKlasoru)}, ${path.relative(kok, dagitim)}`);
