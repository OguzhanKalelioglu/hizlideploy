const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../database/init');
const config = require('../../config/config');

const router = express.Router();

// Proje loglarını al
router.get('/project/:projectId', (req, res) => {
  const projectId = req.params.projectId;
  const { limit = 100, type, since } = req.query;

  let sql = 'SELECT * FROM logs WHERE project_id = ?';
  let params = [projectId];

  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }

  if (since) {
    sql += ' AND timestamp >= ?';
    params.push(since);
  }

  sql += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(parseInt(limit));

  db.all(sql, params, (err, logs) => {
    if (err) {
      return res.status(500).json({ error: 'Veritabanı hatası' });
    }

    res.json(logs);
  });
});

// Proje log dosyasını al
router.get('/project/:projectId/file/:type', (req, res) => {
  const projectId = req.params.projectId;
  const logType = req.params.type; // build, runtime, error

  // Önce proje adını al
  db.get('SELECT name FROM projects WHERE id = ?', [projectId], (err, project) => {
    if (err) {
      return res.status(500).json({ error: 'Veritabanı hatası' });
    }

    if (!project) {
      return res.status(404).json({ error: 'Proje bulunamadı' });
    }

    const logFile = path.join(config.paths.logs, `${project.name}_${logType}.log`);

    if (!fs.existsSync(logFile)) {
      return res.status(404).json({ error: 'Log dosyası bulunamadı' });
    }

    const { tail = 100 } = req.query;

    // Dosyanın son N satırını al
    const command = `tail -n ${tail} "${logFile}"`;
    
    require('child_process').exec(command, (err, stdout, stderr) => {
      if (err) {
        return res.status(500).json({ error: 'Log dosyası okunurken hata' });
      }

      res.json({
        project: project.name,
        type: logType,
        content: stdout,
        lines: stdout.split('\n').filter(line => line.trim() !== '')
      });
    });
  });
});

// Tüm logları al
router.get('/', (req, res) => {
  const { limit = 100, type, projectId, since } = req.query;

  let sql = `
    SELECT l.*, p.name as project_name
    FROM logs l
    JOIN projects p ON l.project_id = p.id
    WHERE 1=1
  `;
  let params = [];

  if (projectId) {
    sql += ' AND l.project_id = ?';
    params.push(projectId);
  }

  if (type) {
    sql += ' AND l.type = ?';
    params.push(type);
  }

  if (since) {
    sql += ' AND l.timestamp >= ?';
    params.push(since);
  }

  sql += ' ORDER BY l.timestamp DESC LIMIT ?';
  params.push(parseInt(limit));

  db.all(sql, params, (err, logs) => {
    if (err) {
      return res.status(500).json({ error: 'Veritabanı hatası' });
    }

    res.json(logs);
  });
});

// Log istatistikleri
router.get('/stats', (req, res) => {
  const { projectId, since } = req.query;

  let sql = `
    SELECT 
      l.type,
      COUNT(*) as count,
      l.project_id,
      p.name as project_name
    FROM logs l
    JOIN projects p ON l.project_id = p.id
    WHERE 1=1
  `;
  let params = [];

  if (projectId) {
    sql += ' AND l.project_id = ?';
    params.push(projectId);
  }

  if (since) {
    sql += ' AND l.timestamp >= ?';
    params.push(since);
  }

  sql += ' GROUP BY l.type, l.project_id, p.name ORDER BY count DESC';

  db.all(sql, params, (err, stats) => {
    if (err) {
      return res.status(500).json({ error: 'Veritabanı hatası' });
    }

    res.json(stats);
  });
});

// Log tiplerini al
router.get('/types', (req, res) => {
  const sql = 'SELECT DISTINCT type FROM logs ORDER BY type';

  db.all(sql, (err, types) => {
    if (err) {
      return res.status(500).json({ error: 'Veritabanı hatası' });
    }

    res.json(types.map(row => row.type));
  });
});

// Logları temizle
router.delete('/project/:projectId', (req, res) => {
  const projectId = req.params.projectId;
  const { type, before } = req.query;

  let sql = 'DELETE FROM logs WHERE project_id = ?';
  let params = [projectId];

  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }

  if (before) {
    sql += ' AND timestamp < ?';
    params.push(before);
  }

  db.run(sql, params, function(err) {
    if (err) {
      return res.status(500).json({ error: 'Veritabanı hatası' });
    }

    res.json({ 
      message: 'Loglar temizlendi',
      deletedCount: this.changes
    });
  });
});

// Tüm logları temizle
router.delete('/', (req, res) => {
  const { type, before, projectId } = req.query;

  let sql = 'DELETE FROM logs WHERE 1=1';
  let params = [];

  if (projectId) {
    sql += ' AND project_id = ?';
    params.push(projectId);
  }

  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }

  if (before) {
    sql += ' AND timestamp < ?';
    params.push(before);
  }

  db.run(sql, params, function(err) {
    if (err) {
      return res.status(500).json({ error: 'Veritabanı hatası' });
    }

    res.json({ 
      message: 'Loglar temizlendi',
      deletedCount: this.changes
    });
  });
});

// Log dosyalarını temizle
router.delete('/files/:projectId', (req, res) => {
  const projectId = req.params.projectId;

  // Önce proje adını al
  db.get('SELECT name FROM projects WHERE id = ?', [projectId], (err, project) => {
    if (err) {
      return res.status(500).json({ error: 'Veritabanı hatası' });
    }

    if (!project) {
      return res.status(404).json({ error: 'Proje bulunamadı' });
    }

    const logTypes = ['build', 'runtime', 'error'];
    let deletedFiles = 0;

    logTypes.forEach(type => {
      const logFile = path.join(config.paths.logs, `${project.name}_${type}.log`);
      
      if (fs.existsSync(logFile)) {
        try {
          fs.unlinkSync(logFile);
          deletedFiles++;
        } catch (err) {
          console.error(`Log dosyası silme hatası: ${logFile}`, err);
        }
      }
    });

    res.json({ 
      message: 'Log dosyaları temizlendi',
      deletedFiles
    });
  });
});

// Real-time log streaming için WebSocket endpoint bilgisi
router.get('/stream/info', (req, res) => {
  res.json({
    message: 'Real-time log streaming için WebSocket bağlantısı kurun',
    endpoint: `/ws`,
    usage: {
      connect: 'WebSocket bağlantısı kur',
      subscribe: 'Gönder: {"type": "subscribe_logs", "projectId": "PROJECT_ID"}',
      receive: 'Al: {"type": "log", "projectId": "PROJECT_ID", "logType": "TYPE", "message": "MESSAGE", "timestamp": TIMESTAMP}'
    }
  });
});

module.exports = router; 