// routes/points.js
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireAdminAuth } = require('../middleware/auth');
const { resolveLocal } = require('../middleware/resolveLocal');

// Rutas /admin/... van ANTES que /:slug/... para que "admin" nunca se
// interprete por error como un slug de local (ver nota en products.js).

// PUT /api/admin/points/settings - cambiar tasa de acumulacion (SOLO ADMIN)
router.put('/admin/points/settings', requireAdminAuth, async (req, res) => {
  const { points_rate } = req.body;
  if (!points_rate || points_rate < 1) {
    return res.status(400).json({ error: 'La tasa debe ser un número mayor a 0' });
  }
  try {
    const result = await pool.query(
      'UPDATE locales SET points_rate = $1 WHERE id = $2 RETURNING points_rate',
      [points_rate, req.admin.local_id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar tasa de puntos' });
  }
});

// GET /api/admin/points/rewards - lista de premios (vista admin, mismo local)
router.get('/admin/points/rewards', requireAdminAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM rewards WHERE local_id = $1 ORDER BY points_cost ASC',
      [req.admin.local_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener premios' });
  }
});

// POST /api/admin/points/rewards - crear premio nuevo (SOLO ADMIN)
router.post('/admin/points/rewards', requireAdminAuth, async (req, res) => {
  const { name, emoji, points_cost } = req.body;
  if (!name || !points_cost) {
    return res.status(400).json({ error: 'Nombre y puntos necesarios son obligatorios' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO rewards (local_id, name, emoji, points_cost) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.admin.local_id, name, emoji || '🎁', points_cost]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear premio' });
  }
});

// PUT /api/admin/points/rewards/:id - editar premio (SOLO ADMIN, de su local)
router.put('/admin/points/rewards/:id', requireAdminAuth, async (req, res) => {
  const { id } = req.params;
  const { name, emoji, points_cost } = req.body;
  try {
    const result = await pool.query(
      `UPDATE rewards SET name = COALESCE($1,name), emoji = COALESCE($2,emoji), points_cost = COALESCE($3,points_cost)
       WHERE id = $4 AND local_id = $5 RETURNING *`,
      [name, emoji, points_cost, id, req.admin.local_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Premio no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al editar premio' });
  }
});

// DELETE /api/admin/points/rewards/:id (SOLO ADMIN, de su local)
router.delete('/admin/points/rewards/:id', requireAdminAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'DELETE FROM rewards WHERE id = $1 AND local_id = $2 RETURNING id',
      [id, req.admin.local_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Premio no encontrado' });
    res.json({ deleted: true, id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar premio' });
  }
});

// ------------------------------------------------------------
// Rutas publicas (cliente), con slug. AL FINAL.

// GET /api/:slug/points/settings - tasa de acumulacion del local (publico)
router.get('/:slug/points/settings', resolveLocal, async (req, res) => {
  res.json({ points_rate: req.local.points_rate || 100 });
});

// GET /api/:slug/points/customer/:phone - puntos de un cliente de ESE local,
// identificado por telefono (publico: lo consulta el cliente sobre si mismo)
router.get('/:slug/points/customer/:phone', resolveLocal, async (req, res) => {
  const { phone } = req.params;
  try {
    const result = await pool.query(
      'SELECT * FROM customers WHERE local_id = $1 AND phone = $2 LIMIT 1',
      [req.local.id, phone]
    );
    if (result.rows.length === 0) return res.json({ phone, points: 0, found: false });
    res.json({ ...result.rows[0], found: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al buscar cliente' });
  }
});

// GET /api/:slug/points/rewards - premios canjeables del local (publico)
router.get('/:slug/points/rewards', resolveLocal, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM rewards WHERE local_id = $1 ORDER BY points_cost ASC',
      [req.local.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener premios' });
  }
});

// POST /api/:slug/points/redeem - canjear puntos (publico, identificado por telefono)
router.post('/:slug/points/redeem', resolveLocal, async (req, res) => {
  const { phone, reward_id } = req.body;
  if (!phone || !reward_id) {
    return res.status(400).json({ error: 'Faltan datos para el canje' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const custRes = await client.query(
      'SELECT * FROM customers WHERE local_id = $1 AND phone = $2 FOR UPDATE',
      [req.local.id, phone]
    );
    if (custRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    const customer = custRes.rows[0];
    const rewardRes = await client.query(
      'SELECT * FROM rewards WHERE id = $1 AND local_id = $2',
      [reward_id, req.local.id]
    );
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
