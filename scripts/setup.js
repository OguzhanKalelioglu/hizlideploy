const fs = require('fs');
const path = require('path');

console.log('🚀 HızlıDeploy kurulumu başlıyor...');

// Gerekli dizinleri oluştur
const requiredDirs = [
    'backend',
    'frontend',
    'database',
    'config',
    'logs',
    'projects',
    'nginx',
    'frontend/css',
    'frontend/js'
];

console.log('📁 Gerekli dizinler oluşturuluyor...');

requiredDirs.forEach(dir => {
    const fullPath = path.join(__dirname, '..', dir);
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        console.log(`   ✅ ${dir} dizini oluşturuldu`);
    } else {
        console.log(`   ℹ️  ${dir} dizini zaten mevcut`);
    }
});

// Logs dizinini temizle
console.log('🧹 Log dizini temizleniyor...');
const logsDir = path.join(__dirname, '..', 'logs');
if (fs.existsSync(logsDir)) {
    const files = fs.readdirSync(logsDir);
    files.forEach(file => {
        if (file.endsWith('.log')) {
            fs.unlinkSync(path.join(logsDir, file));
        }
    });
}

// Veritabanı dosyasını temizle
console.log('🗃️  Veritabanı temizleniyor...');
const dbPath = path.join(__dirname, '..', 'database', 'coolify.db');
if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log('   ✅ Eski veritabanı silindi');
}

// Örnek projeler oluştur
console.log('📝 Örnek projeler oluşturuluyor...');

// Node.js örnek projesi
const nodeProjectPath = path.join(__dirname, '..', 'projects', 'example-node-app');
if (!fs.existsSync(nodeProjectPath)) {
    fs.mkdirSync(nodeProjectPath, { recursive: true });
    
    // package.json
    const packageJson = {
        name: 'example-node-app',
        version: '1.0.0',
        description: 'Örnek Node.js uygulaması',
        main: 'index.js',
        scripts: {
            start: 'node index.js'
        },
        dependencies: {
            express: '^4.18.2'
        }
    };
    
    fs.writeFileSync(
        path.join(nodeProjectPath, 'package.json'),
        JSON.stringify(packageJson, null, 2)
    );
    
    // index.js
    const indexJs = `const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send(\`
        <html>
            <head><title>Örnek Node.js Uygulaması</title></head>
            <body>
                <h1>🚀 Merhaba Dünya!</h1>
                <p>Bu örnek Node.js uygulaması çalışıyor.</p>
                <p>Port: \${port}</p>
                <p>Zaman: \${new Date().toLocaleString('tr-TR')}</p>
            </body>
        </html>
    \`);
});

app.listen(port, () => {
    console.log(\`Server \${port} portunda çalışıyor\`);
});`;
    
    fs.writeFileSync(path.join(nodeProjectPath, 'index.js'), indexJs);
    console.log('   ✅ Örnek Node.js projesi oluşturuldu');
}

// Python Flask örnek projesi
const pythonProjectPath = path.join(__dirname, '..', 'projects', 'example-python-app');
if (!fs.existsSync(pythonProjectPath)) {
    fs.mkdirSync(pythonProjectPath, { recursive: true });
    
    // app.py
    const appPy = `from flask import Flask
import os
from datetime import datetime

app = Flask(__name__)

@app.route('/')
def hello():
    return f'''
    <html>
        <head><title>Örnek Python Flask Uygulaması</title></head>
        <body>
            <h1>🐍 Merhaba Python!</h1>
            <p>Bu örnek Python Flask uygulaması çalışıyor.</p>
            <p>Port: {os.environ.get('PORT', 5000)}</p>
            <p>Zaman: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
        </body>
    </html>
    '''

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)`;
    
    fs.writeFileSync(path.join(pythonProjectPath, 'app.py'), appPy);
    
    // requirements.txt
    const requirements = `Flask==2.3.3
Werkzeug==2.3.7`;
    
    fs.writeFileSync(path.join(pythonProjectPath, 'requirements.txt'), requirements);
    console.log('   ✅ Örnek Python Flask projesi oluşturuldu');
}

// Statik HTML örnek projesi
const staticProjectPath = path.join(__dirname, '..', 'projects', 'example-static-site');
if (!fs.existsSync(staticProjectPath)) {
    fs.mkdirSync(staticProjectPath, { recursive: true });
    
    // index.html
    const indexHtml = `<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Örnek Statik Site</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            text-align: center;
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
        <h1>🌐 Örnek Statik Site</h1>
        <p>Bu örnek statik HTML sitesi çalışıyor.</p>
        <div class="info">
            <h3>Proje Bilgileri</h3>
            <p><strong>Tür:</strong> Statik HTML</p>
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
    
    fs.writeFileSync(path.join(staticProjectPath, 'index.html'), indexHtml);
    console.log('   ✅ Örnek statik site oluşturuldu');
}

// Nginx yapılandırma dosyası oluştur
console.log('🔧 Nginx yapılandırması oluşturuluyor...');
const nginxConfig = `# HızlıDeploy Nginx Configuration
server {
    listen 80;
    server_name localhost;
    
    # Ana uygulama
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

# Proje proxy'leri dinamik olarak buraya eklenecek
include /path/to/hizli-deploy/nginx/conf.d/*.conf;`;

const nginxPath = path.join(__dirname, '..', 'nginx', 'nginx.conf');
fs.writeFileSync(nginxPath, nginxConfig);
console.log('   ✅ Nginx yapılandırması oluşturuldu');

// .env dosyası oluştur
console.log('⚙️  Environment dosyası oluşturuluyor...');
const envContent = `NODE_ENV=development
PORT=3000
DB_PATH=./database/coolify.db
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
PROJECTS_PATH=./projects
LOGS_PATH=./logs
NGINX_CONFIG_PATH=./nginx
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_PASSWORD=admin123
BASE_PROJECT_PORT=4000
MAX_PROJECT_PORT=5000`;

const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, envContent);
    console.log('   ✅ .env dosyası oluşturuldu');
}

console.log('\n🎉 Kurulum tamamlandı!');
console.log('\n📋 Sonraki adımlar:');
console.log('   1. npm install - bağımlılıkları yükle');
console.log('   2. npm start - sunucuyu başlat');
console.log('   3. http://localhost:3000 - web arayüzüne git');
console.log('   4. admin / admin123 ile giriş yap');
console.log('\n💡 İpuçları:');
console.log('   • Projelerinizi /projects klasörüne koyun');
console.log('   • Web arayüzünden "Projeleri Tara" butonuna tıklayın');
console.log('   • Projeleri deploy etmek için "Deploy" butonunu kullanın');
console.log('\n🔗 Yararlı linkler:');
console.log('   • API Docs: http://localhost:3000/api');
console.log('   • Loglar: http://localhost:3000/logs');
console.log('   • Projeler: http://localhost:3000/projects');

console.log('\n✨ HızlıDeploy hazır!'); 