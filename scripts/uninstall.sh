#!/bin/bash

# HızlıDeploy - Ubuntu/Linux Otomatik Kaldırma Scripti
# Kullanım: curl https://raw.githubusercontent.com/OguzhanKalelioglu/hizlideploy/main/scripts/uninstall.sh | sudo bash

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
warning "Bu işlem HızlıDeploy'u ve ilgili tüm verileri (projeler, veritabanı, loglar) tamamen kaldıracak!"

# PM2 servisini durdur ve kaldır
log "PM2 servisi kaldırılıyor..."
if command -v pm2 &> /dev/null; then
    pm2 stop hizlideploy &>/dev/null || true
    pm2 delete hizlideploy &>/dev/null || true
    pm2 save --force &>/dev/null || true
    success "PM2 servisi (hizlideploy) kaldırıldı."
fi

# Systemd servisini kaldır (varsa)
log "Systemd servisi kontrol ediliyor..."
if [ -f "/etc/systemd/system/hizlideploy.service" ]; then
    if [ -d /run/systemd/system ]; then
        systemctl stop hizlideploy &>/dev/null || true
        systemctl disable hizlideploy &>/dev/null || true
    fi
    rm -f /etc/systemd/system/hizlideploy.service
    if [ -d /run/systemd/system ]; then
        systemctl daemon-reload
    fi
    success "Systemd servisi (hizlideploy.service) kaldırıldı."
fi


# Nginx yapılandırmasını kaldır
log "Nginx yapılandırması kaldırılıyor..."
rm -f /etc/nginx/sites-available/hizlideploy
rm -f /etc/nginx/sites-enabled/hizlideploy
success "Nginx yapılandırması kaldırıldı."

# Nginx'i yeniden başlat (Evrensel Yöntem)
if command -v nginx &> /dev/null && nginx -t &>/dev/null; then
    log "Nginx yeniden başlatılıyor..."
    if [ -d /run/systemd/system ]; then
        systemctl restart nginx &>/dev/null || true
    else
        service nginx restart &>/dev/null || true
    fi
    success "Nginx servisi yeniden başlatıldı."
else
    warning "Nginx servisi yeniden başlatılamadı veya Nginx kurulu değil."
fi

# Kullanıcıyı kaldır
log "Sistem kullanıcısı (hizlideploy) kaldırılıyor..."
if id "hizlideploy" &>/dev/null; then
    userdel -r hizlideploy &>/dev/null || true
    success "Sistem kullanıcısı kaldırıldı."
fi

# Ana dizini kaldır
log "Ana kurulum dizini ($INSTALL_DIR) kaldırılıyor..."
if [ -d "$INSTALL_DIR" ]; then
    rm -rf "$INSTALL_DIR"
    success "Ana kurulum dizini kaldırıldı."
fi

# Güvenlik duvarı kurallarını kaldır
log "Güvenlik duvarı kuralları kaldırılıyor..."
if command -v ufw &> /dev/null; then
    ufw delete allow 80/tcp &>/dev/null || true
    ufw delete allow 443/tcp &>/dev/null || true
    success "Güvenlik duvarı kuralları kaldırıldı."
fi

success "🎉 HızlıDeploy başarıyla kaldırıldı!" 