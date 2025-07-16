const express = require('express');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const AdmZip = require('adm-zip');
const db = require('../database/init');
const projectScanner = require('../services/projectScanner');
const portManager = require('../services/portManager');
const config = require('../../config/config');

const router = express.Router();

// Multer konfigürasyonu
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const tempDir = path.join(__dirname, '../../temp');
    fs.ensureDirSync(tempDir);
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    cb(null, uuidv4() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: function (req, file, cb) {
    // ZIP, RAR, TAR.GZ dosyalarını kabul et
    const allowedTypes = [
      'application/zip',
      'application/x-zip-compressed',
      'application/x-rar-compressed',
      'application/gzip',
      'application/x-tar'
    ];
    
    if (allowedTypes.includes(file.mimetype) || file.originalname.endsWith('.zip') || file.originalname.endsWith('.rar')) {
      cb(null, true);
    } else {
      cb(new Error('Sadece ZIP, RAR veya TAR.GZ dosyaları desteklenir'));
    }
  }
});

// Tüm projeleri listele
router.get('/', async (req, res) => {
  try {
    // Veritabanından projeleri al
    db.all('SELECT * FROM projects ORDER BY created_at DESC', (err, dbProjects) => {
      if (err) {
        return res.status(500).json({ error: 'Veritabanı hatası' });
      }

      // Dosya sisteminden projeleri tara
      projectScanner.scanProjects().then(scannedProjects => {
        // Veritabanı ile dosya sistemini senkronize et
        const syncedProjects = scannedProjects.map(scanned => {
          const dbProject = dbProjects.find(db => db.name === scanned.name);
          return {
            ...scanned,
            id: dbProject?.id,
            port: dbProject?.port,
            external_port: dbProject?.external_port,
            status: dbProject?.status || 'stopped',
            created_at: dbProject?.created_at,
            updated_at: dbProject?.updated_at
          };
        });

        res.json(syncedProjects);
      }).catch(error => {
        console.error('Proje tarama hatası:', error);
        res.status(500).json({ error: 'Proje tarama hatası' });
      });
    });
  } catch (error) {
    console.error('Proje listesi hatası:', error);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// Proje türlerini listele (bu /:id'den önce olmalı)
router.get('/types', (req, res) => {
  const projectTypes = [
    {
      id: 'nodejs',
      name: 'Node.js',
      description: 'Express.js veya diğer Node.js uygulamaları',
      icon: 'fab fa-node-js'
    },
    {
      id: 'python-flask',
      name: 'Python Flask',
      description: 'Flask web uygulamaları',
      icon: 'fab fa-python'
    },
    {
      id: 'python-django',
      name: 'Python Django',
      description: 'Django web uygulamaları',
      icon: 'fab fa-python'
    },
    {
      id: 'react',
      name: 'React',
      description: 'React.js uygulamaları',
      icon: 'fab fa-react'
    },
    {
      id: 'vue',
      name: 'Vue.js',
      description: 'Vue.js uygulamaları',
      icon: 'fab fa-vuejs'
    },
    {
      id: 'static',
      name: 'Statik Site',
      description: 'HTML, CSS, JavaScript',
      icon: 'fas fa-globe'
    },
    {
      id: 'php',
      name: 'PHP',
      description: 'PHP uygulamaları',
      icon: 'fab fa-php'
    }
  ];

  res.json(projectTypes);
});

// Desteklenen proje türlerini listele
router.get('/types/supported', (req, res) => {
  const supportedTypes = projectScanner.getSupportedTypes();
  const typeDetails = {};

  supportedTypes.forEach(type => {
    typeDetails[type] = projectScanner.getProjectTypeInfo(type);
  });

  res.json(typeDetails);
});

// Tek proje detayı
router.get('/:id', (req, res) => {
  const projectId = req.params.id;

  db.get('SELECT * FROM projects WHERE id = ?', [projectId], (err, project) => {
    if (err) {
      return res.status(500).json({ error: 'Veritabanı hatası' });
    }

    if (!project) {
      return res.status(404).json({ error: 'Proje bulunamadı' });
    }

    // Proje dizinini analiz et
    projectScanner.analyzeProject(project.path, project.name).then(analyzedProject => {
      res.json({
        ...project,
        ...analyzedProject
      });
    }).catch(error => {
      console.error('Proje analiz hatası:', error);
      res.json(project);
    });
  });
});

// Proje ekle/güncelle
router.post('/sync', async (req, res) => {
  try {
    const scannedProjects = await projectScanner.scanProjects();
    
    for (const project of scannedProjects) {
      // Veritabanında var mı kontrol et
      db.get('SELECT * FROM projects WHERE name = ?', [project.name], (err, existing) => {
        if (err) {
          console.error('Veritabanı hatası:', err);
          return;
        }

        if (!existing) {
          // Yeni proje ekle
          db.run(
            'INSERT INTO projects (name, path, type, description, status) VALUES (?, ?, ?, ?, ?)',
            [project.name, project.path, project.type, project.description, 'stopped'],
            function(err) {
              if (err) {
                console.error('Proje ekleme hatası:', err);
              } else {
                console.log(`Yeni proje eklendi: ${project.name}`);
              }
            }
          );
        } else {
          // Mevcut projeyi güncelle
          db.run(
            'UPDATE projects SET path = ?, type = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?',
            [project.path, project.type, project.description, project.name],
            (err) => {
              if (err) {
                console.error('Proje güncelleme hatası:', err);
              }
            }
          );
        }
      });
    }

    res.json({ message: 'Projeler senkronize edildi', count: scannedProjects.length });
  } catch (error) {
    console.error('Senkronizasyon hatası:', error);
    res.status(500).json({ error: 'Senkronizasyon hatası' });
  }
});

// Mevcut projelere port ata
router.post('/assign-ports', async (req, res) => {
  try {
    // Port ataması olmayan projeleri bul
    db.all('SELECT * FROM projects WHERE port IS NULL OR external_port IS NULL', async (err, projects) => {
      if (err) {
        return res.status(500).json({ error: 'Veritabanı hatası' });
      }

      let assignedCount = 0;
      const results = [];

      for (const project of projects) {
        try {
          const typeInfo = projectScanner.getProjectTypeInfo(project.type);
          const defaultPort = typeInfo?.defaultPort || 3000;
          const portInfo = await portManager.reservePort(project.id, defaultPort);

          console.log(`Proje ${project.name} için port rezerve edildi:`, portInfo);
          assignedCount++;
          
          results.push({
            id: project.id,
            name: project.name,
            port: portInfo.internal_port,
            external_port: portInfo.external_port
          });
        } catch (error) {
          console.error(`Proje ${project.name} için port ataması başarısız:`, error);
          results.push({
            id: project.id,
            name: project.name,
            error: error.message
          });
        }
      }

      res.json({
        message: `${assignedCount} projeye port atandı`,
        totalProjects: projects.length,
        assignedCount,
        results
      });
    });
  } catch (error) {
    console.error('Port atama hatası:', error);
    res.status(500).json({ error: 'Port atama hatası' });
  }
});

// Proje sil
router.delete('/:id', (req, res) => {
  const projectId = req.params.id;

  db.get('SELECT * FROM projects WHERE id = ?', [projectId], (err, project) => {
    if (err) {
      return res.status(500).json({ error: 'Veritabanı hatası' });
    }

    if (!project) {
      return res.status(404).json({ error: 'Proje bulunamadı' });
    }

    // Önce deployment'ları temizle
    db.run('DELETE FROM deployments WHERE project_id = ?', [projectId], (err) => {
      if (err) {
        return res.status(500).json({ error: 'Deployment temizleme hatası' });
      }

      // Sonra port assignment'ları temizle
      db.run('DELETE FROM port_assignments WHERE project_id = ?', [projectId], (err) => {
        if (err) {
          return res.status(500).json({ error: 'Port assignment temizleme hatası' });
        }

        // Son olarak projeyi sil
        db.run('DELETE FROM projects WHERE id = ?', [projectId], (err) => {
          if (err) {
            return res.status(500).json({ error: 'Proje silme hatası' });
          }

          res.json({ message: 'Proje başarıyla silindi' });
        });
      });
    });
  });
});

// Yeni proje oluştur
router.post('/create', async (req, res) => {
  try {
    const { name, type, description } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: 'Proje adı ve türü gerekli' });
    }

    // Proje adını temizle
    const projectName = name.replace(/[^a-zA-Z0-9-_]/g, '').toLowerCase();
    const projectPath = path.join(config.paths.projects, projectName);

    // Proje zaten var mı kontrol et
    if (fs.existsSync(projectPath)) {
      return res.status(400).json({ error: 'Bu isimde bir proje zaten mevcut' });
    }

    // Proje klasörünü oluştur
    fs.mkdirSync(projectPath, { recursive: true });

    // Proje türüne göre template dosyaları oluştur
    await createProjectTemplate(projectPath, type, projectName, description);

    // Veritabanına kaydet
    db.run(
      'INSERT INTO projects (name, path, type, description, status) VALUES (?, ?, ?, ?, ?)',
      [projectName, projectPath, type, description || '', 'stopped'],
      async function(err) {
        if (err) {
          // Hata durumunda klasörü sil
          fs.removeSync(projectPath);
          return res.status(500).json({ error: 'Veritabanı hatası' });
        }

        const projectId = this.lastID;

        try {
          // Port rezervasyonu yap
          const typeInfo = projectScanner.getProjectTypeInfo(type);
          const defaultPort = typeInfo?.defaultPort || 3000;
          const portInfo = await portManager.reservePort(projectId, defaultPort);

          console.log(`Proje ${projectName} için port rezerve edildi:`, portInfo);

          res.json({
            message: 'Proje başarıyla oluşturuldu',
            project: {
              id: projectId,
              name: projectName,
              path: projectPath,
              type,
              description: description || '',
              status: 'stopped',
              port: portInfo.internal_port,
              external_port: portInfo.external_port
            }
          });
        } catch (portError) {
          console.error('Port rezervasyonu hatası:', portError);
          res.json({
            message: 'Proje oluşturuldu ancak port rezervasyonu başarısız',
            project: {
              id: projectId,
              name: projectName,
              path: projectPath,
              type,
              description: description || '',
              status: 'stopped'
            }
          });
        }
      }
    );
  } catch (error) {
    console.error('Proje oluşturma hatası:', error);
    res.status(500).json({ error: 'Proje oluşturma hatası' });
  }
});

