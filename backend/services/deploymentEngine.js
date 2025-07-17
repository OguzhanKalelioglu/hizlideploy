const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const db = require('../database/init');
const portManager = require('./portManager');
const projectScanner = require('./projectScanner');
const config = require('../../config/config');

class DeploymentEngine {
  constructor() {
    this.runningProcesses = new Map();
    this.deploymentQueue = [];
    this.isProcessingQueue = false;
    
    // Platform detection
    this.platform = this.detectPlatform();
    console.log(`Platform tespit edildi: ${this.platform.name}`);
    
    // Sistem başlatılırken çalışan projeleri kontrol et
    this.restoreRunningProjects();
  }

  // Platform detection ve konfigürasyon
  detectPlatform() {
    const platform = process.platform;
    const os = require('os');
    
    if (platform === 'win32') {
      return {
        name: 'Windows',
        shell: 'cmd',
        shellArgs: ['/c'],
        python: 'python',
        killCommand: (pid) => `taskkill /pid ${pid} /t /f`,
        buildShell: 'cmd'
      };
    } else if (platform === 'darwin') {
      return {
        name: 'macOS',
        shell: 'sh',
        shellArgs: ['-c'],
        python: 'python3',
        killCommand: (pid) => `pkill -P ${pid} && kill -TERM ${pid}`,
        buildShell: 'bash'
      };
    } else if (platform === 'linux') {
      // Linux dağıtımını kontrol et
      const release = os.release().toLowerCase();
      const isUbuntu = fs.existsSync('/etc/lsb-release') || 
                      fs.existsSync('/etc/ubuntu-release') ||
                      release.includes('ubuntu');
      
      return {
        name: isUbuntu ? 'Ubuntu Linux' : 'Linux',
        shell: 'bash',
        shellArgs: ['-c'],
        python: 'python3',
        killCommand: (pid) => `pkill -P ${pid}; kill -TERM ${pid}`,
        buildShell: 'bash'
      };
    } else {
      // Unix-like sistemler için fallback
      return {
        name: 'Unix-like',
        shell: 'sh',
        shellArgs: ['-c'],
        python: 'python3',
        killCommand: (pid) => `kill -TERM ${pid}`,
        buildShell: 'sh'
      };
    }
  }

  // Sistem başlatılırken çalışan projeleri geri yükle
  async restoreRunningProjects() {
    try {
      const result = await this.queryDatabase('SELECT * FROM projects WHERE status = "running"');
      
      for (const project of result) {
        console.log(`Proje geri yükleniyor: ${project.name}`);
        await this.startProject(project.id, false); // false = yeni deployment yaratma
      }
    } catch (error) {
      console.error('Çalışan projeler geri yüklenemedi:', error);
    }
  }

  // Projeyi deploy et
  async deployProject(projectId, options = {}) {
    try {
      const project = await this.getProjectById(projectId);
      if (!project) {
        throw new Error('Proje bulunamadı');
      }

      // Deployment kaydı oluştur
      const deploymentId = await this.createDeployment(projectId);
      
      // Deployment queue'ya ekle
      this.deploymentQueue.push({
        projectId,
        deploymentId,
        options,
        timestamp: Date.now()
      });

      // Queue'yu işle
      this.processDeploymentQueue();

      return deploymentId;
    } catch (error) {
      console.error('Deployment hatası:', error);
      throw error;
    }
  }

  // Deployment queue'yu işle
  async processDeploymentQueue() {
    if (this.isProcessingQueue) return;
    
    this.isProcessingQueue = true;

    while (this.deploymentQueue.length > 0) {
      const deployment = this.deploymentQueue.shift();
      
      try {
        await this.executeDeployment(deployment);
      } catch (error) {
        console.error(`Deployment hatası (${deployment.projectId}):`, error);
        await this.updateDeploymentStatus(deployment.deploymentId, 'failed', error.message);
      }
    }

    this.isProcessingQueue = false;
  }

