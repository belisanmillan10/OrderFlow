// routes/points.js
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireAdminAuth } = require('../middleware/auth');

// GET /api/points/settings - tasa de acumulacion actual (publico)
router.get('/settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT points_rate FROM store_settings WHERE id = 1');
    res.json({ points_rate: result.rows[0]?.points_rate || 100 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener configuración de puntos' });
  }
});

// PUT /api/points/settings - cambiar tasa de acumulacion (SOLO ADMIN)
router.put('/settings', requireAdminAuth, async (req, res) => {
  const { points_rate } = req.body;
  if (!points_rate || points_rate < 1) {
    return res.status(400).json({ error: 'La tasa debe ser un número mayor a 0' });
  }
  try {
    const result = await pool.query(
      'UPDATE store_settings SET points_rate = $1 WHERE id = 1 RETURNING points_rate',
      [points_rate]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar tasa de puntos' });
  }
});

// GET /api/points/customer/:name - puntos de un cliente (busqueda simple por nombre)
router.get('/customer/:name', async (req, res) => {
  const { name } = req.params;
  try {
    const result = await pool.query('SELECT * FROM customers WHERE name = $1 LIMIT 1', [name]);
    if (result.rows.length === 0) return res.json({ name, points: 0, found: false });
    res.json({ ...result.rows[0], found: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al buscar cliente' });
  }
});

// GET /api/points/rewards - lista de premios canjeables
router.get('/rewards', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM rewards ORDER BY points_cost ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener premios' });
  }
});

// POST /api/points/rewards - crear premio nuevo (SOLO ADMIN)
router.post('/rewards', requireAdminAuth, async (req, res) => {
  const { name, emoji, points_cost } = req.body;
  if (!name || !points_cost) {
    return res.status(400).json({ error: 'Nombre y puntos necesarios son obligatorios' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO rewards (name, emoji, points_cost) VALUES ($1,$2,$3) RETURNING *',
      [name, emoji || '🎁', points_cost]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear premio' });
  }
});

// PUT /api/points/rewards/:id - editar premio (SOLO ADMIN)
router.put('/rewards/:id', requireAdminAuth, async (req, res) => {
  const { id } = req.params;
  const { name, emoji, points_cost } = req.body;
  try {
    const result = await pool.query(
      `UPDATE rewards SET name = COALESCE($1,name), emoji = COALESCE($2,emoji), points_cost = COALESCE($3,points_cost)
       WHERE id = $4 RETURNING *`,
      [name, emoji, points_cost, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Premio no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al editar premio' });
  }
});

// DELETE /api/points/rewards/:id (SOLO ADMIN)
router.delete('/rewards/:id', requireAdminAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM rewards WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Premio no encontrado' });
    res.json({ deleted: true, id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar premio' });
  }
});

// POST /api/points/redeem - canjear puntos de un cliente por un premio
router.post('/redeem', async (req, res) => {
  const { customer_name, reward_id } = req.body;
  if (!customer_name || !reward_id) {
    return res.status(400).json({ error: 'Faltan datos para el canje' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const custRes = await client.query('SELECT * FROM customers WHERE name = $1 FOR UPDATE', [customer_name]);
    if (custRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    const customer = custRes.rows[0];
    const rewardRes = await client.query('SELECT * FROM rewards WHERE id = $1', [reward_id]);
    if (rewardRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Premio no encontrado' });
    }
    const reward = rewardRes.rows[0];
    if (customer.points < reward.points_cost) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Puntos insuficientes' });
    }
    const updated = await client.query(
      'UPDATE customers SET points = points - $1 WHERE id = $2 RETURNING points',
      [reward.points_cost, customer.id]
    );
    await client.query('COMMIT');
    res.json({ redeemed: true, reward: reward.name, remaining_points: updated.rows[0].points });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error al canjear premio' });
  } finally {
    client.release();
  }
});

module.exports = router;
