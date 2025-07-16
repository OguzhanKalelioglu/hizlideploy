const fs = require('fs');
const path = require('path');
const config = require('../../config/config');

class ProjectScanner {
  constructor() {
    this.projectsPath = path.resolve(config.paths.projects);
    this.supportedTypes = {
      'nodejs': {
        files: ['package.json'],
        startCommand: 'npm start',
        buildCommand: 'npm install',
        defaultPort: 3000
      },
      'python-flask': {
        files: ['requirements.txt'],
        startCommand: 'python app.py',
        buildCommand: 'pip install -r requirements.txt',
        defaultPort: 5000
      },
      'python-django': {
        files: ['manage.py', 'requirements.txt'],
        startCommand: 'python manage.py runserver',
        buildCommand: 'pip install -r requirements.txt',
        defaultPort: 8000
      },
      'php': {
        files: ['index.php'],
        startCommand: 'php -S 0.0.0.0:8080',
        buildCommand: null,
        defaultPort: 8080
      },
      'static': {
        files: ['index.html'],
        startCommand: 'npx serve -l 8080',
        buildCommand: null,
        defaultPort: 8080
      },
      'react': {
        files: ['package.json'],
        startCommand: 'npm start',
        buildCommand: 'npm install && npm run build',
        defaultPort: 3000
      },
      'vue': {
        files: ['package.json'],
        startCommand: 'npm run serve',
        buildCommand: 'npm install && npm run build',
        defaultPort: 8080
      }
    };
  }

  // Projeler dizinini tarar
  async scanProjects() {
    try {
      if (!fs.existsSync(this.projectsPath)) {
        fs.mkdirSync(this.projectsPath, { recursive: true });
        return [];
      }

      const projects = [];
      const items = fs.readdirSync(this.projectsPath);

      for (const item of items) {
        const itemPath = path.join(this.projectsPath, item);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory()) {
          const projectInfo = await this.analyzeProject(itemPath, item);
          if (projectInfo) {
            projects.push(projectInfo);
          }
        }
      }

      return projects;
    } catch (error) {
      console.error('Proje tarama hatası:', error);
      return [];
    }
  }

  // Tek bir projeyi analiz eder
  async analyzeProject(projectPath, projectName) {
    try {
      const projectType = this.detectProjectType(projectPath);
      if (!projectType) {
        return null;
      }

      const packageJson = this.readPackageJson(projectPath);
      const description = packageJson?.description || '';
      const version = packageJson?.version || '1.0.0';

      return {
        name: projectName,
        path: projectPath,
        type: projectType,
        description,
        version,
        config: this.supportedTypes[projectType],
        lastModified: fs.statSync(projectPath).mtime
      };
    } catch (error) {
      console.error(`Proje analiz hatası (${projectName}):`, error);
      return null;
    }
  }

  // Proje türünü tespit eder
  detectProjectType(projectPath) {
    // Önce package.json varsa, içeriğine bakarak tespit et
    const packageJson = this.readPackageJson(projectPath);
    if (packageJson) {
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      if (dependencies.react) {
        return 'react';
      }
      if (dependencies.vue) {
        return 'vue';
      }
      if (dependencies.express || dependencies.fastify || dependencies.koa) {
        return 'nodejs';
      }
    }

    // Sonra dosya varlığına bakarak tespit et
    for (const [type, config] of Object.entries(this.supportedTypes)) {
      if (this.hasRequiredFiles(projectPath, config.files)) {
        // Özel kontroller
        if (type === 'python-django' && !this.isDjangoProject(projectPath)) {
          continue;
        }
        return type;
      }
    }

    // Eğer hiçbiri bulunamazsa, gevşek kontrol yap
    const files = this.getAllFiles(projectPath);
    
    // Python dosyaları varsa flask olarak kabul et
    if (files.some(f => f.endsWith('.py'))) {
      return 'python-flask';
    }
    
    // PHP dosyaları varsa
    if (files.some(f => f.endsWith('.php'))) {
      return 'php';
    }
    
    // HTML dosyaları varsa static olarak kabul et
    if (files.some(f => f.endsWith('.html'))) {
      return 'static';
    }
    
    // JavaScript dosyaları varsa nodejs olarak kabul et
    if (files.some(f => f.endsWith('.js') && !f.includes('node_modules'))) {
      return 'nodejs';
    }

    return null;
  }

  // Gerekli dosyaların varlığını kontrol eder
  hasRequiredFiles(projectPath, requiredFiles) {
    return requiredFiles.every(file => {
      const fullPath = path.join(projectPath, file);
      return fs.existsSync(fullPath);
    });
  }

  // Proje içindeki tüm dosyaları döndürür (2 seviye derinliğe kadar)
  getAllFiles(projectPath) {
    const files = [];
    
    function walkDir(dir, depth = 0) {
      if (depth > 2) return; // Çok derin gitme
      
      try {
        const items = fs.readdirSync(dir);
        items.forEach(item => {
          // node_modules, .git gibi klasörleri atla
          if (['node_modules', '.git', '.svn', '.hg', 'vendor'].includes(item)) {
            return;
          }
          
          const fullPath = path.join(dir, item);
          const relativePath = path.relative(projectPath, fullPath);
          
          if (fs.statSync(fullPath).isDirectory()) {
            walkDir(fullPath, depth + 1);
          } else {
            files.push(relativePath);
          }
        });
      } catch (error) {
        // Klasör okunamazsa geç
      }
    }
    
    walkDir(projectPath);
    return files;
  }

  // package.json dosyasını okur
  readPackageJson(projectPath) {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const content = fs.readFileSync(packageJsonPath, 'utf8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('package.json okuma hatası:', error);
    }
    return null;
  }

  // React projesi kontrolü
  isReactProject(projectPath) {
    const packageJson = this.readPackageJson(projectPath);
    return packageJson?.dependencies?.react || packageJson?.devDependencies?.react;
  }

  // Vue projesi kontrolü
  isVueProject(projectPath) {
    const packageJson = this.readPackageJson(projectPath);
    return packageJson?.dependencies?.vue || packageJson?.devDependencies?.vue;
  }

  // Django projesi kontrolü
  isDjangoProject(projectPath) {
    const requirementsPath = path.join(projectPath, 'requirements.txt');
    if (fs.existsSync(requirementsPath)) {
      const content = fs.readFileSync(requirementsPath, 'utf8');
      return content.includes('Django');
    }
    return false;
  }

  // Proje dosyalarının değişikliklerini izler
  watchProjects(callback) {
    const chokidar = require('chokidar');
    const watcher = chokidar.watch(this.projectsPath, {
      ignored: /node_modules|\.git/,
      persistent: true,
      ignoreInitial: true
    });

    watcher.on('addDir', (path) => {
      setTimeout(() => callback('added', path), 1000);
    });

    watcher.on('unlinkDir', (path) => {
      callback('removed', path);
    });

    return watcher;
  }

  // Desteklenen proje türlerini döndürür
  getSupportedTypes() {
    return Object.keys(this.supportedTypes);
  }

  // Proje türü bilgilerini döndürür
  getProjectTypeInfo(type) {
    return this.supportedTypes[type] || null;
  }
}

module.exports = new ProjectScanner(); 