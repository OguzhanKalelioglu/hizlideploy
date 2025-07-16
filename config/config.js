require('dotenv').config();

module.exports = {
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || 'localhost',
    env: process.env.NODE_ENV || 'development'
  },
  database: {
    path: process.env.DB_PATH || './database/coolify.db'
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
    expiresIn: '24h'
  },
  paths: {
    projects: process.env.PROJECTS_PATH || './projects',
    logs: process.env.LOGS_PATH || './logs',
    nginx: process.env.NGINX_CONFIG_PATH || './nginx'
  },
  defaults: {
    admin: {
      username: process.env.DEFAULT_ADMIN_USERNAME || 'admin',
      password: process.env.DEFAULT_ADMIN_PASSWORD || 'admin123'
    }
  },
  deployment: {
    basePort: parseInt(process.env.BASE_PROJECT_PORT) || 4000,
    maxPort: parseInt(process.env.MAX_PROJECT_PORT) || 5000,
    nginxPort: 80
  }
}; 