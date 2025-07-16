#!/bin/bash

# HızlıDeploy - Ubuntu/Linux Güncelleme Scripti
# Kullanım: curl https://eker.com/hizlideploy/update.sh | sudo bash

set -e

# Renkli output için
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Kurulum dizini
INSTALL_DIR="/opt/hizlideploy"

log "🔄 HızlıDeploy güncelleme başlıyor..."

# Kurulum kontrolü
if [ ! -d "$INSTALL_DIR" ]; then
    error "HızlıDeploy kurulu görünmüyor. Lütfen önce kurulum yapın."
fi

# Mevcut sürüm backup
log "Mevcut sürüm yedekleniyor..."
BACKUP_DIR="$INSTALL_DIR.backup.$(date +%Y%m%d_%H%M%S)"
cp -r "$INSTALL_DIR" "$BACKUP_DIR"
success "Yedek oluşturuldu: $BACKUP_DIR"

cd "$INSTALL_DIR"

# Servisi durdur
log "Servis durduruluyor..."
pm2 stop hizlideploy || true
systemctl stop nginx || true

# Node.js ve npm güncelle
log "Node.js ve npm güncelleniyor..."
npm install -g npm@latest
npm install -g pm2@latest

# Proje bağımlılıklarını güncelle
log "Proje bağımlılıkları güncelleniyor..."
npm update

# Veritabanı backup
log "Veritabanı yedekleniyor..."
if [ -f "database/coolify.db" ]; then
    cp "database/coolify.db" "database/coolify.db.backup.$(date +%Y%m%d_%H%M%S)"
    success "Veritabanı yedeklendi"
fi

# Ecosystem config güncelle
log "PM2 yapılandırması güncelleniyor..."
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

# Servis izinlerini düzelt
chown -R hizlideploy:hizlideploy "$INSTALL_DIR"
chmod -R 755 "$INSTALL_DIR"

# Servisi yeniden başlat
log "Servis yeniden başlatılıyor..."
runuser -l hizlideploy -c "cd $INSTALL_DIR && pm2 restart hizlideploy"
pm2 save

systemctl restart nginx

# Servis durumunu kontrol et
sleep 5
if pm2 describe hizlideploy | grep -q "online"; then
    success "Servis başarıyla yeniden başlatıldı"
else
    error "Servis başlatılamadı. Lütfen logları kontrol edin: pm2 logs"
fi

# Nginx durumu kontrol et
if systemctl is-active --quiet nginx; then
    success "Nginx servisi aktif"
else
    warning "Nginx servisi ile ilgili sorun var"
fi

success "🎉 HızlıDeploy başarıyla güncellendi!"
echo
echo "📋 Güncelleme Bilgileri:"
echo "   • Güncelleme Zamanı: $(date)"
echo "   • Yedek Dizin: $BACKUP_DIR"
echo "   • Aktif Sürüm: $(npm list hizli-deploy --depth=0 2>/dev/null | grep hizli-deploy || echo 'Unknown')"
echo
echo "🌐 Erişim:"
echo "   • Web Arayüzü: http://$(curl -s ifconfig.me || echo 'localhost')"
echo "   • Yerel Erişim: http://localhost"
echo
echo "🔧 Yararlı Komutlar:"
echo "   • Servis Durumu: pm2 status"
echo "   • Logları Görüntüle: pm2 logs"
echo "   • Yedek Geri Yükle: mv $BACKUP_DIR $INSTALL_DIR"
echo
success "✨ Güncelleme tamamlandı!" 