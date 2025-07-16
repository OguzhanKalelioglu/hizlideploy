#!/bin/bash

# HızlıDeploy - Ubuntu/Linux Kaldırma Scripti
# Kullanım: curl https://eker.com/hizlideploy/uninstall.sh | sudo bash

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

log "🗑️  HızlıDeploy kaldırma işlemi başlıyor..."

# Kurulum kontrolü
if [ ! -d "$INSTALL_DIR" ]; then
    warning "HızlıDeploy kurulu görünmüyor."
    read -p "Yine de temizlik yapmak ister misiniz? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log "Kaldırma işlemi iptal edildi."
        exit 0
    fi
fi

# Onay al
echo -e "${YELLOW}⚠️  UYARI: Bu işlem HızlıDeploy'u tamamen kaldıracak!${NC}"
echo -e "${YELLOW}   • Tüm projeler silinecek${NC}"
echo -e "${YELLOW}   • Veritabanı silinecek${NC}"
echo -e "${YELLOW}   • Loglar silinecek${NC}"
echo -e "${YELLOW}   • Nginx yapılandırması silinecek${NC}"
echo
read -p "Devam etmek istediğinizden emin misiniz? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log "Kaldırma işlemi iptal edildi."
    exit 0
fi

# Son bir kez onay al
echo -e "${RED}❌ SON UYARI: Bu işlem geri alınamaz!${NC}"
read -p "Gerçekten kaldırmak istiyor musunuz? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log "Kaldırma işlemi iptal edildi."
    exit 0
fi

# Yedek oluştur
log "Son yedek oluşturuluyor..."
if [ -d "$INSTALL_DIR" ]; then
    BACKUP_DIR="$INSTALL_DIR.final_backup.$(date +%Y%m%d_%H%M%S)"
    cp -r "$INSTALL_DIR" "$BACKUP_DIR"
    success "Son yedek oluşturuldu: $BACKUP_DIR"
fi

# PM2 servisini durdur ve kaldır
log "PM2 servisi kaldırılıyor..."
if command -v pm2 &> /dev/null; then
    pm2 stop hizlideploy || true
    pm2 delete hizlideploy || true
    pm2 kill || true
    success "PM2 servisi kaldırıldı"
fi

# Nginx yapılandırmasını kaldır
log "Nginx yapılandırması kaldırılıyor..."
if [ -f "/etc/nginx/sites-available/hizlideploy" ]; then
    rm -f /etc/nginx/sites-available/hizlideploy
    success "Nginx site yapılandırması kaldırıldı"
fi

if [ -L "/etc/nginx/sites-enabled/hizlideploy" ]; then
    rm -f /etc/nginx/sites-enabled/hizlideploy
    success "Nginx site linki kaldırıldı"
fi

# Nginx'i yeniden başlat
if systemctl is-active --quiet nginx; then
    systemctl restart nginx
    success "Nginx yeniden başlatıldı"
fi

# Kullanıcıyı kaldır
log "Sistem kullanıcısı kaldırılıyor..."
if id "hizlideploy" &>/dev/null; then
    userdel -r hizlideploy 2>/dev/null || true
    success "Sistem kullanıcısı kaldırıldı"
fi

# Ana dizini kaldır
log "Ana kurulum dizini kaldırılıyor..."
if [ -d "$INSTALL_DIR" ]; then
    rm -rf "$INSTALL_DIR"
    success "Ana kurulum dizini kaldırıldı"
fi

# Güvenlik duvarı kurallarını kaldır
log "Güvenlik duvarı kuralları kaldırılıyor..."
ufw delete allow 80/tcp 2>/dev/null || true
ufw delete allow 443/tcp 2>/dev/null || true
success "Güvenlik duvarı kuralları kaldırıldı"

# Systemd servisini kaldır (varsa)
log "Systemd servisi kontrol ediliyor..."
if systemctl list-unit-files | grep -q "hizlideploy"; then
    systemctl stop hizlideploy || true
    systemctl disable hizlideploy || true
    rm -f /etc/systemd/system/hizlideploy.service
    systemctl daemon-reload
    success "Systemd servisi kaldırıldı"
fi

# Global npm paketlerini kaldır (isteğe bağlı)
log "Global npm paketleri kontrol ediliyor..."
read -p "PM2'yi de kaldırmak istiyor musunuz? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    npm uninstall -g pm2 2>/dev/null || true
    npm uninstall -g pm2-windows-service 2>/dev/null || true
    success "PM2 kaldırıldı"
fi

# Logları temizle
log "Sistem logları temizleniyor..."
journalctl --rotate || true
journalctl --vacuum-time=1s || true

# Kurulum bittikten sonra bilgilendirme
success "🎉 HızlıDeploy başarıyla kaldırıldı!"
echo
echo "📋 Kaldırma Özeti:"
echo "   • Kaldırma Zamanı: $(date)"
echo "   • Son Yedek: $BACKUP_DIR"
echo "   • Kaldırılan Servisler: hizlideploy, nginx config"
echo "   • Silinen Dizin: $INSTALL_DIR"
echo
echo "🔧 Manuel Temizlik (İsteğe Bağlı):"
echo "   • Node.js kaldırma: apt remove nodejs npm"
echo "   • Nginx kaldırma: apt remove nginx"
echo "   • Son yedek silme: rm -rf $BACKUP_DIR"
echo
echo "💡 Yeniden Kurulum:"
echo "   • curl https://eker.com/hizlideploy/install.sh | sudo bash"
echo
success "✨ Kaldırma işlemi tamamlandı!"

# Sistemi temizle
log "Sistem temizleniyor..."
apt autoremove -y || true
apt autoclean || true

success "Sistem temizlendi." 