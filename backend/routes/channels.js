// routes/channels.js
// Modulo exclusivo de administracion: el cliente final no necesita ver
// el estado de los canales de venta ni simular pedidos.
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireAdminAuth } = require('../middleware/auth');

// GET /api/admin/channels - canales del local del admin, con sus stats
router.get('/admin/channels', requireAdminAuth, async (req, res) => {
  try {
    const channelsRes = await pool.query('SELECT * FROM channels WHERE local_id = $1', [req.admin.local_id]);
    const channels = channelsRes.rows;

    const statsRes = await pool.query(`
      SELECT channel,
             COUNT(*) AS orders_today,
             COUNT(*) FILTER (WHERE status != 'entregado' AND status != 'cancelado') AS pending
      FROM orders
      WHERE local_id = $1 AND created_at::date = CURRENT_DATE
      GROUP BY channel
    `, [req.admin.local_id]);
    const statsByChannel = {};
    statsRes.rows.forEach((r) => {
      statsByChannel[r.channel] = { orders: parseInt(r.orders_today, 10), pending: parseInt(r.pending, 10) };
    });

    const enriched = channels.map((c) => ({
      ...c,
      orders_today: statsByChannel[c.key]?.orders || 0,
      pending: statsByChannel[c.key]?.pending || 0,
    }));

    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener canales' });
  }
});

// PUT /api/admin/channels/:key - activar o pausar un canal (de su local)
router.put('/admin/channels/:key', requireAdminAuth, async (req, res) => {
  const { key } = req.params;
  const { active } = req.body;
  try {
    const result = await pool.query(
      'UPDATE channels SET active = $1 WHERE key = $2 AND local_id = $3 RETURNING *',
      [active, key, req.admin.local_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Canal no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar canal' });
  }
});

// POST /api/admin/channels/:key/sync - simular sincronizacion
router.post('/admin/channels/:key/sync', requireAdminAuth, async (req, res) => {
  const { key } = req.params;
  try {
    const result = await pool.query(
      'UPDATE channels SET last_sync = now() WHERE key = $1 AND local_id = $2 RETURNING *',
      [key, req.admin.local_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Canal no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al sincronizar canal' });
  }
});

module.exports = router;