  // Deployment'ı çalıştır
  async executeDeployment(deployment) {
    const { projectId, deploymentId } = deployment;
    
    try {
      // Deployment durumunu güncelle
      await this.updateDeploymentStatus(deploymentId, 'building');

      const project = await this.getProjectById(projectId);
      const projectConfig = projectScanner.getProjectTypeInfo(project.type);

      // Build komutu varsa platform'a göre ayarla ve çalıştır
      if (projectConfig.buildCommand) {
        let buildCommand = projectConfig.buildCommand;
        
        // Python projeleri için platform'a göre pip komutunu ayarla
        if (project.type === 'python-flask' || project.type === 'python-django') {
          if (this.platform.name === 'Windows') {
            buildCommand = `chcp 65001 && ${buildCommand}`;
          } else {
            buildCommand = buildCommand.replace('pip install', 'pip3 install');
          }
        }
        
        await this.runBuildCommand(project, buildCommand, deploymentId);
      }

      // Port rezerve et
      const port = await portManager.reservePort(projectId, projectConfig.defaultPort);

      // Projeyi başlat
      await this.startProject(projectId, true);

      // Deployment'ı tamamla
      await this.updateDeploymentStatus(deploymentId, 'success');
      this.broadcastLog(projectId, 'system', `✅ Deployment #${deploymentId} başarıyla tamamlandı.`);
      
      // Proje URL'sini bildirin
      this.broadcastLog(projectId, 'system', `🚀 Proje erişilebilir: http://localhost:${port.external_port}`);

      console.log(`Deployment tamamlandı: ${project.name} (Port: ${port.external_port})`);
    } catch (error) {
      await this.updateDeploymentStatus(deploymentId, 'failed', error.message);
      this.broadcastLog(projectId, 'system', `❌ Deployment #${deploymentId} başarısız oldu: ${error.message}`);
      throw error;
    }
  }