// Proje yükle (ZIP dosyası)
router.post('/upload', upload.single('projectFile'), async (req, res) => {
  try {
    const { projectName } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'Dosya yüklenmedi' });
    }

    if (!projectName) {
      return res.status(400).json({ error: 'Proje adı gerekli' });
    }

    // Proje adını temizle
    const cleanProjectName = projectName.replace(/[^a-zA-Z0-9-_]/g, '').toLowerCase();
    const projectPath = path.join(config.paths.projects, cleanProjectName);

    // Proje zaten var mı kontrol et
    if (fs.existsSync(projectPath)) {
      fs.removeSync(file.path); // Temp dosyayı sil
      return res.status(400).json({ error: 'Bu isimde bir proje zaten mevcut' });
    }

    // ZIP dosyasını extract et
    try {
      // Önce dosyanın gerçekten ZIP olup olmadığını kontrol et
      const fileBuffer = fs.readFileSync(file.path);
      
      // ZIP dosyası magic number kontrolü (PK)
      if (fileBuffer.length < 4 || fileBuffer[0] !== 0x50 || fileBuffer[1] !== 0x4B) {
        fs.removeSync(file.path);
        return res.status(400).json({ error: 'Geçersiz ZIP dosyası formatı.' });
      }
      
      const zip = new AdmZip(file.path);
      const zipEntries = zip.getEntries();
      
      if (zipEntries.length === 0) {
        fs.removeSync(file.path);
        return res.status(400).json({ error: 'ZIP dosyası boş.' });
      }
      
      // ZIP içeriğini extract et
      zip.extractAllTo(projectPath, true);

      // Temp dosyayı sil
      fs.removeSync(file.path);

      // ZIP içinde tek klasör varsa, içeriğini ana dizine taşı
      try {
        const extractedItems = fs.readdirSync(projectPath);
        if (extractedItems.length === 1) {
          const singleItem = path.join(projectPath, extractedItems[0]);
          const singleItemStat = fs.statSync(singleItem);
          
          if (singleItemStat.isDirectory()) {
            // Tek klasörün içeriğini ana dizine taşı
            const tempDir = path.join(path.dirname(projectPath), `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
            
            try {
              // Önce tek klasörü geçici bir yere taşı
              fs.moveSync(singleItem, tempDir);
              
              // Ana klasörü boşalt
              fs.emptyDirSync(projectPath);
              
              // Geçici klasörün içeriğini ana klasöre kopyala
              const tempContents = fs.readdirSync(tempDir);
              tempContents.forEach(item => {
                const src = path.join(tempDir, item);
                const dest = path.join(projectPath, item);
                fs.moveSync(src, dest);
              });
              
              // Geçici klasörü sil
              fs.removeSync(tempDir);
              
              console.log(`ZIP klasör yapısı düzeltildi: ${cleanProjectName}`);
            } catch (moveError) {
              console.error('Klasör yapısı düzeltme hatası:', moveError);
              // Geçici klasörü temizle
              if (fs.existsSync(tempDir)) {
                fs.removeSync(tempDir);
              }
              // Hata durumunda da devam et, proje yüklenebilir olabilir
            }
          }
        }
      } catch (structureError) {
        console.error('Klasör yapısı analiz hatası:', structureError);
        // Hata durumunda da devam et
      }

      // Proje türünü tespit et
      const projectInfo = await projectScanner.analyzeProject(projectPath, cleanProjectName);
      
      if (!projectInfo) {
        // Debug: Hangi dosyaların bulunduğunu logla
        const filesInProject = [];
        function walkDir(dir, depth = 0) {
          if (depth > 2) return; // Sadece 2 seviye derinliğe bak
          const items = fs.readdirSync(dir);
          items.forEach(item => {
            const fullPath = path.join(dir, item);
            const relativePath = path.relative(projectPath, fullPath);
            if (fs.statSync(fullPath).isDirectory()) {
              walkDir(fullPath, depth + 1);
            } else {
              filesInProject.push(relativePath);
            }
          });
        }
        walkDir(projectPath);
        
        console.log('Proje dosyaları:', filesInProject);
        fs.removeSync(projectPath);
        return res.status(400).json({ 
          error: 'Proje türü tespit edilemedi. Desteklenen dosyalar bulunamadı.',
          details: `Bulunan dosyalar: ${filesInProject.slice(0, 10).join(', ')}${filesInProject.length > 10 ? '...' : ''}`
        });
      }

      // Veritabanına kaydet
      db.run(
        'INSERT INTO projects (name, path, type, description, status) VALUES (?, ?, ?, ?, ?)',
        [cleanProjectName, projectPath, projectInfo.type, projectInfo.description, 'stopped'],
        async function(err) {
          if (err) {
            fs.removeSync(projectPath);
            return res.status(500).json({ error: 'Veritabanı hatası' });
          }

          const projectId = this.lastID;

          try {
            // Port rezervasyonu yap
            const defaultPort = projectInfo.config?.defaultPort || 3000;
            const portInfo = await portManager.reservePort(projectId, defaultPort);

            console.log(`Proje ${cleanProjectName} için port rezerve edildi:`, portInfo);

            res.json({
              message: 'Proje başarıyla yüklendi',
              project: {
                id: projectId,
                name: cleanProjectName,
                path: projectPath,
                type: projectInfo.type,
                description: projectInfo.description,
                status: 'stopped',
                port: portInfo.internal_port,
                external_port: portInfo.external_port
              }
            });
          } catch (portError) {
            console.error('Port rezervasyonu hatası:', portError);
            res.json({
              message: 'Proje yüklendi ancak port rezervasyonu başarısız',
              project: {
                id: projectId,
                name: cleanProjectName,
                path: projectPath,
                type: projectInfo.type,
                description: projectInfo.description,
                status: 'stopped'
              }
            });
          }
        }
      );
    } catch (extractError) {
      fs.removeSync(file.path);
      if (fs.existsSync(projectPath)) {
        fs.removeSync(projectPath);
      }
      console.error('ZIP extract hatası:', extractError);
      res.status(400).json({ error: 'ZIP dosyası açılamadı' });
    }
  } catch (error) {
    console.error('Proje yükleme hatası:', error);
    
    // Cleanup
    if (req.file) {
      fs.removeSync(req.file.path);
    }
    
    res.status(500).json({ error: 'Proje yükleme hatası' });
  }
});

// Proje template'i oluştur
async function createProjectTemplate(projectPath, type, name, description) {
  switch (type) {
    case 'nodejs':
      await createNodeJSTemplate(projectPath, name, description);
      break;
    case 'python-flask':
      await createFlaskTemplate(projectPath, name, description);
      break;
    case 'python-django':
      await createDjangoTemplate(projectPath, name, description);
      break;
    case 'react':
      await createReactTemplate(projectPath, name, description);
      break;
    case 'vue':
      await createVueTemplate(projectPath, name, description);
      break;
    case 'static':
      await createStaticTemplate(projectPath, name, description);
      break;
    case 'php':
      await createPHPTemplate(projectPath, name, description);
      break;
    default:
      throw new Error('Desteklenmeyen proje türü');
  }
}

async function createNodeJSTemplate(projectPath, name, description) {
  const packageJson = {
    name: name,
    version: '1.0.0',
    description: description || 'Node.js uygulaması',
    main: 'index.js',
    scripts: {
      start: 'node index.js',
      dev: 'nodemon index.js'
    },
    dependencies: {
      express: '^4.18.2'
    },
    devDependencies: {
      nodemon: '^3.0.2'
    }
  };

  const indexJs = `const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.send(\`
        <html>
            <head>
                <title>\${${JSON.stringify(name)}}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; }
                    .container { max-width: 800px; margin: 0 auto; }
                    .header { text-align: center; color: #333; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1 class="header">🚀 \${${JSON.stringify(name)}}</h1>
                    <p>Bu yeni Node.js projeniz başarıyla çalışıyor!</p>
                    <p><strong>Port:</strong> \${port}</p>
                    <p><strong>Zaman:</strong> \${new Date().toLocaleString('tr-TR')}</p>
                </div>
            </body>
        </html>
    \`);
});

app.listen(port, () => {
    console.log(\`Server \${port} portunda çalışıyor\`);
});`;

  fs.writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify(packageJson, null, 2));
  fs.writeFileSync(path.join(projectPath, 'index.js'), indexJs);
  fs.mkdirSync(path.join(projectPath, 'public'), { recursive: true });
}

async function createFlaskTemplate(projectPath, name, description) {
  const appPy = `from flask import Flask, render_template_string
import os
from datetime import datetime

app = Flask(__name__)

@app.route('/')
def hello():
    return render_template_string('''
    <html>
        <head>
            <title>{{ name }}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; }
                .container { max-width: 800px; margin: 0 auto; }
                .header { text-align: center; color: #333; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1 class="header">🐍 {{ name }}</h1>
                <p>Bu yeni Python Flask projeniz başarıyla çalışıyor!</p>
                <p><strong>Port:</strong> {{ port }}</p>
                <p><strong>Zaman:</strong> {{ time }}</p>
            </div>
        </body>
    </html>
    ''', name='${name}', port=os.environ.get('PORT', 5000), time=datetime.now().strftime('%Y-%m-%d %H:%M:%S'))

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)`;

  const requirements = `Flask==2.3.3
Werkzeug==2.3.7`;

  fs.writeFileSync(path.join(projectPath, 'app.py'), appPy);
  fs.writeFileSync(path.join(projectPath, 'requirements.txt'), requirements);
}

async function createDjangoTemplate(projectPath, name, description) {
  // Django template oluşturma - basit bir manage.py dosyası
  const managePy = `#!/usr/bin/env python
import os
import sys

if __name__ == '__main__':
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', '${name}.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)`;

  const requirements = `Django==4.2.7
asgiref==3.7.2
sqlparse==0.4.4`;

  fs.writeFileSync(path.join(projectPath, 'manage.py'), managePy);
  fs.writeFileSync(path.join(projectPath, 'requirements.txt'), requirements);
}

async function createReactTemplate(projectPath, name, description) {
  const packageJson = {
    name: name,
    version: '1.0.0',
    description: description || 'React uygulaması',
    dependencies: {
      react: '^18.2.0',
      'react-dom': '^18.2.0',
      'react-scripts': '^5.0.1'
    },
    scripts: {
      start: 'react-scripts start',
      build: 'react-scripts build',
      test: 'react-scripts test',
      eject: 'react-scripts eject'
    },
    browserslist: {
      production: ['>0.2%', 'not dead', 'not op_mini all'],
      development: ['last 1 chrome version', 'last 1 firefox version', 'last 1 safari version']
    }
  };

  fs.writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify(packageJson, null, 2));
  fs.mkdirSync(path.join(projectPath, 'src'), { recursive: true });
  fs.mkdirSync(path.join(projectPath, 'public'), { recursive: true });

  // Basit App.js
  const appJs = `import React from 'react';

function App() {
  return (
    <div style={{ padding: '40px', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h1 style={{ textAlign: 'center', color: '#333' }}>⚛️ ${name}</h1>
        <p>Bu yeni React projeniz başarıyla çalışıyor!</p>
        <p><strong>Zaman:</strong> {new Date().toLocaleString('tr-TR')}</p>
      </div>
    </div>
  );
}

export default App;`;

  fs.writeFileSync(path.join(projectPath, 'src', 'App.js'), appJs);
}

async function createVueTemplate(projectPath, name, description) {
  const packageJson = {
    name: name,
    version: '1.0.0',
    description: description || 'Vue.js uygulaması',
    scripts: {
      serve: 'vue-cli-service serve',
      build: 'vue-cli-service build'
    },
    dependencies: {
      'core-js': '^3.8.3',
      'vue': '^3.2.13'
    },
    devDependencies: {
      '@vue/cli-service': '^5.0.0'
    }
  };

  fs.writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify(packageJson, null, 2));
  fs.mkdirSync(path.join(projectPath, 'src'), { recursive: true });

  // Basit main.js
  const mainJs = `import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')`;

  fs.writeFileSync(path.join(projectPath, 'src', 'main.js'), mainJs);
}

async function createStaticTemplate(projectPath, name, description) {
  const indexHtml = `<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${name}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 40px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            color: #333;
            margin-bottom: 20px;
        }
        .info {
            background: #e9ecef;
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1 class="header">🌐 ${name}</h1>
        <p>${description || 'Bu yeni statik siteniz başarıyla çalışıyor!'}</p>
        <div class="info">
            <h3>Proje Bilgileri</h3>
            <p><strong>Tür:</strong> Statik HTML Site</p>
            <p><strong>Durum:</strong> Aktif</p>
            <p><strong>Zaman:</strong> <span id="time"></span></p>
        </div>
    </div>
    
    <script>
        function updateTime() {
            document.getElementById('time').textContent = new Date().toLocaleString('tr-TR');
        }
        updateTime();
        setInterval(updateTime, 1000);
    </script>
</body>
</html>`;

  fs.writeFileSync(path.join(projectPath, 'index.html'), indexHtml);
}

async function createPHPTemplate(projectPath, name, description) {
  const indexPhp = `<?php
$name = "${name}";
$description = "${description}";
$port = $_SERVER['SERVER_PORT'] ?? '8080';
$time = date('Y-m-d H:i:s');
?>
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= $name ?></title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 40px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            color: #333;
            margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1 class="header">🐘 <?= $name ?></h1>
        <p><?= $description ?: 'Bu yeni PHP projeniz başarıyla çalışıyor!' ?></p>
        <p><strong>Port:</strong> <?= $port ?></p>
        <p><strong>Zaman:</strong> <?= $time ?></p>
        <p><strong>PHP Versiyonu:</strong> <?= phpversion() ?></p>
    </div>
</body>
</html>`;

  fs.writeFileSync(path.join(projectPath, 'index.php'), indexPhp);
}

// Proje bilgilerini güncelle
router.put('/:id', async (req, res) => {
  try {
    const projectId = req.params.id;
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Proje adı gerekli' });
    }

    // Proje var mı kontrol et
    db.get('SELECT * FROM projects WHERE id = ?', [projectId], (err, project) => {
      if (err) {
        return res.status(500).json({ error: 'Veritabanı hatası' });
      }

      if (!project) {
        return res.status(404).json({ error: 'Proje bulunamadı' });
      }

      // Proje bilgilerini güncelle
      db.run(
        'UPDATE projects SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [name, description || '', projectId],
        (err) => {
          if (err) {
            return res.status(500).json({ error: 'Proje güncellenemedi' });
          }

          res.json({
            message: 'Proje başarıyla güncellendi',
            project: {
              id: projectId,
              name,
              description: description || ''
            }
          });
        }
      );
    });
  } catch (error) {
    console.error('Proje güncelleme hatası:', error);
    res.status(500).json({ error: 'Proje güncelleme hatası' });
  }
});

// Port güncelleme
router.put('/:id/port', async (req, res) => {
  try {
    const projectId = req.params.id;
    const { port } = req.body;

    if (!port || isNaN(port) || port < 1024 || port > 65535) {
      return res.status(400).json({ error: 'Geçersiz port numarası. Port 1024-65535 arasında olmalıdır.' });
    }

    // Projenin durumunu kontrol et
    db.get('SELECT * FROM projects WHERE id = ?', [projectId], async (err, project) => {
      if (err) {
        return res.status(500).json({ error: 'Veritabanı hatası' });
      }

      if (!project) {
        return res.status(404).json({ error: 'Proje bulunamadı' });
      }

      if (project.status === 'running') {
        return res.status(400).json({ error: 'Çalışan bir projenin portu değiştirilemez. Önce projeyi durdurun.' });
      }

      // Port'un başka proje tarafından kullanılıp kullanılmadığını kontrol et
      const isPortUsed = await portManager.isPortInUse(port);
      if (isPortUsed) {
        return res.status(400).json({ error: `Port ${port} zaten kullanımda. Başka bir port seçin.` });
      }

      // Eski port rezervasyonunu temizle
      await portManager.releasePort(projectId);

      // Yeni port rezervasyonu yap
      try {
        const portInfo = await portManager.reservePort(projectId, port, port);
        
        res.json({
          message: 'Port başarıyla güncellendi',
          port: portInfo.internal_port,
          external_port: portInfo.external_port
        });
      } catch (portError) {
        console.error('Port rezervasyonu hatası:', portError);
        res.status(500).json({ error: 'Port rezervasyonu başarısız' });
      }
    });
  } catch (error) {
    console.error('Port güncelleme hatası:', error);
    res.status(500).json({ error: 'Port güncelleme hatası' });
  }
});

module.exports = router; 