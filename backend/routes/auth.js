const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/init');
const config = require('../../config/config');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Giriş yap
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli' });
  }

  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Veritabanı hatası' });
    }

    if (!user) {
      return res.status(401).json({ error: 'Kullanıcı bulunamadı' });
    }

    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Geçersiz şifre' });
    }

    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        role: user.role 
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  });
});

// Kullanıcı kayıt (sadece admin)
router.post('/register', authenticateToken, (req, res) => {
  const { username, password, email, role = 'user' } = req.body;

  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Sadece admin kullanıcı ekleyebilir' });
  }

  if (!username || !password) {
    return res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);

  db.run(
    'INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, ?)',
    [username, hashedPassword, email, role],
    function(err) {
      if (err) {
        if (err.code === 'SQLITE_CONSTRAINT') {
          return res.status(400).json({ error: 'Bu kullanıcı adı zaten kullanımda' });
        }
        return res.status(500).json({ error: 'Veritabanı hatası' });
      }

      res.json({ 
        message: 'Kullanıcı başarıyla oluşturuldu',
        userId: this.lastID
      });
    }
  );
});

// Profil bilgilerini al
router.get('/profile', authenticateToken, (req, res) => {
  db.get('SELECT id, username, email, role, created_at FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Veritabanı hatası' });
    }

    if (!user) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }

    res.json(user);
  });
});

// Token'ı doğrula
router.post('/verify', authenticateToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

module.exports = router; 