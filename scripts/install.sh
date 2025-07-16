#!/bin/bash

# HızlıDeploy - Ubuntu/Linux Otomatik Kurulum
# Kullanım: curl https://raw.githubusercontent.com/OguzhanKalelioglu/hizlideploy/main/scripts/install.sh | bash

set -e

echo " HızlıDeploy kurulumu başlıyor..."

# Root kontrolü
if [ "$EUID" -ne 0 ]; then
    echo "❌ Bu script root yetkileri ile çalışmalıdır. Lütfen sudo ile çalıştırın."
    exit 1
fi

# Temel paketleri kur
echo " Temel paketler kuruluyor..."
apt-get update -y
apt-get install -y curl wget git nginx sqlite3 software-properties-common ufw

# Node.js kur
echo " Node.js kuruluyor..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# PM2 kur
echo "⚙️ PM2 kuruluyor..."
npm install -g npm@latest
npm install -g pm2

# Kurulum dizini
INSTALL_DIR="/opt/hizlideploy"
echo " Kurulum dizini: $INSTALL_DIR"

# Eski kurulum varsa yedekle
if [ -d "$INSTALL_DIR" ]; then
    mv "$INSTALL_DIR" "$INSTALL_DIR.backup.$(date +%Y%m%d_%H%M%S)"
fi

# GitHub deposunu klon et
echo " GitHub deposu klonlanıyor..."
git clone https://github.com/OguzhanKalelioglu/hizlideploy.git "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Bağımlılıkları yükle
echo " Bağımlılıklar yükleniyor..."
npm install --production

# Setup çalıştır
echo "⚙️ Setup çalıştırılıyor..."
npm run setup

# Kullanıcı oluştur
echo " Sistem kullanıcısı oluşturuluyor..."
if ! id "hizlideploy" &>/dev/null; then
    useradd -r -s /bin/false -d "$INSTALL_DIR" -c "HızlıDeploy Service" hizlideploy
fi

# İzinleri ayarla
chown -R hizlideploy:hizlideploy "$INSTALL_DIR"
chmod -R 755 "$INSTALL_DIR"

# PM2 başlat
echo "🚀 PM2 servisi başlatılıyor..."
cd "$INSTALL_DIR"
npx pm2 start backend/server.js --name hizlideploy
npx pm2 startup systemd
npx pm2 save

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

# Nginx'i yeniden başlat (Evrensel Yöntem)
if nginx -t; then
    echo "Nginx yapılandırması geçerli."
    if [ -d /run/systemd/system ]; then
        echo "systemd algılandı, Nginx systemctl ile yeniden başlatılıyor..."
        systemctl restart nginx
    else
        echo "systemd algılanmadı, Nginx 'service' komutu ile yeniden başlatılıyor..."
        service nginx restart
    fi
else
    echo "❌ Nginx yapılandırma hatası!"
    exit 1
fi

# Güvenlik duvarı
echo " Güvenlik duvarı yapılandırılıyor..."
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 22/tcp
ufw --force enable

echo "✅ HızlıDeploy başarıyla kuruldu!"
echo " Web arayüzü: http://$(curl -s ifconfig.me || echo localhost)"
echo " Admin: admin / admin123"
echo " PM2 durumu için: npx pm2 status"

