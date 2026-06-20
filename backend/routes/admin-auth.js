// routes/admin-auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const { JWT_SECRET, requireAdminAuth } = require('../middleware/auth');

// POST /api/admin/login - login del panel administrador.
// El token incluye el local_id del admin: a partir de aca, todas sus
// acciones quedan automaticamente limitadas a SU local, sin que el
// frontend tenga que mandar el local_id (evita que alguien lo manipule).
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
  }
  try {
    const result = await pool.query(
      `SELECT a.*, l.slug AS local_slug, l.nombre AS local_nombre
       FROM admin_users a
       JOIN locales l ON l.id = a.local_id
       WHERE a.username = $1`,
      [username]
    );
    if (result.rows.length === 0) {
      // Mensaje generico a proposito: no revelamos si el usuario existe o no.
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    const admin = result.rows[0];
    const validPassword = await bcrypt.compare(password, admin.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    const token = jwt.sign(
      {
        sub: admin.id,
        username: admin.username,
        role: 'admin',
        local_id: admin.local_id,
        local_slug: admin.local_slug,
      },
      JWT_SECRET,
      { expiresIn: '12h' }
    );
    res.json({
      token,
      username: admin.username,
      local_slug: admin.local_slug,
      local_nombre: admin.local_nombre,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

// GET /api/admin/me - verifica si el token actual sigue siendo valido
// (lo usa el frontend para chequear la sesion al cargar el panel)
router.get('/me', requireAdminAuth, (req, res) => {
  res.json({
    username: req.admin.username,
    role: req.admin.role,
    local_slug: req.admin.local_slug,
  });
});

module.exports = router;
