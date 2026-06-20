// routes/slots.js
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireAdminAuth } = require('../middleware/auth');

// GET /api/slots - lista todas las franjas (publico: el cliente lo necesita para elegir horario)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM time_slots ORDER BY start_time ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener franjas' });
  }
});

// POST /api/slots - crear franja nueva (SOLO ADMIN)
router.post('/', requireAdminAuth, async (req, res) => {
  const { start_time, end_time, max_capacity, active } = req.body;
  if (!start_time || !end_time) {
    return res.status(400).json({ error: 'Hora de inicio y fin son obligatorias' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO time_slots (start_time, end_time, max_capacity, used_capacity, active)
       VALUES ($1, $2, $3, 0, $4) RETURNING *`,
      [start_time, end_time, max_capacity || 8, active !== false]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear franja' });
  }
});

// PUT /api/slots/:id - editar franja (horario, cupo, estado) (SOLO ADMIN)
router.put('/:id', requireAdminAuth, async (req, res) => {
  const { id } = req.params;
  const { start_time, end_time, max_capacity, active } = req.body;
  try {
    const result = await pool.query(
      `UPDATE time_slots SET
         start_time = COALESCE($1, start_time),
         end_time = COALESCE($2, end_time),
         max_capacity = COALESCE($3, max_capacity),
         active = COALESCE($4, active)
       WHERE id = $5 RETURNING *`,
      [start_time, end_time, max_capacity, active, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Franja no encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al editar franja' });
  }
});

// DELETE /api/slots/:id (SOLO ADMIN)
router.delete('/:id', requireAdminAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM time_slots WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Franja no encontrada' });
    res.json({ deleted: true, id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar franja' });
  }
});

module.exports = router;
