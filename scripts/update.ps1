# HızlıDeploy - Windows PowerShell Güncelleme Scripti
# Kullanım: iex ((New-Object System.Net.WebClient).DownloadString('https://eker.com/hizlideploy/update.ps1'))

param(
    [string]$InstallPath = "$env:USERPROFILE\hizlideploy"
)

# Renkli output için
function Write-Info($message) {
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $message" -ForegroundColor Blue
}

function Write-Success($message) {
    Write-Host "✅ $message" -ForegroundColor Green
}

function Write-Warning($message) {
    Write-Host "⚠️  $message" -ForegroundColor Yellow
}

function Write-Error($message) {
    Write-Host "❌ $message" -ForegroundColor Red
    exit 1
}

# Admin yetkileri kontrolü
function Test-AdminRights {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Ana güncelleme fonksiyonu
function Update-HizliDeploy {
    Write-Info "🔄 HızlıDeploy Windows güncelleme başlıyor..."
    
    # Kurulum kontrolü
    if (-not (Test-Path $InstallPath)) {
        Write-Error "HızlıDeploy kurulu görünmüyor. Lütfen önce kurulum yapın."
    }
    
    # Mevcut sürüm backup
    Write-Info "Mevcut sürüm yedekleniyor..."
    $BackupPath = "$InstallPath.backup.$(Get-Date -Format 'yyyyMMdd_HHmmss')"
    Copy-Item -Path $InstallPath -Destination $BackupPath -Recurse
    Write-Success "Yedek oluşturuldu: $BackupPath"
    
    Set-Location $InstallPath
    
    # Servisi durdur
    Write-Info "Servis durduruluyor..."
    try {
        pm2 stop hizlideploy
        Write-Success "PM2 servisi durduruldu"
    } catch {
        Write-Warning "PM2 servisi durdurulamadı veya çalışmıyor"
    }
    
    # Node.js ve npm güncelle
    Write-Info "npm güncelleniyor..."
    npm install -g npm@latest
    npm install -g pm2@latest
    
    # Proje bağımlılıklarını güncelle
    Write-Info "Proje bağımlılıkları güncelleniyor..."
    npm update
    
    # Veritabanı backup
    Write-Info "Veritabanı yedekleniyor..."
    $DbPath = Join-Path $InstallPath "database\coolify.db"
    if (Test-Path $DbPath) {
        $DbBackup = Join-Path $InstallPath "database\coolify.db.backup.$(Get-Date -Format 'yyyyMMdd_HHmmss')"
        Copy-Item $DbPath $DbBackup
        Write-Success "Veritabanı yedeklendi"
    }
    
    # Ecosystem config güncelle
    Write-Info "PM2 yapılandırması güncelleniyor..."
    @"
module.exports = {
  apps: [{
    name: 'hizlideploy',
    script: './backend/server.js',
    instances: 1,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    restart_delay: 1000,
    max_restarts: 5,
    min_uptime: '10s',
    watch: false,
    ignore_watch: ['node_modules', 'logs'],
    windows_verbatim_arguments: true
  }]
};
"@ | Set-Content "ecosystem.config.js"
    
    # Servisi yeniden başlat
    Write-Info "Servis yeniden başlatılıyor..."
    try {
        pm2 start ecosystem.config.js
        pm2 save
        Write-Success "Servis başarıyla yeniden başlatıldı"
    } catch {
        Write-Error "Servis başlatılamadı. Lütfen logları kontrol edin: pm2 logs"
    }
    
    # Servis durumunu kontrol et
    Start-Sleep -Seconds 3
    try {
        $status = pm2 describe hizlideploy --json | ConvertFrom-Json
        if ($status.pm2_env.status -eq "online") {
            Write-Success "Servis online durumda"
        } else {
            Write-Warning "Servis durumu: $($status.pm2_env.status)"
        }
    } catch {
        Write-Warning "Servis durumu kontrol edilemedi"
    }
    
    # Windows servisini güncelle
    Write-Info "Windows servisi güncelleniyor..."
    try {
        pm2-service-install -n "HizliDeploy" --uninstall
        pm2-service-install -n "HizliDeploy"
        Write-Success "Windows servisi güncellendi"
    } catch {
        Write-Warning "Windows servisi güncellemesi atlandı"
    }
    
    # Başlangıç scriptlerini güncelle
    Write-Info "Başlangıç scriptleri güncelleniyor..."
    
    # start.bat
    @"
@echo off
echo 🚀 HızlıDeploy başlatılıyor...
cd /d "$InstallPath"
pm2 start ecosystem.config.js
echo ✅ HızlıDeploy başlatıldı
echo 🌐 Web arayüzü: http://localhost:3000
pause
"@ | Set-Content "start.bat"
    
    # restart.bat
    @"
@echo off
echo 🔄 HızlıDeploy yeniden başlatılıyor...
cd /d "$InstallPath"
pm2 restart hizlideploy
echo ✅ HızlıDeploy yeniden başlatıldı
echo 🌐 Web arayüzü: http://localhost:3000
pause
"@ | Set-Content "restart.bat"
    
    # status.bat
    @"
@echo off
echo 📊 HızlıDeploy durumu:
cd /d "$InstallPath"
pm2 status
echo.
echo 📋 Son 10 log satırı:
pm2 logs --lines 10
pause
"@ | Set-Content "status.bat"
    
    Write-Success "Başlangıç scriptleri güncellendi"
    
    # Güncelleme tamamlandı
    Write-Success "🎉 HızlıDeploy Windows güncelleme tamamlandı!"
    Write-Host ""
    Write-Host "📋 Güncelleme Bilgileri:" -ForegroundColor Cyan
    Write-Host "   • Güncelleme Zamanı: $(Get-Date)"
    Write-Host "   • Yedek Dizin: $BackupPath"
    Write-Host "   • Kurulum Dizini: $InstallPath"
    Write-Host ""
    Write-Host "🌐 Erişim Bilgileri:" -ForegroundColor Cyan
    Write-Host "   • Web Arayüzü: http://localhost:3000"
    Write-Host "   • Admin Kullanıcı: admin"
    Write-Host "   • Admin Şifre: admin123"
    Write-Host ""
    Write-Host "🔧 Yararlı Komutlar:" -ForegroundColor Cyan
    Write-Host "   • Başlat: $InstallPath\start.bat"
    Write-Host "   • Yeniden Başlat: $InstallPath\restart.bat"
    Write-Host "   • Durum: $InstallPath\status.bat"
    Write-Host "   • PM2 Durumu: pm2 status"
    Write-Host "   • Yedek Geri Yükle: Move-Item '$BackupPath' '$InstallPath' -Force"
    Write-Host ""
    Write-Success "✨ Güncelleme tamamlandı! Tarayıcınızdan erişebilirsiniz."
    
    # Tarayıcıyı aç
    try {
        Start-Process "http://localhost:3000"
        Write-Success "Web arayüzü açıldı"
    } catch {
        Write-Warning "Web arayüzü otomatik açılamadı, manuel olarak http://localhost:3000 adresine gidin"
    }
}

# Admin yetkileri kontrol et
if (-not (Test-AdminRights)) {
    Write-Warning "Bu script yönetici yetkileri ile çalıştırılmalıdır."
    Write-Host "PowerShell'i 'Yönetici olarak çalıştır' seçeneği ile açın ve tekrar deneyin."
    Read-Host "Devam etmek için Enter'a basın"
}

# Ana güncelleme fonksiyonunu çalıştır
try {
    Update-HizliDeploy
} catch {
    Write-Error "Güncelleme sırasında hata oluştu: $($_.Exception.Message)"
    Write-Host "Lütfen hata mesajını kaydedin ve destek için iletişime geçin."
    Read-Host "Çıkmak için Enter'a basın"
} 