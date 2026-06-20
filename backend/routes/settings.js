// routes/settings.js
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireAdminAuth } = require('../middleware/auth');

// GET /api/settings - configuracion general del local (publico: el cliente necesita saber si esta abierto)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM store_settings WHERE id = 1');
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
});

// PUT /api/settings - actualizar (ej: abrir/cerrar el local) (SOLO ADMIN)
router.put('/', requireAdminAuth, async (req, res) => {
  const { store_open, local_name } = req.body;
  try {
    const result = await pool.query(
      `UPDATE store_settings SET
         store_open = COALESCE($1, store_open),
         local_name = COALESCE($2, local_name)
       WHERE id = 1 RETURNING *`,
      [store_open, local_name]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar configuración' });
  }
});

module.exports = router;
