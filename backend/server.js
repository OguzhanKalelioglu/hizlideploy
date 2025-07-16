const express = require('express');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');
const config = require('../config/config');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend')));

// Routes
app.use('/api/projects', require('./routes/projects'));
app.use('/api/deployments', require('./routes/deployments'));
app.use('/api/logs', require('./routes/logs'));

// WebSocket bağlantıları (real-time logs için)
wss.on('connection', (ws) => {
  console.log('WebSocket bağlantısı kuruldu');
  
  ws.on('message', (message) => {
    const data = JSON.parse(message);
    if (data.type === 'subscribe_logs') {
      ws.projectId = data.projectId;
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket bağlantısı kapandı');
  });
});

// Global WebSocket referansı
global.wss = wss;

// Frontend rotası
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Favicon route
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Sayfa bulunamadı' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Sunucu hatası' });
});

// Sunucuyu başlat
const PORT = config.server.port;
server.listen(PORT, async () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor`);
  console.log(`Web arayüzü: http://localhost:${PORT}`);
  
  // Veritabanını initialize et
  const db = require('./database/init');
  
  // Deployment engine'i başlat
  require('./services/deploymentEngine');
  
  // Otomatik proje taraması ve senkronizasyonu
  console.log('Projeler taranıyor ve senkronize ediliyor...');
  try {
    const projectScanner = require('./services/projectScanner');
    const portManager = require('./services/portManager');
    
    const scannedProjects = await projectScanner.scanProjects();
    console.log(`${scannedProjects.length} proje bulundu:`, scannedProjects.map(p => p.name));
    
    for (const project of scannedProjects) {
      // Veritabanında var mı kontrol et
      const existing = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM projects WHERE name = ?', [project.name], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (!existing) {
        // Yeni proje ekle
        const projectId = await new Promise((resolve, reject) => {
          db.run(
            'INSERT INTO projects (name, path, type, description, status) VALUES (?, ?, ?, ?, ?)',
            [project.name, project.path, project.type, project.description, 'stopped'],
            function(err) {
              if (err) reject(err);
              else resolve(this.lastID);
            }
          );
        });

        // Port rezervasyonu yap
        try {
          const defaultPort = project.config?.defaultPort || 3000;
          const portInfo = await portManager.reservePort(projectId, defaultPort);
          console.log(`✅ Proje eklendi: ${project.name} (Port: ${portInfo.external_port})`);
        } catch (portError) {
          console.log(`✅ Proje eklendi: ${project.name} (Port rezervasyonu başarısız)`);
        }
      } else {
        // Mevcut projeyi güncelle
        await new Promise((resolve, reject) => {
          db.run(
            'UPDATE projects SET path = ?, type = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?',
            [project.path, project.type, project.description, project.name],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
        console.log(`🔄 Proje güncellendi: ${project.name}`);
      }
    }
    
    console.log('✅ Proje senkronizasyonu tamamlandı!');
  } catch (error) {
    console.error('❌ Proje tarama hatası:', error);
  }
});

module.exports = app; 