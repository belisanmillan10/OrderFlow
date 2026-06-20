// routes/orders.js
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireAdminAuth } = require('../middleware/auth');

// ------------------------------------------------------------
// Helper: tiempo estimado de preparacion segun ocupacion total de la cocina
function estimatedWaitMinutes(occupancyPct) {
  if (occupancyPct >= 85) return 45;
  if (occupancyPct >= 60) return 35;
  if (occupancyPct >= 30) return 25;
  return 15;
}

// ------------------------------------------------------------
// GET /api/orders - lista TODOS los pedidos (SOLO ADMIN, para el dashboard de cocina)
router.get('/', requireAdminAuth, async (req, res) => {
  try {
    const ordersResult = await pool.query(`
      SELECT o.*, s.start_time, s.end_time
      FROM orders o
      LEFT JOIN time_slots s ON o.slot_id = s.id
      ORDER BY o.created_at DESC LIMIT 200
    `);
    const orders = ordersResult.rows;

    if (orders.length === 0) return res.json([]);

    const orderIds = orders.map((o) => o.id);
    const itemsResult = await pool.query(
      'SELECT * FROM order_items WHERE order_id = ANY($1::int[])',
      [orderIds]
    );

    const itemsByOrder = {};
    itemsResult.rows.forEach((it) => {
      if (!itemsByOrder[it.order_id]) itemsByOrder[it.order_id] = [];
      itemsByOrder[it.order_id].push({
        name: it.product_name,
        qty: it.quantity,
        price: it.unit_price,
      });
    });

    const enriched = orders.map((o) => ({ ...o, items: itemsByOrder[o.id] || [] }));
    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener pedidos' });
  }
});

