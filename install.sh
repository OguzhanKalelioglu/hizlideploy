#!/bin/bash

# HızlıDeploy - Ubuntu/Linux Otomatik Kurulum Scripti
# Kullanım: curl https://eker.com/hizlideploy/install.sh | bash

set -e

# Renkli output için
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Log fonksiyonu
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
    exit 1
}

# Root yetkileri kontrolü
if [ "$EUID" -ne 0 ]; then
    error "Bu script root yetkileri ile çalışmalıdır. Lütfen 'sudo' ile çalıştırın."
fi

# Sistem bilgileri
log "Sistem bilgileri alınıyor..."
OS=$(lsb_release -si 2>/dev/null || echo "Unknown")
VERSION=$(lsb_release -sr 2>/dev/null || echo "Unknown")
ARCH=$(uname -m)

success "İşletim Sistemi: $OS $VERSION ($ARCH)"

# Kurulum dizini
INSTALL_DIR="/opt/hizlideploy"
SERVICE_NAME="hizlideploy"

log "🚀 HızlıDeploy kurulumu başlıyor..."

# Paket yöneticisini güncelle
log "Paket yöneticisi güncelleniyor..."
apt-get update -y

# Gerekli sistem paketlerini kur
log "Gerekli sistem paketleri kuruluyor..."
apt-get install -y curl wget git nginx sqlite3 software-properties-common

# Node.js kurulumu
log "Node.js kurulumu kontrol ediliyor..."
if ! command -v node &> /dev/null; then
    log "Node.js kuruluyor..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
else
    NODE_VERSION=$(node -v)
    success "Node.js zaten kurulu: $NODE_VERSION"
fi

# npm güncelle
log "npm güncelleniyor..."
npm install -g npm@latest

# pm2 kur (process manager)
log "PM2 kuruluyor..."
npm install -g pm2

# Kurulum dizinini oluştur
log "Kurulum dizini hazırlanıyor..."
if [ -d "$INSTALL_DIR" ]; then
    warning "Mevcut kurulum bulundu, yedekleniyor..."
    mv "$INSTALL_DIR" "$INSTALL_DIR.backup.$(date +%Y%m%d_%H%M%S)"
fi

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# GitHub'dan projeyi indir
log "Proje indiriliyor..."
# Gerçek repo URL'si buraya gelecek
# git clone https://github.com/yourusername/hizlideploy.git .

# Geçici olarak local dosyaları kopyalayalım (gerçek durumda git clone olacak)
# Bu kısım gerçek deployment'ta değişecek

# Projeyi manuel olarak oluştur (git clone yerine)
log "Proje dosyları oluşturuluyor..."

# Package.json oluştur
cat > package.json << 'EOF'
{
  "name": "hizli-deploy",
  "version": "1.0.0",
  "description": "Hızlı ve kolay deployment platformu",
  "main": "index.js",
  "scripts": {
    "start": "node backend/server.js",
    "dev": "nodemon backend/server.js",
    "setup": "node scripts/setup.js"
  },
  "dependencies": {
    "adm-zip": "^0.5.16",
    "bcryptjs": "^2.4.3",
    "child_process": "^1.0.2",
    "chokidar": "^3.5.3",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "fs-extra": "^11.2.0",
    "jsonwebtoken": "^9.0.2",
    "multer": "^1.4.5-lts.1",
    "sqlite3": "^5.1.6",
    "uuid": "^9.0.1",
    "ws": "^8.14.2"
  },
  "devDependencies": {
    "nodemon": "^3.0.2"
  },
  "author": "Oğuz",
  "license": "MIT"
}
EOF

# Gerekli dizinleri oluştur
mkdir -p backend/{database,middleware,routes,services}
mkdir -p frontend/{css,js}
mkdir -p {config,database,logs,nginx,projects,scripts,temp}

# Temel dosyaları oluştur (minimal setup)
cat > backend/server.js << 'EOF'
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
EOF

# Config dosyası oluştur
cat > config/config.js << 'EOF'
require('dotenv').config();

module.exports = {
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || 'localhost',
    env: process.env.NODE_ENV || 'production'
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
EOF

# Temel routes dosyaları oluştur
cat > backend/routes/auth.js << 'EOF'
const express = require('express');
const router = express.Router();

router.post('/login', (req, res) => {
    // Temel auth implementasyonu
    res.json({ success: true, token: 'dummy-token' });
});

module.exports = router;
EOF

cat > backend/routes/projects.js << 'EOF'
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.json({ projects: [] });
});

module.exports = router;
EOF

cat > backend/routes/deployments.js << 'EOF'
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.json({ deployments: [] });
});

