# Kurulum — Kısa Özet

Ayrıntılı doküman: `BENIOKU.md`. Bu dosya sadece hızlı bir kontrol listesi.

## Yeni bir bilgisayara kurulum

**Sıra önemli: önce sunucu, sonra panel.**

1. **Sunucu + veritabanı**
   - USB'deki `KurulumPaketi` klasörünü hedef bilgisayara kopyala.
   - `RestoranKurulumSihirbazi.exe`'yi çift tıkla (yönetici hakkı gerekir).
   - Sorulanlar: veritabanı şifresi (otomatik üretilir, **not al**), ilk
     yöneticinin adı/kullanıcı adı/4-6 haneli PIN'i.
   - SQL Server Express kurulumu birkaç dakika sürer, ilerleme göstermez —
     takılmış gibi görünse de bekle.
   - Bitince "Kurulum tamamlandı!" penceresinde şifre bir kez gösterilir.

2. **Yönetim paneli (RESTO POS)**
   - `RESTO POS_x.y.z_x64-setup.exe` (ya da `.msi`) çalıştır.
   - Masaüstünde **RESTO POS** kısayolu oluşur.
   - Aç, 1. adımdaki kullanıcı adı + PIN ile giriş yap.

3. **QR menü adresi**
   - Sunucunun yerel IP'sini öğren (`ipconfig` → IPv4 Address).
   - Panelde **Ayarlar → Genel → Müşteri QR Menüsü · Adres**:
     `http://<IP>:4091` (asla `localhost` yazma — müşterinin telefonu açamaz).
   - Kaydet, masa QR kodlarını yeniden yazdır.

## Kurulum yarıda hata verirse

Baştan kurmaya gerek yok, tek başına tekrar çalıştırılabilir:
```powershell
powershell -ExecutionPolicy Bypass -File "C:\RestoranOtomasyonu\postinstall.ps1"
```

## Sadece RESTO POS'u yeniden kurmak/güncellemek istiyorsan

Sunucu zaten kuruluysa (Windows Servisi çalışıyorsa) sadece yeni
`RESTO POS_x.y.z_x64-setup.exe`'yi çalıştırman yeterli — veritabanı ve
ayarlar etkilenmez.

## Notlar

- Oto-güncelleme (uygulama içi) şu an **kapalı** — imzalama anahtarı
  eksikti, kaldırıldı (bkz. `SIFRELER-GIZLI.md`). Güncellemeler bu USB
  paketi/installer akışıyla elle yapılır.
- Kurulum her şeyi `C:\RestoranOtomasyonu` klasörüne yapar, bu klasörü silme.
