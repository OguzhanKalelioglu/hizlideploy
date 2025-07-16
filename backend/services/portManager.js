const db = require('../database/init');
const config = require('../../config/config');

class PortManager {
  constructor() {
    this.basePort = config.deployment.basePort;
    this.maxPort = config.deployment.maxPort;
    this.usedPorts = new Set();
    this.loadUsedPorts();
  }

  // Kullanılan portları yükle
  async loadUsedPorts() {
    return new Promise((resolve, reject) => {
      db.all('SELECT port, external_port FROM projects WHERE port IS NOT NULL', (err, rows) => {
        if (err) {
          reject(err);
          return;
        }

        this.usedPorts.clear();
        rows.forEach(row => {
          if (row.port) this.usedPorts.add(row.port);
          if (row.external_port) this.usedPorts.add(row.external_port);
        });

        resolve();
      });
    });
  }

  // Boş port bul
  async findAvailablePort(preferredPort = null) {
    await this.loadUsedPorts();

    // Eğer tercih edilen port varsa ve boşsa onu kullan
    if (preferredPort && !this.usedPorts.has(preferredPort) && this.isValidPort(preferredPort)) {
      return preferredPort;
    }

    // Base port'tan başlayarak boş port bul
    for (let port = this.basePort; port <= this.maxPort; port++) {
      if (!this.usedPorts.has(port)) {
        return port;
      }
    }

    throw new Error('Boş port bulunamadı');
  }

  // Port'u rezerve et
  async reservePort(projectId, internalPort, externalPort = null) {
    try {
      // Direct process deployment için internal ve external port aynı olmalı
      // Tercih edilen port boşsa kullan, değilse yeni port bul
      const availablePort = await this.findAvailablePort(internalPort);
      internalPort = availablePort;
      externalPort = availablePort;

      // Port assignment'ı kaydet
      return new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO port_assignments (project_id, internal_port, external_port) VALUES (?, ?, ?)',
          [projectId, internalPort, externalPort],
          function(err) {
            if (err) {
              reject(err);
              return;
            }

            // Proje tablosunu güncelle
            db.run(
              'UPDATE projects SET port = ?, external_port = ? WHERE id = ?',
              [internalPort, externalPort, projectId],
              (err) => {
                if (err) {
                  reject(err);
                  return;
                }

                resolve({
                  internal_port: internalPort,
                  external_port: externalPort
                });
              }
            );
          }
        );
      });
    } catch (error) {
      throw new Error(`Port rezervasyonu hatası: ${error.message}`);
    }
  }

  // Port'u serbest bırak
  async releasePort(projectId) {
    return new Promise((resolve, reject) => {
      // Port assignment'ı sil
      db.run('DELETE FROM port_assignments WHERE project_id = ?', [projectId], (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Proje tablosundaki port bilgilerini temizle
        db.run('UPDATE projects SET port = NULL, external_port = NULL WHERE id = ?', [projectId], (err) => {
          if (err) {
            reject(err);
            return;
          }

          resolve();
        });
      });
    });
  }

  // Port'un geçerli olup olmadığını kontrol et
  isValidPort(port) {
    return port >= this.basePort && port <= this.maxPort;
  }

  // Proje için port bilgilerini al
  async getProjectPorts(projectId) {
    return new Promise((resolve, reject) => {
      db.get('SELECT port, external_port FROM projects WHERE id = ?', [projectId], (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(row || { port: null, external_port: null });
      });
    });
  }

  // Kullanılan port listesini al
  async getUsedPorts() {
    await this.loadUsedPorts();
    return Array.from(this.usedPorts);
  }

  // Port kullanımı istatistikleri
  async getPortStats() {
    await this.loadUsedPorts();
    
    const totalPorts = this.maxPort - this.basePort + 1;
    const usedPortsCount = this.usedPorts.size;
    const availablePortsCount = totalPorts - usedPortsCount;

    return {
      total: totalPorts,
      used: usedPortsCount,
      available: availablePortsCount,
      basePort: this.basePort,
      maxPort: this.maxPort,
      usedPorts: Array.from(this.usedPorts).sort((a, b) => a - b)
    };
  }

  // Port'un kullanılıp kullanılmadığını kontrol et
  async isPortInUse(port) {
    await this.loadUsedPorts();
    return this.usedPorts.has(port);
  }

  // Belirli bir port aralığında boş port bul
  async findAvailablePortInRange(startPort, endPort) {
    await this.loadUsedPorts();

    for (let port = startPort; port <= endPort; port++) {
      if (!this.usedPorts.has(port)) {
        return port;
      }
    }

    throw new Error(`${startPort}-${endPort} aralığında boş port bulunamadı`);
  }
}

module.exports = new PortManager(); 