  // Build komutunu çalıştır
  async runBuildCommand(project, buildCommand, deploymentId) {
    return new Promise((resolve, reject) => {
      const logFile = path.join(config.paths.logs, `${project.name}_build.log`);
      const logStream = fs.createWriteStream(logFile, { flags: 'a' });

      const shell = this.platform.buildShell;
      const shellArgs = [...this.platform.shellArgs, buildCommand];
      
      const buildProcess = spawn(shell, shellArgs, {
        cwd: project.path,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8'
        }
      });

      buildProcess.stdout.on('data', (data) => {
        logStream.write(data);
        this.broadcastLog(project.id, 'build', data.toString('utf8'));
      });

      buildProcess.stderr.on('data', (data) => {
        logStream.write(data);
        this.broadcastLog(project.id, 'build-error', data.toString('utf8'));
      });

      buildProcess.on('close', (code) => {
        logStream.end();
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Build başarısız (Exit code: ${code})`));
        }
      });

      buildProcess.on('error', (error) => {
        logStream.end();
        reject(error);
      });
    });
  }

  // Projeyi başlat
  async startProject(projectId, createDeployment = true) {
    try {
      const project = await this.getProjectById(projectId);
      if (!project) {
        throw new Error('Proje bulunamadı');
      }

      // Zaten çalışıyorsa durdur
      if (this.runningProcesses.has(projectId)) {
        await this.stopProject(projectId);
      }

      const projectConfig = projectScanner.getProjectTypeInfo(project.type);
      let ports = await portManager.getProjectPorts(projectId);

      if (!ports.external_port) {
        console.log(`Proje ${projectId} için port rezerve edilmemiş, otomatik atama yapılıyor...`);
        try {
          const defaultPort = projectConfig?.defaultPort || 3000;
          const portInfo = await portManager.reservePort(projectId, defaultPort);
          ports = {
            port: portInfo.internal_port,
            external_port: portInfo.external_port
          };
          console.log(`Proje ${projectId} için port otomatik atandı:`, ports);
        } catch (portError) {
          console.error(`Proje ${projectId} için port ataması başarısız:`, portError);
          throw new Error('Port rezervasyonu başarısız');
        }
      }

      // Start komutunu hazırla
      let startCommand = projectConfig.startCommand;
      
      // Port'u komuta ekle (Platform'a göre)
      if (project.type === 'nodejs' || project.type === 'react' || project.type === 'vue') {
        if (this.platform.name === 'Windows') {
          startCommand = `set PORT=${ports.port} && ${startCommand}`;
        } else {
          startCommand = `PORT=${ports.port} ${startCommand}`;
        }
      } else if (project.type === 'python-flask') {
        if (this.platform.name === 'Windows') {
          startCommand = `chcp 65001 && ${this.platform.python} -m flask run --host=127.0.0.1 --port=${ports.port}`;
        } else {
          startCommand = `${this.platform.python} -m flask run --host=127.0.0.1 --port=${ports.port}`;
        }
      } else if (project.type === 'python-django') {
        startCommand = `${this.platform.python} manage.py runserver 0.0.0.0:${ports.port}`;
      } else if (project.type === 'static') {
        // Static site için npx serve kullan
        if (this.platform.name === 'Windows') {
          startCommand = `npx --yes serve -l ${ports.port}`;
        } else {
          startCommand = `npx serve -l ${ports.port}`;
        }
      }

      // Projeyi başlat
      const shell = this.platform.shell;
      const shellArgs = [...this.platform.shellArgs, startCommand];
      
      console.log(`🚀 Flask start command: ${shell} ${shellArgs.join(' ')}`);
      console.log(`📍 Working directory: ${project.path}`);
      console.log(`🌐 Port: ${ports.port}`);
      console.log(`🔧 Environment PORT: ${process.env.PORT}`);
      console.log(`🔧 Environment FLASK_RUN_HOST: ${process.env.FLASK_RUN_HOST}`);
      
      const childProcess = spawn(shell, shellArgs, {
        cwd: project.path,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
        windowsVerbatimArguments: true,
        env: {
          ...process.env,
          PORT: String(ports.port),
          FLASK_RUN_PORT: String(ports.port),
          FLASK_RUN_HOST: '127.0.0.1',
          FLASK_APP: 'app.py',
          NODE_ENV: 'production',
          FLASK_ENV: 'development',
          PYTHONIOENCODING: 'utf-8',
          PYTHONUNBUFFERED: '1'
        }
      });

      // Process'i kaydet
      this.runningProcesses.set(projectId, {
        process: childProcess,
        startTime: Date.now(),
        ports
      });

      // Log dosyası oluştur
      const logFile = path.join(config.paths.logs, `${project.name}_runtime.log`);
      const logStream = fs.createWriteStream(logFile, { flags: 'a' });

      // Process output'larını dinle
      childProcess.stdout.on('data', (data) => {
        logStream.write(data);
        this.broadcastLog(projectId, 'stdout', data.toString('utf8'));
      });

      childProcess.stderr.on('data', (data) => {
        logStream.write(data);
        this.broadcastLog(projectId, 'stderr', data.toString('utf8'));
      });

      childProcess.on('close', async (code) => {
        logStream.end();
        this.runningProcesses.delete(projectId);
        
        // Portları serbest bırak
        try {
          const portManager = require('./portManager');
          await portManager.releasePort(projectId);
        } catch (err) {
          console.error('Port temizleme hatası:', err);
        }
        
        this.updateProjectStatus(projectId, 'stopped');
        this.broadcastLog(projectId, 'system', `Proje durdu (Exit code: ${code})`);
      });

      childProcess.on('error', async (error) => {
        logStream.end();
        this.runningProcesses.delete(projectId);
        
        // Portları serbest bırak
        try {
          const portManager = require('./portManager');
          await portManager.releasePort(projectId);
        } catch (err) {
          console.error('Port temizleme hatası:', err);
        }
        
        this.updateProjectStatus(projectId, 'error');
        this.broadcastLog(projectId, 'error', `Proje hatası: ${error.message}`);
      });

      // Proje durumunu güncelle
      await this.updateProjectStatus(projectId, 'running');

      console.log(`Proje başlatıldı: ${project.name} (PID: ${childProcess.pid})`);
      this.broadcastLog(projectId, 'system', `Proje başlatıldı: ${project.name} (Port: ${ports.port})`);
      
      return childProcess.pid;
    } catch (error) {
      console.error('Proje başlatma hatası:', error);
      throw error;
    }
  }

  // Projeyi durdur
  async stopProject(projectId) {
    try {
      const runningProcess = this.runningProcesses.get(projectId);
      
      // Eğer process Map'te yoksa ama DB'de running ise sadece status güncelle
      if (!runningProcess) {
        const project = await this.getProjectById(projectId);
        if (project && project.status === 'running') {
          console.log(`Proje ${projectId} process Map'te yok ama DB'de running. Status düzeltiliyor...`);
          await this.updateProjectStatus(projectId, 'stopped');
          
          // Portları da temizle
          try {
            const portManager = require('./portManager');
            await portManager.releasePort(projectId);
          } catch (err) {
            console.error('Port temizleme hatası:', err);
          }
          
          return;
        }
        throw new Error('Proje çalışmıyor');
      }

      const { process } = runningProcess;
      
      try {
        // Platform'a göre process durdurma
        if (this.platform.name === 'Windows') {
          // Windows'da taskkill ile process tree'yi öldür
          const { exec } = require('child_process');
          exec(this.platform.killCommand(process.pid), (error) => {
            if (error) {
              console.error(`${this.platform.name} process durdurma hatası:`, error);
              // Fallback olarak normal kill dene
              try {
                process.kill();
              } catch (e) {
                console.error('Process kill hatası:', e);
              }
            }
          });
        } else if (this.platform.name.includes('Ubuntu') || this.platform.name.includes('Linux')) {
          // Ubuntu/Linux'da pkill ile child process'leri de öldür
          const { exec } = require('child_process');
          exec(this.platform.killCommand(process.pid), (error) => {
            if (error) {
              console.error(`${this.platform.name} pkill hatası:`, error);
            }
          });
          
          // Ana process'e de sinyal gönder
          process.kill('SIGTERM');
          
          // 3 saniye bekle, hala çalışıyorsa SIGKILL gönder
          setTimeout(() => {
            try {
              if (!process.killed) {
                process.kill('SIGKILL');
              }
            } catch (e) {
              // Process zaten ölmüş olabilir
            }
          }, 3000);
        } else {
          // macOS ve diğer Unix-like sistemler
          const { exec } = require('child_process');
          exec(this.platform.killCommand(process.pid), (error) => {
            if (error) {
              console.error(`${this.platform.name} process durdurma hatası:`, error);
            }
          });
          
          process.kill('SIGTERM');
          
          setTimeout(() => {
            try {
              if (!process.killed) {
                process.kill('SIGKILL');
              }
            } catch (e) {
              // Process zaten ölmüş olabilir
            }
          }, 5000);
        }
      } catch (error) {
        console.error(`${this.platform.name} process durdurma genel hatası:`, error);
        // Son çare olarak normal kill
        try {
          process.kill();
        } catch (e) {
          console.error('Fallback kill hatası:', e);
        }
      }

      // Portları serbest bırak
      const portManager = require('./portManager');
      await portManager.releasePort(projectId);

      // Process'i map'ten kaldır
      this.runningProcesses.delete(projectId);

      // Proje durumunu güncelle
      await this.updateProjectStatus(projectId, 'stopped');

      console.log(`Proje durduruldu: ${projectId}`);
    } catch (error) {
      console.error('Proje durdurma hatası:', error);
      throw error;
    }
  }

  // Projeyi restart et
  async restartProject(projectId) {
    try {
      await this.stopProject(projectId);
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 saniye bekle
      await this.startProject(projectId, false);
    } catch (error) {
      console.error('Proje restart hatası:', error);
      throw error;
    }
  }

  // Çalışan projeler listesi
  getRunningProjects() {
    const running = [];
    for (const [projectId, processInfo] of this.runningProcesses) {
      running.push({
        projectId,
        pid: processInfo.process.pid,
        startTime: processInfo.startTime,
        ports: processInfo.ports
      });
    }
    return running;
  }

  // Log'u WebSocket ile broadcast et
  broadcastLog(projectId, type, message) {
    console.log(`📡 Broadcasting log: [${type}] ${message} (Project: ${projectId})`);
    
    if (global.wss) {
      let clientCount = 0;
      let subscribedClients = 0;
      
      global.wss.clients.forEach(client => {
        clientCount++;
        if (client.readyState === 1 && client.projectId == projectId) {
          subscribedClients++;
          const logData = {
            type: 'log',
            projectId,
            logType: type,
            message,
            timestamp: Date.now()
          };
          client.send(JSON.stringify(logData));
          console.log(`✅ Log gönderildi client'a:`, logData);
        }
      });
      
      console.log(`📊 WebSocket stats: ${clientCount} client, ${subscribedClients} subscribed to project ${projectId}`);
    } else {
      console.log('❌ Global WebSocket server bulunamadı');
    }

    // Veritabanına da kaydet
    this.saveLog(projectId, type, message);
  }

  // Helper metodlar
  async queryDatabase(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async getProjectById(projectId) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM projects WHERE id = ?', [projectId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async createDeployment(projectId) {
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO deployments (project_id, status) VALUES (?, ?)',
        [projectId, 'pending'],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async updateDeploymentStatus(deploymentId, status, errorMessage = null) {
    const sql = errorMessage 
      ? 'UPDATE deployments SET status = ?, error_message = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?'
      : 'UPDATE deployments SET status = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?';
    
    const params = errorMessage 
      ? [status, errorMessage, deploymentId]
      : [status, deploymentId];

    return new Promise((resolve, reject) => {
      db.run(sql, params, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async updateProjectStatus(projectId, status) {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE projects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [status, projectId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async saveLog(projectId, type, message) {
    db.run(
      'INSERT INTO logs (project_id, type, message) VALUES (?, ?, ?)',
      [projectId, type, message],
      (err) => {
        if (err) {
          console.error('Log kaydetme hatası:', err);
        }
      }
    );
  }
}

module.exports = new DeploymentEngine(); 