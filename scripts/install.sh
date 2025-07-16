#!/bin/bash

# HızlıDeploy - Ubuntu/Linux Otomatik Kurulum
# Kullanım: curl https://raw.githubusercontent.com/OguzhanKalelioglu/hizlideploy/main/scripts/install.sh | bash

set -e

echo "��� HızlıDeploy kurulumu başlıyor..."

# Root kontrolü
if [ "$EUID" -ne 0 ]; then
    echo "❌ Bu script root yetkileri ile çalışmalıdır. Lütfen sudo ile çalıştırın."
    exit 1
fi

# Temel paketleri kur
echo "��� Temel paketler kuruluyor..."
apt-get update -y
apt-get install -y curl wget git nginx sqlite3 software-properties-common

# Node.js kur
echo "��� Node.js kuruluyor..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# PM2 kur
echo "⚙️ PM2 kuruluyor..."
npm install -g npm@latest
npm install -g pm2

# PATH'i güncelle
export PATH=$PATH:$(npm config get prefix)/bin
source ~/.bashrc || true

# PM2 komutunun mevcut olup olmadığını kontrol et
if ! command -v pm2 &> /dev/null; then
    echo "⚠️ PM2 PATH'te bulunamadı, tam path kullanılıyor..."
    PM2_PATH=$(npm config get prefix)/bin/pm2
else
    PM2_PATH=pm2
fi

# Kurulum dizini
INSTALL_DIR="/opt/hizlideploy"
echo "��� Kurulum dizini: $INSTALL_DIR"

# Eski kurulum varsa yedekle
if [ -d "$INSTALL_DIR" ]; then
    mv "$INSTALL_DIR" "$INSTALL_DIR.backup.$(date +%Y%m%d_%H%M%S)"
fi

# GitHub deposunu klon et
echo "��� GitHub deposu klonlanıyor..."
git clone https://github.com/OguzhanKalelioglu/hizlideploy.git "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Bağımlılıkları yükle
echo "��� Bağımlılıklar yükleniyor..."
npm install --production

# Setup çalıştır
echo "⚙️ Setup çalıştırılıyor..."
npm run setup

# Kullanıcı oluştur
echo "��� Sistem kullanıcısı oluşturuluyor..."
if ! id "hizlideploy" &>/dev/null; then
    useradd -r -s /bin/false -d "$INSTALL_DIR" -c "HızlıDeploy Service" hizlideploy
fi

# İzinleri ayarla
chown -R hizlideploy:hizlideploy "$INSTALL_DIR"
chmod -R 755 "$INSTALL_DIR"

# PM2 başlat
echo "🚀 PM2 servisi başlatılıyor..."
cd "$INSTALL_DIR"
$PM2_PATH start backend/server.js --name hizlideploy
$PM2_PATH startup systemd
$PM2_PATH save

# Systemd servis dosyası oluştur
cat > /etc/systemd/system/hizlideploy.service << EOF
[Unit]
Description=HızlıDeploy Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/hizlideploy
ExecStart=$PM2_PATH start backend/server.js --name hizlideploy --no-daemon
ExecStop=$PM2_PATH stop hizlideploy
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable hizlideploy
systemctl start hizlideploy

# Nginx yapılandır
echo " Nginx yapılandırılıyor..."
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
        
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

ln -sf /etc/nginx/sites-available/hizlideploy /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

# Güvenlik duvarı
echo " Güvenlik duvarı yapılandırılıyor..."
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 22/tcp
ufw --force enable

echo "✅ HızlıDeploy başarıyla kuruldu!"
echo " Web arayüzü: http://$(curl -s ifconfig.me || echo localhost)"
echo " Admin: admin / admin123"
echo " PM2 durumu: $PM2_PATH status"

