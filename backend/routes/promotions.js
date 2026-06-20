// routes/promotions.js
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireAdminAuth } = require('../middleware/auth');
const { resolveLocal } = require('../middleware/resolveLocal');

// Rutas /admin/... van ANTES que /:slug/... para que "admin" nunca se
// interprete por error como un slug de local (ver nota en products.js).

// GET /api/admin/promotions - todas las promos del local del admin
router.get('/admin/promotions', requireAdminAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, s.start_time, s.end_time
       FROM promotions p
       LEFT JOIN time_slots s ON p.slot_id = s.id
       WHERE p.local_id = $1
       ORDER BY p.id ASC`,
      [req.admin.local_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener promociones' });
  }
});

// GET /api/admin/promotions/suggestions - franjas con baja demanda (SOLO ADMIN)
router.get('/admin/promotions/suggestions', requireAdminAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.* FROM time_slots s
      WHERE s.local_id = $1
        AND s.active = true
        AND s.used_capacity < s.max_capacity
        AND (s.used_capacity::float / s.max_capacity) < 0.3
        AND s.id NOT IN (SELECT slot_id FROM promotions WHERE active = true AND slot_id IS NOT NULL AND local_id = $1)
      ORDER BY s.start_time ASC
    `, [req.admin.local_id]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al calcular sugerencias' });
  }
});

// POST /api/admin/promotions - crear promocion (SOLO ADMIN)
router.post('/admin/promotions', requireAdminAuth, async (req, res) => {
  const { name, slot_id, promo_type, discount_pct, active } = req.body;
  if (!name || !slot_id || !promo_type) {
    return res.status(400).json({ error: 'Nombre, franja y tipo de beneficio son obligatorios' });
  }
  try {
    // Verificamos que la franja sea del mismo local antes de crear la promo
    const slotCheck = await pool.query('SELECT id FROM time_slots WHERE id = $1 AND local_id = $2', [slot_id, req.admin.local_id]);
    if (slotCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Franja no encontrada en tu local' });
    }
    const result = await pool.query(
      `INSERT INTO promotions (local_id, name, slot_id, promo_type, discount_pct, active, times_used)
       VALUES ($1,$2,$3,$4,$5,$6,0) RETURNING *`,
      [req.admin.local_id, name, slot_id, promo_type, discount_pct || 0, active !== false]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear promoción' });
  }
});

// PUT /api/admin/promotions/:id - editar / activar / desactivar (SOLO ADMIN)
router.put('/admin/promotions/:id', requireAdminAuth, async (req, res) => {
  const { id } = req.params;
  const { name, slot_id, promo_type, discount_pct, active } = req.body;
  try {
    const result = await pool.query(
      `UPDATE promotions SET
         name = COALESCE($1, name),
         slot_id = COALESCE($2, slot_id),
         promo_type = COALESCE($3, promo_type),
         discount_pct = COALESCE($4, discount_pct),
         active = COALESCE($5, active)
       WHERE id = $6 AND local_id = $7 RETURNING *`,
      [name, slot_id, promo_type, discount_pct, active, id, req.admin.local_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Promoción no encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al editar promoción' });
  }
});

// DELETE /api/admin/promotions/:id (SOLO ADMIN)
router.delete('/admin/promotions/:id', requireAdminAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'DELETE FROM promotions WHERE id = $1 AND local_id = $2 RETURNING id',
      [id, req.admin.local_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Promoción no encontrada' });
    res.json({ deleted: true, id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar promoción' });
  }
});

// GET /api/:slug/promotions - promos activas del local (publico, banners del cliente)
router.get('/:slug/promotions', resolveLocal, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, s.start_time, s.end_time
       FROM promotions p
       LEFT JOIN time_slots s ON p.slot_id = s.id
       WHERE p.local_id = $1
       ORDER BY p.id ASC`,
      [req.local.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener promociones' });
  }
});

module.exports = router;
