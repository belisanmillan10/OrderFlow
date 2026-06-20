// routes/settings.js
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireAdminAuth } = require('../middleware/auth');
const { resolveLocal } = require('../middleware/resolveLocal');

// Rutas /admin/... van ANTES que /:slug/... para que "admin" nunca se
// interprete por error como un slug de local (ver nota en products.js).

// GET /api/admin/settings - configuracion del local del admin logueado
router.get('/admin/settings', requireAdminAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM locales WHERE id = $1', [req.admin.local_id]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
});

// PUT /api/admin/settings - actualizar (ej: abrir/cerrar el local) (SOLO ADMIN)
router.put('/admin/settings', requireAdminAuth, async (req, res) => {
  const { store_open, nombre } = req.body;
  try {
    const result = await pool.query(
      `UPDATE locales SET
         store_open = COALESCE($1, store_open),
         nombre = COALESCE($2, nombre)
       WHERE id = $3 RETURNING *`,
      [store_open, nombre, req.admin.local_id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar configuración' });
  }
});

// GET /api/:slug/settings - configuracion publica del local. AL FINAL.
router.get('/:slug/settings', resolveLocal, async (req, res) => {
  res.json({
    store_open: req.local.store_open,
    points_rate: req.local.points_rate,
    local_name: req.local.nombre,
  });
});

module.exports = router;
