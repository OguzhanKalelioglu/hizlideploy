const express = require('express');
const db = require('../database/init');
const deploymentEngine = require('../services/deploymentEngine');
const portManager = require('../services/portManager');

const router = express.Router();

// Proje deploy et
router.post('/deploy/:projectId', async (req, res) => {
  try {
    const projectId = req.params.projectId;
    const options = req.body;

    const deploymentId = await deploymentEngine.deployProject(projectId, options);
    
    res.json({
      message: 'Deployment başlatıldı',
      deploymentId,
      projectId
    });
  } catch (error) {
    console.error('Deployment hatası:', error);
    res.status(500).json({ error: error.message });
  }
});

// Projeyi başlat
router.post('/start/:projectId', async (req, res) => {
  try {
    const projectId = req.params.projectId;
    
    const pid = await deploymentEngine.startProject(projectId);
    
    res.json({
      message: 'Proje başlatıldı',
      pid,
      projectId
    });
  } catch (error) {
    console.error('Proje başlatma hatası:', error);
    res.status(500).json({ error: error.message });
  }
});

// Projeyi durdur
router.post('/stop/:projectId', async (req, res) => {
  try {
    const projectId = req.params.projectId;
    
    await deploymentEngine.stopProject(projectId);
    
    res.json({
      message: 'Proje durduruldu',
      projectId
    });
  } catch (error) {
    console.error('Proje durdurma hatası:', error);
    res.status(500).json({ error: error.message });
  }
});

// Projeyi restart et
router.post('/restart/:projectId', async (req, res) => {
  try {
    const projectId = req.params.projectId;
    
    await deploymentEngine.restartProject(projectId);
    
    res.json({
      message: 'Proje yeniden başlatıldı',
      projectId
    });
  } catch (error) {
    console.error('Proje restart hatası:', error);
    res.status(500).json({ error: error.message });
  }
});

// Çalışan projeler listesi
router.get('/running', (req, res) => {
  try {
    const runningProjects = deploymentEngine.getRunningProjects();
    res.json(runningProjects);
  } catch (error) {
    console.error('Çalışan projeler listesi hatası:', error);
    res.status(500).json({ error: error.message });
  }
});

// Tüm deploymentları listele
router.get('/', (req, res) => {
  const { projectId, limit = 50 } = req.query;

  let sql = `
    SELECT d.*, p.name as project_name 
    FROM deployments d 
    JOIN projects p ON d.project_id = p.id
  `;
  let params = [];

  if (projectId) {
    sql += ' WHERE d.project_id = ?';
    params.push(projectId);
  }

  sql += ' ORDER BY d.started_at DESC LIMIT ?';
  params.push(parseInt(limit));

  db.all(sql, params, (err, deployments) => {
    if (err) {
      return res.status(500).json({ error: 'Veritabanı hatası' });
    }

    res.json(deployments);
  });
});

// Deployment detayı
router.get('/:id', (req, res) => {
  const deploymentId = req.params.id;

  const sql = `
    SELECT d.*, p.name as project_name, p.type as project_type
    FROM deployments d 
    JOIN projects p ON d.project_id = p.id
    WHERE d.id = ?
  `;

  db.get(sql, [deploymentId], (err, deployment) => {
    if (err) {
      return res.status(500).json({ error: 'Veritabanı hatası' });
    }

    if (!deployment) {
      return res.status(404).json({ error: 'Deployment bulunamadı' });
    }

    res.json(deployment);
  });
});

// Deployment loglarını al
router.get('/:id/logs', (req, res) => {
  const deploymentId = req.params.id;

  db.get('SELECT * FROM deployments WHERE id = ?', [deploymentId], (err, deployment) => {
    if (err) {
      return res.status(500).json({ error: 'Veritabanı hatası' });
    }

    if (!deployment) {
      return res.status(404).json({ error: 'Deployment bulunamadı' });
    }

    // Bu deployment'a ait logları al
    const logSql = `
      SELECT * FROM logs 
      WHERE project_id = ? 
      AND timestamp >= ? 
      ORDER BY timestamp DESC 
      LIMIT 100
    `;

    db.all(logSql, [deployment.project_id, deployment.started_at], (err, logs) => {
      if (err) {
        return res.status(500).json({ error: 'Log veritabanı hatası' });
      }

      res.json(logs);
    });
  });
});

// Port istatistikleri
router.get('/ports/stats', async (req, res) => {
  try {
    const stats = await portManager.getPortStats();
    res.json(stats);
  } catch (error) {
    console.error('Port istatistikleri hatası:', error);
    res.status(500).json({ error: error.message });
  }
});

// Port'u serbest bırak
router.post('/ports/release/:projectId', async (req, res) => {
  try {
    const projectId = req.params.projectId;
    
    await portManager.releasePort(projectId);
    
    res.json({
      message: 'Port serbest bırakıldı',
      projectId
    });
  } catch (error) {
    console.error('Port serbest bırakma hatası:', error);
    res.status(500).json({ error: error.message });
  }
});

// Deployment'ı iptal et
router.delete('/:id', (req, res) => {
  const deploymentId = req.params.id;

  // Önce deployment'ı al
  db.get('SELECT * FROM deployments WHERE id = ?', [deploymentId], (err, deployment) => {
    if (err) {
      return res.status(500).json({ error: 'Veritabanı hatası' });
    }

    if (!deployment) {
      return res.status(404).json({ error: 'Deployment bulunamadı' });
    }

    // Sadece pending veya building durumundaki deploymentları iptal et
    if (deployment.status !== 'pending' && deployment.status !== 'building') {
      return res.status(400).json({ error: 'Bu deployment iptal edilemez' });
    }

    // Deployment'ı iptal et
    db.run(
      'UPDATE deployments SET status = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['cancelled', deploymentId],
      (err) => {
        if (err) {
          return res.status(500).json({ error: 'Deployment iptal hatası' });
        }

        res.json({ message: 'Deployment iptal edildi' });
      }
    );
  });
});

module.exports = router; 