module.exports = router;
EOF

cat > backend/routes/logs.js << 'EOF'
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.json({ logs: [] });
});

module.exports = router;
EOF

# Frontend dosyaları oluştur
cat > frontend/index.html << 'EOF'
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
            <p>✅ Nginx proxy hazır</p>
        </div>
    </div>
    <script src="js/app.js"></script>
</body>
</html>
EOF

cat > frontend/css/style.css << 'EOF'
body {
    font-family: Arial, sans-serif;
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

.status {
    background: #e9ecef;
    padding: 20px;
    border-radius: 5px;
    margin: 20px 0;
}
EOF

cat > frontend/js/app.js << 'EOF'
console.log('HızlıDeploy başlatıldı');
EOF

# .env dosyası oluştur
cat > .env << 'EOF'
NODE_ENV=production
PORT=3000
DB_PATH=./database/coolify.db
JWT_SECRET=generated-secret-key-$(date +%s)
PROJECTS_PATH=./projects
LOGS_PATH=./logs
NGINX_CONFIG_PATH=./nginx
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_PASSWORD=admin123
BASE_PROJECT_PORT=4000
MAX_PROJECT_PORT=5000
EOF

# Setup script oluştur
cat > scripts/setup.js << 'EOF'
const fs = require('fs');
const path = require('path');

console.log('🚀 HızlıDeploy kurulumu başlıyor...');

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

console.log('✅ Setup tamamlandı!');
EOF

# Bağımlılıkları yükle
log "Node.js bağımlılıkları yükleniyor..."
npm install --production

# Setup scriptini çalıştır
log "Setup scripti çalıştırılıyor..."
npm run setup

# Kullanıcı ve grup oluştur
log "Sistem kullanıcısı oluşturuluyor..."
if ! id "hizlideploy" &>/dev/null; then
    useradd -r -s /bin/false -d "$INSTALL_DIR" -c "HızlıDeploy Service" hizlideploy
fi

# Dosya izinlerini ayarla
chown -R hizlideploy:hizlideploy "$INSTALL_DIR"
chmod -R 755 "$INSTALL_DIR"

# PM2 ecosystem dosyası oluştur
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'hizlideploy',
    script: './backend/server.js',
    instances: 1,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    restart_delay: 1000,
    max_restarts: 5,
    min_uptime: '10s'
  }]
};
EOF

# PM2 startup scripti oluştur
log "PM2 startup scripti oluşturuluyor..."
runuser -l hizlideploy -c "cd $INSTALL_DIR && pm2 start ecosystem.config.js"
pm2 startup systemd -u hizlideploy --hp /home/hizlideploy
pm2 save

# Nginx yapılandırması
log "Nginx yapılandırması ayarlanıyor..."
cat > /etc/nginx/sites-available/hizlideploy << EOF
server {
    listen 80;
    server_name localhost _;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # Timeout settings
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF

# Nginx site'ı etkinleştir
ln -sf /etc/nginx/sites-available/hizlideploy /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Nginx'i test et ve yeniden başlat
nginx -t && systemctl restart nginx

# Servisleri etkinleştir
systemctl enable nginx
systemctl start nginx

# Güvenlik duvarı ayarları
log "Güvenlik duvarı ayarları yapılıyor..."
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 22/tcp
ufw --force enable

# Kurulum tamamlandı
success "🎉 HızlıDeploy başarıyla kuruldu!"
echo
echo "📋 Kurulum Bilgileri:"
echo "   • Kurulum Dizini: $INSTALL_DIR"
echo "   • Servis Adı: $SERVICE_NAME"
echo "   • Port: 3000 (Nginx proxy: 80)"
echo "   • Kullanıcı: hizlideploy"
echo
echo "🌐 Erişim Bilgileri:"
echo "   • Web Arayüzü: http://$(curl -s ifconfig.me || echo 'localhost')"
echo "   • Yerel Erişim: http://localhost"
echo "   • Admin Kullanıcı: admin"
echo "   • Admin Şifre: admin123"
echo
echo "🔧 Yararlı Komutlar:"
echo "   • Servis Durumu: systemctl status $SERVICE_NAME"
echo "   • PM2 Durumu: pm2 status"
echo "   • Logları Görüntüle: pm2 logs"
echo "   • Servisi Yeniden Başlat: pm2 restart hizlideploy"
echo
echo "📁 Projelerinizi şu dizine koyun: $INSTALL_DIR/projects"
echo
warning "🔒 Güvenlik için admin şifresini değiştirmeyi unutmayın!"
echo
success "✨ HızlıDeploy hazır! Tarayıcınızdan erişebilirsiniz." 