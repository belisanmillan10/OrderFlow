// routes/channels.js
// TODO este modulo es exclusivamente de administracion: el cliente final
// nunca necesita ver el estado de los canales de venta ni simular pedidos.
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireAdminAuth } = require('../middleware/auth');

router.use(requireAdminAuth);

// GET /api/channels - lista los 4 canales con sus stats
router.get('/', async (req, res) => {
  try {
    const channelsRes = await pool.query('SELECT * FROM channels');
    const channels = channelsRes.rows;

    // calcular pedidos del dia y pendientes por canal
    const statsRes = await pool.query(`
      SELECT channel,
             COUNT(*) AS orders_today,
             COUNT(*) FILTER (WHERE status != 'entregado' AND status != 'cancelado') AS pending
      FROM orders
      WHERE created_at::date = CURRENT_DATE
      GROUP BY channel
    `);
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

// PUT /api/channels/:key - activar o pausar un canal
router.put('/:key', async (req, res) => {
  const { key } = req.params;
  const { active } = req.body;
  try {
    const result = await pool.query(
      'UPDATE channels SET active = $1 WHERE key = $2 RETURNING *',
      [active, key]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Canal no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar canal' });
  }
});

// POST /api/channels/:key/sync - simular sincronizacion (actualiza last_sync)
router.post('/:key/sync', async (req, res) => {
  const { key } = req.params;
  try {
    const result = await pool.query(
      'UPDATE channels SET last_sync = now() WHERE key = $1 RETURNING *',
      [key]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Canal no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al sincronizar canal' });
  }
});

module.exports = router;
