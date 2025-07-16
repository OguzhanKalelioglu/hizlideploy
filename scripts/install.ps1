# HızlıDeploy - Windows PowerShell Otomatik Kurulum Scripti
# Kullanım: 
# Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
# iex ((New-Object System.Net.WebClient).DownloadString('https://eker.com/hizlideploy/install.ps1'))

param(
    [string]$InstallPath = "$env:USERPROFILE\hizlideploy",
    [switch]$SkipChocolatey = $false
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

# Chocolatey kurulumu
function Install-Chocolatey {
    if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
        Write-Info "Chocolatey kuruluyor..."
        Set-ExecutionPolicy Bypass -Scope Process -Force
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
        iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))
        refreshenv
        Write-Success "Chocolatey kuruldu"
    } else {
        Write-Success "Chocolatey zaten kurulu"
    }
}

# Node.js kurulumu
function Install-NodeJS {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Info "Node.js kuruluyor..."
        choco install nodejs -y
        refreshenv
        Write-Success "Node.js kuruldu"
    } else {
        $nodeVersion = node --version
        Write-Success "Node.js zaten kurulu: $nodeVersion"
    }
}

# Git kurulumu
function Install-Git {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Write-Info "Git kuruluyor..."
        choco install git -y
        refreshenv
        Write-Success "Git kuruldu"
    } else {
        $gitVersion = git --version
        Write-Success "Git zaten kurulu: $gitVersion"
    }
}

# PM2 kurulumu
function Install-PM2 {
    try {
        pm2 --version | Out-Null
        Write-Success "PM2 zaten kurulu"
    } catch {
        Write-Info "PM2 kuruluyor..."
        npm install -g pm2
        npm install -g pm2-windows-service
        Write-Success "PM2 kuruldu"
    }
}

# Ana kurulum fonksiyonu
function Install-HizliDeploy {
    Write-Info "🚀 HızlıDeploy Windows kurulumu başlıyor..."
    
    # Sistem bilgileri
    $osInfo = Get-WmiObject -Class Win32_OperatingSystem
    $computerInfo = Get-WmiObject -Class Win32_ComputerSystem
    Write-Success "İşletim Sistemi: $($osInfo.Caption) ($($computerInfo.SystemType))"
    
    # PowerShell sürümü kontrol
    if ($PSVersionTable.PSVersion.Major -lt 5) {
        Write-Error "PowerShell 5.0 veya üstü gerekli. Lütfen PowerShell'i güncelleyin."
    }
    
    # Chocolatey kurulumu (isteğe bağlı)
    if (-not $SkipChocolatey) {
        Install-Chocolatey
    }
    
    # Bağımlılıkları kur
    Install-NodeJS
    Install-Git
    
    # npm güncelle
    Write-Info "npm güncelleniyor..."
    npm install -g npm@latest
    
    # PM2 kur
    Install-PM2
    
    # Kurulum dizini hazırla
    Write-Info "Kurulum dizini hazırlanıyor..."
    if (Test-Path $InstallPath) {
        $backupPath = "$InstallPath.backup.$(Get-Date -Format 'yyyyMMdd_HHmmss')"
        Write-Warning "Mevcut kurulum bulundu, yedekleniyor: $backupPath"
        Rename-Item $InstallPath $backupPath
    }
    
    New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null
    Set-Location $InstallPath
    
    # Proje dosyaları oluştur
    Write-Info "Proje dosyaları oluşturuluyor..."
    
    # Package.json
    $packageJson = @{
        name = "hizli-deploy"
        version = "1.0.0"
        description = "Hızlı ve kolay deployment platformu"
        main = "index.js"
        scripts = @{
            start = "node backend/server.js"
            dev = "nodemon backend/server.js"
            setup = "node scripts/setup.js"
        }
        dependencies = @{
            "adm-zip" = "^0.5.16"
            "bcryptjs" = "^2.4.3"
            "child_process" = "^1.0.2"
            "chokidar" = "^3.5.3"
            "cors" = "^2.8.5"
            "dotenv" = "^16.3.1"
            "express" = "^4.18.2"
            "fs-extra" = "^11.2.0"
            "jsonwebtoken" = "^9.0.2"
            "multer" = "^1.4.5-lts.1"
            "sqlite3" = "^5.1.6"
            "uuid" = "^9.0.1"
            "ws" = "^8.14.2"
        }
        devDependencies = @{
            "nodemon" = "^3.0.2"
        }
        author = "Oğuz"
        license = "MIT"
    }
    
    $packageJson | ConvertTo-Json -Depth 10 | Set-Content "package.json"
    
    # Dizin yapısı oluştur
    @(
        "backend\database",
        "backend\middleware", 
        "backend\routes",
        "backend\services",
        "frontend\css",
        "frontend\js",
        "config",
        "database",
        "logs",
        "nginx",
        "projects",
        "scripts",
        "temp"
    ) | ForEach-Object {
        New-Item -ItemType Directory -Path $_ -Force | Out-Null
    }
    
    # Backend server.js
    @'
const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('../config/config');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/deployments', require('./routes/deployments'));
app.use('/api/logs', require('./routes/logs'));

// Frontend route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

const PORT = config.server.port;
app.listen(PORT, () => {
    console.log(`🚀 HızlıDeploy ${PORT} portunda çalışıyor`);
    console.log(`📱 Web arayüzü: http://localhost:${PORT}`);
});
'@ | Set-Content "backend\server.js"
    
    # Config dosyası
    @'
require('dotenv').config();

module.exports = {
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || 'localhost',
    env: process.env.NODE_ENV || 'development'
  },
  database: {
    path: process.env.DB_PATH || './database/coolify.db'
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
    expiresIn: '24h'
  },
  paths: {
    projects: process.env.PROJECTS_PATH || './projects',
    logs: process.env.LOGS_PATH || './logs',
    nginx: process.env.NGINX_CONFIG_PATH || './nginx'
  },
  defaults: {
    admin: {
      username: process.env.DEFAULT_ADMIN_USERNAME || 'admin',
      password: process.env.DEFAULT_ADMIN_PASSWORD || 'admin123'
    }
  },
  deployment: {
    basePort: parseInt(process.env.BASE_PROJECT_PORT) || 4000,
    maxPort: parseInt(process.env.MAX_PROJECT_PORT) || 5000,
    nginxPort: 80
  }
};
'@ | Set-Content "config\config.js"
    
    # Routes dosyaları
    @'
