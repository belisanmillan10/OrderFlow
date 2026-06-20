// routes/slots.js
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireAdminAuth } = require('../middleware/auth');
const { resolveLocal } = require('../middleware/resolveLocal');

// GET /api/:slug/slots - franjas del local (publico, lo usa el cliente)
router.get('/:slug/slots', resolveLocal, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM time_slots WHERE local_id = $1 ORDER BY start_time ASC',
      [req.local.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener franjas' });
  }
});

// GET /api/admin/slots - franjas del local del admin
router.get('/admin/slots', requireAdminAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM time_slots WHERE local_id = $1 ORDER BY start_time ASC',
      [req.admin.local_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener franjas' });
  }
});

// POST /api/admin/slots - crear franja nueva (SOLO ADMIN)
router.post('/admin/slots', requireAdminAuth, async (req, res) => {
  const { start_time, end_time, max_capacity, active } = req.body;
  if (!start_time || !end_time) {
    return res.status(400).json({ error: 'Hora de inicio y fin son obligatorias' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO time_slots (local_id, start_time, end_time, max_capacity, used_capacity, active)
       VALUES ($1,$2,$3,$4,0,$5) RETURNING *`,
      [req.admin.local_id, start_time, end_time, max_capacity || 8, active !== false]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear franja' });
  }
});

// PUT /api/admin/slots/:id - editar franja (SOLO ADMIN, solo de su local)
router.put('/admin/slots/:id', requireAdminAuth, async (req, res) => {
  const { id } = req.params;
  const { start_time, end_time, max_capacity, active } = req.body;
  try {
    const result = await pool.query(
      `UPDATE time_slots SET
         start_time = COALESCE($1, start_time),
         end_time = COALESCE($2, end_time),
         max_capacity = COALESCE($3, max_capacity),
         active = COALESCE($4, active)
       WHERE id = $5 AND local_id = $6 RETURNING *`,
      [start_time, end_time, max_capacity, active, id, req.admin.local_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Franja no encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al editar franja' });
  }
});

// DELETE /api/admin/slots/:id (SOLO ADMIN, solo de su local)
router.delete('/admin/slots/:id', requireAdminAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'DELETE FROM time_slots WHERE id = $1 AND local_id = $2 RETURNING id',
      [id, req.admin.local_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Franja no encontrada' });
    res.json({ deleted: true, id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar franja' });
  }
});

module.exports = router;