// ------------------------------------------------------------
// POST /api/orders - crear un pedido nuevo
//
// Flujo completo (todo dentro de una transaccion para evitar inconsistencias
// si dos pedidos llegan al mismo tiempo):
// 1. Verifica que el canal este activo
// 2. Verifica disponibilidad y stock de cada producto
// 3. Busca cupo en la franja elegida; si no hay, reasigna a la siguiente disponible
// 4. Si no hay ninguna franja con cupo, rechaza el pedido
// 5. Descuenta stock y cupo de franja
// 6. Calcula puntos y horario estimado
// 7. Crea el pedido y sus items
router.post('/', async (req, res) => {
  const {
    customer_name,
    customer_phone,
    channel,              // 'web' | 'presencial' | 'rappi' | 'pedidosya'
    items,                // [{ product_id, quantity }]
    preferred_slot_id,
    payment_method,
    promo_id,
  } = req.body;

  if (!customer_name || !channel || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Faltan datos obligatorios del pedido' });
  }

  // client se obtiene afuera del try para poder liberarlo siempre en el finally,
  // sin importar por donde salga la funcion (exito, error de negocio, o excepcion)
  const client = await pool.connect();
  let responseSent = false;

  try {
    await client.query('BEGIN');

    // 1. Verificar canal activo
    const chanRes = await client.query('SELECT * FROM channels WHERE key = $1', [channel]);
    if (chanRes.rows.length === 0 || !chanRes.rows[0].active) {
      await client.query('ROLLBACK');
      res.status(409).json({ error: `El canal "${channel}" está pausado. No se pueden recibir pedidos en este momento.` });
      responseSent = true;
      return;
    }

    // 2. Verificar disponibilidad y stock de cada producto, calcular total
    let rawTotal = 0;
    const resolvedItems = [];
    for (const it of items) {
      const prodRes = await client.query('SELECT * FROM products WHERE id = $1', [it.product_id]);
      if (prodRes.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: `Producto ${it.product_id} no existe` });
        responseSent = true;
        return;
      }
      const product = prodRes.rows[0];
      if (!product.available) {
        await client.query('ROLLBACK');
        res.status(409).json({ error: `"${product.name}" no está disponible` });
        responseSent = true;
        return;
      }
      if (product.stock < it.quantity) {
        await client.query('ROLLBACK');
        res.status(409).json({ error: `Stock insuficiente de "${product.name}" (quedan ${product.stock})` });
        responseSent = true;
        return;
      }
      rawTotal += product.price * it.quantity;
      resolvedItems.push({ product, quantity: it.quantity });
    }

    // 3 y 4. Buscar cupo en franja preferida o reasignar a la siguiente disponible
    let assignedSlot = null;
    let wasReassigned = false;

    if (preferred_slot_id) {
      const preferredRes = await client.query(
        'SELECT * FROM time_slots WHERE id = $1 AND active = true FOR UPDATE',
        [preferred_slot_id]
      );
      if (preferredRes.rows.length > 0 && preferredRes.rows[0].used_capacity < preferredRes.rows[0].max_capacity) {
        assignedSlot = preferredRes.rows[0];
      }
    }

    if (!assignedSlot) {
      // la franja preferida no existe, esta inactiva o esta llena -> buscar la siguiente con cupo
      const nextRes = await client.query(
        `SELECT * FROM time_slots
         WHERE active = true AND used_capacity < max_capacity
         ORDER BY start_time ASC FOR UPDATE`
      );
      if (nextRes.rows.length === 0) {
        await client.query('ROLLBACK');
        // Pedido rechazado por falta de capacidad: lo registramos en metricas (fuera de esta transaccion)
        await pool.query(
          'UPDATE operational_metrics SET rejected_by_capacity = rejected_by_capacity + 1 WHERE id = 1'
        );
        res.status(409).json({
          error: 'No hay capacidad disponible para este horario. Recomendá otro horario o pausá temporalmente el canal.',
        });
        responseSent = true;
        return;
      }
      assignedSlot = nextRes.rows[0];
      if (preferred_slot_id && assignedSlot.id !== Number(preferred_slot_id)) {
        wasReassigned = true;
      }
    }

    // 5a. Descontar cupo de la franja (dentro de la transaccion, ya bloqueada con FOR UPDATE)
    await client.query(
      'UPDATE time_slots SET used_capacity = used_capacity + 1 WHERE id = $1',
      [assignedSlot.id]
    );

    // 5b. Descontar stock de cada producto, y marcar no disponible si llega a 0
    for (const ri of resolvedItems) {
      await client.query(
        'UPDATE products SET stock = stock - $1 WHERE id = $2',
        [ri.quantity, ri.product.id]
      );
      const newStock = ri.product.stock - ri.quantity;
      if (newStock <= 0) {
        await client.query('UPDATE products SET available = false WHERE id = $1', [ri.product.id]);
      }
    }

    // Aplicar promocion si corresponde
    let discount = 0;
    let promoType = null;
    if (promo_id) {
      const promoRes = await client.query('SELECT * FROM promotions WHERE id = $1 AND active = true', [promo_id]);
      if (promoRes.rows.length > 0) {
        const promo = promoRes.rows[0];
        promoType = promo.promo_type;
        if (promo.promo_type === 'pct') {
          discount = Math.round(rawTotal * promo.discount_pct / 100);
        }
        await client.query('UPDATE promotions SET times_used = times_used + 1 WHERE id = $1', [promo.id]);
      }
    }
    const total = rawTotal - discount;

    // 6. Calcular puntos (doble si la promo es de tipo dblpts)
    const settingsRes = await client.query('SELECT points_rate FROM store_settings WHERE id = 1');
    const pointsRate = settingsRes.rows[0]?.points_rate || 100;
    let pointsEarned = Math.floor(total / pointsRate);
    if (promoType === 'dblpts') pointsEarned *= 2;

    // Cliente: buscar o crear por nombre (simplificado, sin login)
    let customerId = null;
    const custRes = await client.query(
      'SELECT * FROM customers WHERE name = $1 LIMIT 1',
      [customer_name]
    );
    if (custRes.rows.length > 0) {
      customerId = custRes.rows[0].id;
      await client.query('UPDATE customers SET points = points + $1 WHERE id = $2', [pointsEarned, customerId]);
    } else {
      const newCust = await client.query(
        'INSERT INTO customers (name, phone, points) VALUES ($1, $2, $3) RETURNING id',
        [customer_name, customer_phone || '', pointsEarned]
      );
      customerId = newCust.rows[0].id;
    }

    // Generar codigo de pedido correlativo simple
    const codeRes = await client.query('SELECT COUNT(*) FROM orders');
    const orderCode = 'BRG-' + (100 + parseInt(codeRes.rows[0].count, 10));

    const isDelivery = channel === 'rappi' || channel === 'pedidosya';
    const eta = assignedSlot.end_time;
    const paymentStatus = payment_method === 'local' ? 'pendiente' : 'aprobado';

    const orderInsert = await client.query(
      `INSERT INTO orders
        (code, customer_id, customer_name, channel, slot_id, raw_total, discount, total,
         promo_id, payment_method, payment_status, status, is_delivery, eta, points_earned)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'recibido',$12,$13,$14)
       RETURNING *`,
      [orderCode, customerId, customer_name, channel, assignedSlot.id, rawTotal, discount, total,
        promo_id || null, payment_method || 'local', paymentStatus, isDelivery, eta, pointsEarned]
    );
    const newOrder = orderInsert.rows[0];

    for (const ri of resolvedItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price)
         VALUES ($1,$2,$3,$4,$5)`,
        [newOrder.id, ri.product.id, ri.product.name, ri.quantity, ri.product.price]
      );
    }

    // Actualizar ultima sincronizacion del canal
    await client.query('UPDATE channels SET last_sync = now() WHERE key = $1', [channel]);

    // Si hubo reasignacion, lo registramos en metricas (despues del commit para no
    // bloquear la fila de metricas dentro de la misma transaccion del pedido)
    await client.query('COMMIT');

    if (wasReassigned) {
      await pool.query('UPDATE operational_metrics SET reassigned_count = reassigned_count + 1 WHERE id = 1');
    }

    res.status(201).json({
      ...newOrder,
      items: resolvedItems.map((ri) => ({ name: ri.product.name, qty: ri.quantity, price: ri.product.price })),
      slot: { start: assignedSlot.start_time, end: assignedSlot.end_time },
      was_reassigned: wasReassigned,
    });
    responseSent = true;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ya pudo haber hecho rollback */ }
    console.error(err);
    if (!responseSent) {
      res.status(500).json({ error: 'Error al crear el pedido' });
    }
  } finally {
    client.release();
  }
});

// ------------------------------------------------------------
// GET /api/orders/code/:code - consulta PUBLICA del estado de un pedido propio.
// El cliente usa esto para la pantalla de "seguimiento de mi pedido", sin
// necesitar login ni poder ver los pedidos de otros clientes (solo devuelve
// los datos de ESE pedido puntual, identificado por su codigo unico).
router.get('/code/:code', async (req, res) => {
  const { code } = req.params;
  try {
    const result = await pool.query(`
      SELECT o.code, o.status, o.payment_status, o.total, o.points_earned, o.eta, o.is_delivery,
             s.start_time, s.end_time
      FROM orders o
      LEFT JOIN time_slots s ON o.slot_id = s.id
      WHERE o.code = $1
    `, [code]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al consultar el pedido' });
  }
});

// ------------------------------------------------------------
// PUT /api/orders/:id/status - avanzar estado del pedido (SOLO ADMIN)
router.put('/:id/status', requireAdminAuth, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const validStatuses = ['recibido', 'preparando', 'listo', 'entregado', 'cancelado'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Estado invalido' });
  }
  try {
    const result = await pool.query(
      'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar estado' });
  }
});

// ------------------------------------------------------------
// GET /api/orders/saturation - nivel de ocupacion general de la cocina
router.get('/saturation', async (req, res) => {
  try {
    const result = await pool.query('SELECT max_capacity, used_capacity FROM time_slots');
    const totalMax = result.rows.reduce((s, r) => s + r.max_capacity, 0);
    const totalUsed = result.rows.reduce((s, r) => s + r.used_capacity, 0);
    const occupancyPct = totalMax > 0 ? Math.round((totalUsed / totalMax) * 100) : 0;
    res.json({
      occupancy_pct: occupancyPct,
      estimated_wait_minutes: estimatedWaitMinutes(occupancyPct),
      level: occupancyPct >= 85 ? 'red' : occupancyPct >= 60 ? 'yellow' : 'green',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al calcular saturación' });
  }
});

module.exports = router;