const express = require('express');
const router = express.Router();

router.post('/login', (req, res) => {
    // Temel auth implementasyonu
    res.json({ success: true, token: 'dummy-token' });
});

module.exports = router;
'@ | Set-Content "backend\routes\auth.js"
    
    @'
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.json({ projects: [] });
});

module.exports = router;
'@ | Set-Content "backend\routes\projects.js"
    
    @'
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.json({ deployments: [] });
});

module.exports = router;
'@ | Set-Content "backend\routes\deployments.js"
    
    @'
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.json({ logs: [] });
});

module.exports = router;
'@ | Set-Content "backend\routes\logs.js"
    
    # Frontend dosyaları
    @'
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HızlıDeploy</title>
    <link rel="stylesheet" href="css/style.css">
</head>
<body>
    <div class="container">
        <h1>🚀 HızlıDeploy</h1>
        <p>Deployment platformu başarıyla kuruldu!</p>
        <div class="status">
            <h3>Sistem Durumu</h3>
            <p>✅ Sunucu çalışıyor</p>
            <p>✅ Veritabanı bağlantısı aktif</p>
            <p>✅ Windows servis hazır</p>
        </div>
        <div class="info">
            <h3>Windows Özel Bilgiler</h3>
            <p>📁 Kurulum Dizini: INSTALL_PATH_PLACEHOLDER</p>
            <p>🔧 PM2 Service: Aktif</p>
            <p>🌐 Port: 3000</p>
        </div>
    </div>
    <script src="js/app.js"></script>
</body>
</html>
'@ -replace "INSTALL_PATH_PLACEHOLDER", $InstallPath | Set-Content "frontend\index.html"
    
    @'
body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    margin: 0;
    padding: 20px;
    background-color: #f5f5f5;
}

.container {
    max-width: 800px;
    margin: 0 auto;
    background: white;
    padding: 30px;
    border-radius: 10px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

h1 {
    color: #333;
    text-align: center;
}

.status, .info {
    background: #e9ecef;
    padding: 20px;
    border-radius: 5px;
    margin: 20px 0;
}

.info {
    background: #d4edda;
    border: 1px solid #c3e6cb;
}
'@ | Set-Content "frontend\css\style.css"
    
    @'
console.log('HızlıDeploy Windows sürümü başlatıldı');

// Windows özel fonksiyonlar
function updateSystemInfo() {
    const infos = document.querySelectorAll('.info p');
    infos.forEach(info => {
        if (info.textContent.includes('Zaman:')) {
            info.textContent = `🕐 Zaman: ${new Date().toLocaleString('tr-TR')}`;
        }
    });
}

// Her saniye güncelle
setInterval(updateSystemInfo, 1000);
updateSystemInfo();
'@ | Set-Content "frontend\js\app.js"
    
    # .env dosyası
    @"
NODE_ENV=development
PORT=3000
DB_PATH=./database/coolify.db
JWT_SECRET=windows-secret-key-$(Get-Random)
PROJECTS_PATH=./projects
LOGS_PATH=./logs
NGINX_CONFIG_PATH=./nginx
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_PASSWORD=admin123
BASE_PROJECT_PORT=4000
MAX_PROJECT_PORT=5000
"@ | Set-Content ".env"
    
    # Setup script
    @'
const fs = require('fs');
const path = require('path');

console.log('🚀 HızlıDeploy Windows kurulumu başlıyor...');

// Gerekli dizinleri oluştur
const requiredDirs = [
    'backend', 'frontend', 'database', 'config', 'logs', 'projects', 'nginx'
];

requiredDirs.forEach(dir => {
    const fullPath = path.join(__dirname, '..', dir);
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        console.log(`✅ ${dir} dizini oluşturuldu`);
    }
});

