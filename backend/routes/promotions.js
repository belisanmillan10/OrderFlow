// routes/promotions.js
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireAdminAuth } = require('../middleware/auth');

// GET /api/promotions - lista promociones (publico: el cliente necesita ver cuales estan activas)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, s.start_time, s.end_time
       FROM promotions p
       LEFT JOIN time_slots s ON p.slot_id = s.id
       ORDER BY p.id ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener promociones' });
  }
});

// GET /api/promotions/suggestions - franjas con baja demanda (SOLO ADMIN, herramienta de gestion)
router.get('/suggestions', requireAdminAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.* FROM time_slots s
      WHERE s.active = true
        AND s.used_capacity < s.max_capacity
        AND (s.used_capacity::float / s.max_capacity) < 0.3
        AND s.id NOT IN (SELECT slot_id FROM promotions WHERE active = true AND slot_id IS NOT NULL)
      ORDER BY s.start_time ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al calcular sugerencias' });
  }
});

// POST /api/promotions - crear promocion (SOLO ADMIN)
router.post('/', requireAdminAuth, async (req, res) => {
  const { name, slot_id, promo_type, discount_pct, active } = req.body;
  if (!name || !slot_id || !promo_type) {
    return res.status(400).json({ error: 'Nombre, franja y tipo de beneficio son obligatorios' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO promotions (name, slot_id, promo_type, discount_pct, active, times_used)
       VALUES ($1,$2,$3,$4,$5,0) RETURNING *`,
      [name, slot_id, promo_type, discount_pct || 0, active !== false]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear promoción' });
  }
});

// PUT /api/promotions/:id - editar / activar / desactivar (SOLO ADMIN)
router.put('/:id', requireAdminAuth, async (req, res) => {
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
       WHERE id = $6 RETURNING *`,
      [name, slot_id, promo_type, discount_pct, active, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Promoción no encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al editar promoción' });
  }
});

// DELETE /api/promotions/:id (SOLO ADMIN)
router.delete('/:id', requireAdminAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM promotions WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Promoción no encontrada' });
    res.json({ deleted: true, id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar promoción' });
  }
});

module.exports = router;
