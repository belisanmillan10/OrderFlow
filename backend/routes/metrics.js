// routes/metrics.js
// Montado en server.js con requireAdminAuth aplicado a nivel de router,
// asi que req.admin siempre esta disponible aca.
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// GET /api/metrics/local - metricas generales del local del admin
router.get('/local', async (req, res) => {
  const localId = req.admin.local_id;
  try {
    const ordersRes = await pool.query('SELECT * FROM orders WHERE local_id = $1', [localId]);
    const orders = ordersRes.rows;
    const total = orders.length;
    const completed = orders.filter((o) => o.status === 'entregado').length;
    const cancelled = orders.filter((o) => o.status === 'cancelado').length;
    const cancelRate = total ? Math.round((cancelled / total) * 100) : 0;
    const revenue = orders.reduce((s, o) => s + o.total, 0);
    const avgTicket = total ? Math.round(revenue / total) : 0;

    const prodsRes = await pool.query('SELECT available FROM products WHERE local_id = $1', [localId]);
    const unavailPct = prodsRes.rows.length
      ? Math.round((prodsRes.rows.filter((p) => !p.available).length / prodsRes.rows.length) * 100)
      : 0;

    // recompra: clientes con mas de 1 pedido, dentro de este local
    const repeatRes = await pool.query(`
      SELECT customer_name, COUNT(*) AS cnt FROM orders WHERE local_id = $1 GROUP BY customer_name
    `, [localId]);
    const uniqueClients = repeatRes.rows.length;
    const repeaters = repeatRes.rows.filter((r) => parseInt(r.cnt, 10) > 1).length;
    const repeatRate = uniqueClients ? Math.round((repeaters / uniqueClients) * 100) : 0;

    const slotsRes = await pool.query('SELECT max_capacity, used_capacity FROM time_slots WHERE local_id = $1', [localId]);
    const totalMax = slotsRes.rows.reduce((s, r) => s + r.max_capacity, 0);
    const totalUsed = slotsRes.rows.reduce((s, r) => s + r.used_capacity, 0);
    const occupancyPct = totalMax ? Math.round((totalUsed / totalMax) * 100) : 0;
    const nps = Math.max(20, Math.min(85, 75 - Math.round(occupancyPct * 0.4)));

    res.json({
      total_orders: total,
      completed_orders: completed,
      cancelled_orders: cancelled,
      cancel_rate_pct: cancelRate,
      revenue,
      avg_ticket: avgTicket,
      unavailable_products_pct: unavailPct,
      repeat_rate_pct: repeatRate,
      repeaters,
      unique_clients: uniqueClients,
      nps_estimate: nps,
      kitchen_occupancy_pct: occupancyPct,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al calcular métricas del local' });
  }
});

// GET /api/metrics/top-products - productos mas vendidos, en este local
router.get('/top-products', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT oi.product_name, SUM(oi.quantity) AS total_qty
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.local_id = $1
      GROUP BY oi.product_name
      ORDER BY total_qty DESC
      LIMIT 5
    `, [req.admin.local_id]);
    res.json(result.rows.map((r) => ({ name: r.product_name, qty: parseInt(r.total_qty, 10) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al calcular productos más vendidos' });
  }
});

// GET /api/metrics/by-channel - pedidos y ventas por canal, en este local
router.get('/by-channel', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT channel, COUNT(*) AS orders, SUM(total) AS revenue
      FROM orders WHERE local_id = $1 GROUP BY channel
    `, [req.admin.local_id]);
    res.json(result.rows.map((r) => ({
      channel: r.channel,
      orders: parseInt(r.orders, 10),
      revenue: parseInt(r.revenue, 10),
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al calcular métricas por canal' });
  }
});

// GET /api/metrics/operational - rechazados, reasignados, etc, de este local
router.get('/operational', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM operational_metrics WHERE local_id = $1', [req.admin.local_id]);
    res.json(result.rows[0] || { rejected_by_capacity: 0, reassigned_count: 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener métricas operativas' });
  }
});

module.exports = router;