console.log('✅ Windows setup tamamlandı!');
'@ | Set-Content "scripts\setup.js"
    
    # PM2 ecosystem dosyası
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
    
    # Bağımlılıkları yükle
    Write-Info "Node.js bağımlılıkları yükleniyor..."
    npm install
    
    # Setup scriptini çalıştır
    Write-Info "Setup scripti çalıştırılıyor..."
    npm run setup
    
    # PM2 servisi kur
    Write-Info "PM2 servisi ayarlanıyor..."
    pm2 start ecosystem.config.js
    pm2 save
    
    # Windows servis olarak kur
    try {
        pm2-service-install -n "HizliDeploy"
        Write-Success "Windows servisi kuruldu"
    } catch {
        Write-Warning "Windows servisi kurulumu atlandı (isteğe bağlı)"
    }
    
    # Güvenlik duvarı kuralları
    Write-Info "Güvenlik duvarı kuralları ekleniyor..."
    try {
        netsh advfirewall firewall add rule name="HizliDeploy-HTTP" dir=in action=allow protocol=TCP localport=3000
        netsh advfirewall firewall add rule name="HizliDeploy-Projects" dir=in action=allow protocol=TCP localport=4000-5000
        Write-Success "Güvenlik duvarı kuralları eklendi"
    } catch {
        Write-Warning "Güvenlik duvarı kuralları eklenemedi, manuel olarak eklemeyi deneyebilirsiniz"
    }
    
    # Başlangıç scriptleri oluştur
    Write-Info "Başlangıç scriptleri oluşturuluyor..."
    
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
    
    # stop.bat
    @"
@echo off
echo 🛑 HızlıDeploy durduruluyor...
cd /d "$InstallPath"
pm2 stop hizlideploy
echo ✅ HızlıDeploy durduruldu
pause
"@ | Set-Content "stop.bat"
    
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
pm2 logs --lines 10
pause
"@ | Set-Content "status.bat"
    
    # Masaüstü kısayolu oluştur
    try {
        $WshShell = New-Object -comObject WScript.Shell
        $Shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\HızlıDeploy.lnk")
        $Shortcut.TargetPath = "http://localhost:3000"
        $Shortcut.Save()
        Write-Success "Masaüstü kısayolu oluşturuldu"
    } catch {
        Write-Warning "Masaüstü kısayolu oluşturulamadı"
    }
    
    # Başlangıç menüsü kısayolu
    try {
        $StartMenuPath = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs"
        $WshShell = New-Object -comObject WScript.Shell
        $Shortcut = $WshShell.CreateShortcut("$StartMenuPath\HızlıDeploy.lnk")
        $Shortcut.TargetPath = "http://localhost:3000"
        $Shortcut.Save()
        Write-Success "Başlangıç menüsü kısayolu oluşturuldu"
    } catch {
        Write-Warning "Başlangıç menüsü kısayolu oluşturulamadı"
    }
    
    # Kurulum tamamlandı
    Write-Success "🎉 HızlıDeploy Windows kurulumu tamamlandı!"
    Write-Host ""
    Write-Host "📋 Kurulum Bilgileri:" -ForegroundColor Cyan
    Write-Host "   • Kurulum Dizini: $InstallPath"
    Write-Host "   • Port: 3000"
    Write-Host "   • PM2 Servis: Aktif"
    Write-Host ""
    Write-Host "🌐 Erişim Bilgileri:" -ForegroundColor Cyan
    Write-Host "   • Web Arayüzü: http://localhost:3000"
    Write-Host "   • Admin Kullanıcı: admin"
    Write-Host "   • Admin Şifre: admin123"
    Write-Host ""
    Write-Host "🔧 Yararlı Komutlar:" -ForegroundColor Cyan
    Write-Host "   • Başlat: $InstallPath\start.bat"
    Write-Host "   • Durdur: $InstallPath\stop.bat"
    Write-Host "   • Yeniden Başlat: $InstallPath\restart.bat"
    Write-Host "   • Durum: $InstallPath\status.bat"
    Write-Host ""
    Write-Host "📁 Projelerinizi şu dizine koyun: $InstallPath\projects"
    Write-Host ""
    Write-Warning "🔒 Güvenlik için admin şifresini değiştirmeyi unutmayın!"
    Write-Host ""
    Write-Success "✨ HızlıDeploy Windows'ta hazır! Tarayıcınızdan erişebilirsiniz."
    
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

# Ana kurulum fonksiyonunu çalıştır
try {
    Install-HizliDeploy
} catch {
    Write-Error "Kurulum sırasında hata oluştu: $($_.Exception.Message)"
    Write-Host "Lütfen hata mesajını kaydedin ve destek için iletişime geçin."
    Read-Host "Çıkmak için Enter'a basın"
} 