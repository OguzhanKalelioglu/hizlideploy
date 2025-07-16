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

# PM2'nin gerçek path'ini bul
NPM_BIN=$(npm bin -g)
PM2_PATH="$NPM_BIN/pm2"

# PM2'nin varlığını kontrol et
if [ ! -f "$PM2_PATH" ]; then
    echo "❌ PM2 bulunamadı: $PM2_PATH"
    echo "PM2'yi tekrar kurmayı deniyor..."
    npm install -g pm2 --force
    PM2_PATH="$NPM_BIN/pm2"
    
    # Hala bulunamazsa alternatif yöntem
    if [ ! -f "$PM2_PATH" ]; then
        echo "⚠️ PM2 hala bulunamadı, alternatif yöntem deneniyor..."
        # PM2'yi npx ile çalıştır
        PM2_CMD="npx pm2"
    else
        PM2_CMD="$PM2_PATH"
    fi
else
    PM2_CMD="$PM2_PATH"
fi

echo "✅ PM2 komutu: $PM2_CMD"

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
$PM2_CMD start backend/server.js --name hizlideploy
$PM2_CMD startup systemd
$PM2_CMD save

# Systemd servis dosyası oluştur
cat > /etc/systemd/system/hizlideploy.service << EOF
[Unit]
Description=HızlıDeploy Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/hizlideploy
ExecStart=/bin/bash -c 'cd /opt/hizlideploy && $PM2_CMD start backend/server.js --name hizlideploy --no-daemon'
ExecStop=/bin/bash -c '$PM2_CMD stop hizlideploy'
Restart=always
RestartSec=10
Environment="PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$NPM_BIN"

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
echo " PM2 durumu: $PM2_CMD status"

