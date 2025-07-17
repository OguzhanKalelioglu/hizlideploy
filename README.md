# Eker Deploy Server - Deployment Platformu

Bu proje, Ubuntu Server üzerinde çalışan ve yerel projeleri hızlıca deploy etmek için kullanılan bir deployment platformudur.

## Özellikler

- ✅ Ubuntu Server üzerinde çalışır
- ✅ Web arayüzü ile proje yönetimi
- ✅ GitHub entegrasyonu olmadan yerel klasörlerden deployment
- ✅ Her proje farklı port üzerinde çalışır
- ✅ Node.js, Python Flask, ve diğer platformları destekler
- ✅ Nginx reverse proxy entegrasyonu
- ✅ Real-time log monitoring
- ✅ Process management

## Kurulum

### 🚀 Hızlı Kurulum (Önerilen)

#### Ubuntu/Linux Server
```bash
# Tek komutla kurulum
curl https://raw.githubusercontent.com/OguzhanKalelioglu/hizlideploy/main/scripts/install.sh | sudo bash
```

#### Windows
```powershell
# PowerShell'i yönetici olarak çalıştırın
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
iex ((New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/OguzhanKalelioglu/hizlideploy/main/scripts/install.ps1'))
```

### 🛠️ Manuel Kurulum

```bash
# Repo klonla
git clone https://github.com/OguzhanKalelioglu/hizlideploy.git
cd hizlideploy

# Bağımlılıkları yükle
npm install

# Veritabanını ve yapılandırmayı hazırla
npm run setup

# Sunucuyu başlat
npm start
```

### ⚙️ Kurulum Sonrası

Kurulum tamamlandıktan sonra:

**Ubuntu/Linux:**
- Web arayüzü: `http://your-server-ip` (port 80)
- Servis durumu: `pm2 status`
- Loglar: `pm2 logs`

**Windows:**
- Web arayüzü: `http://localhost:3000`
- Başlat: `start.bat`
- Durdur: `stop.bat`
- Yeniden başlat: `restart.bat`
- Durum: `status.bat`

**Varsayılan Giriş Bilgileri:**
- Kullanıcı: `admin`
- Şifre: `admin123`

⚠️ **Güvenlik için admin şifresini değiştirmeyi unutmayın!**

## 🔄 Güncelleme

### Ubuntu/Linux
```bash
# Güncelleme
curl https://raw.githubusercontent.com/OguzhanKalelioglu/hizlideploy/main/scripts/update.sh | sudo bash
```

### Windows
```powershell
# Güncelleme
iex ((New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/OguzhanKalelioglu/hizlideploy/main/scripts/update.ps1'))
```

## 🗑️ Kaldırma

### Ubuntu/Linux
```bash
# Kaldırma (dikkatli kullanın!)
curl https://raw.githubusercontent.com/OguzhanKalelioglu/hizlideploy/main/scripts/uninstall.sh | sudo bash
```

### Windows
```powershell
# Manual kaldırma
# 1. PM2 servisi durdur: pm2 stop eker-deploy-server
# 2. Kurulum dizinini sil: Remove-Item -Path "$env:USERPROFILE\eker-deploy-server" -Recurse -Force
# 3. PM2 global paket kaldır: npm uninstall -g pm2
```

## 🖥️ Yönetim Komutları

### Ubuntu/Linux
```bash
# Servis durumu
pm2 status

# Servisi yeniden başlat
pm2 restart eker-deploy-server

# Logları görüntüle
pm2 logs
pm2 logs --lines 50

# Nginx durumu
systemctl status nginx

# Güvenlik duvarı durumu
ufw status
```

### Windows
```batch
# Proje dizinindeki .bat dosyaları
start.bat       # Başlat
stop.bat        # Durdur
restart.bat     # Yeniden başlat
status.bat      # Durum kontrol

# PM2 komutları
pm2 status      # Durum
pm2 logs        # Loglar
pm2 restart eker-deploy-server  # Yeniden başlat
```

## Kullanım

1. Projelerinizi `projects/` klasörüne koyun
2. Web arayüzüne erişin: `http://localhost:3000` veya `http://your-server-ip`
3. Projelerinizi deploy edin

## Dizin Yapısı

- `backend/` - Node.js API sunucusu
- `frontend/` - Web arayüzü
- `database/` - SQLite veritabanı
- `config/` - Yapılandırma dosyaları
- `logs/` - Uygulama logları
- `projects/` - Deploy edilecek projeler
- `nginx/` - Nginx yapılandırması
- `scripts/` - Kurulum scriptleri

## Geliştirme

```bash
# Geliştirme modunda çalıştır
npm run dev
```

## 📄 GitHub Repository

- **Repository:** https://github.com/OguzhanKalelioglu/hizlideploy
- **Raw Scripts:** https://raw.githubusercontent.com/OguzhanKalelioglu/hizlideploy/main/scripts/

## 💬 Destek

Sorunlar için GitHub Issues kullanın:
https://github.com/OguzhanKalelioglu/hizlideploy/issues
