// routes/products.js
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireAdminAuth } = require('../middleware/auth');
const { resolveLocal } = require('../middleware/resolveLocal');

const CAT_EMOJIS = { burgers: '🍔', combos: '🍱', bebidas: '🥤', extras: '🍟', postres: '🍦' };

// ------------------------------------------------------------
// RUTAS DE ADMIN primero: como ambos grupos de rutas tienen la misma
// forma (/algo/products), si la ruta generica /:slug/products se
// registrara primero, capturaria por error pedidos a /admin/products
// (interpretando "admin" como si fuera el slug de un local). Por eso
// las rutas literales especificas van ANTES que la generica con parametro.

// GET /api/admin/products - lista productos del local del admin logueado
router.get('/admin/products', requireAdminAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM products WHERE local_id = $1 ORDER BY id ASC',
      [req.admin.local_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

// POST /api/admin/products - crear producto nuevo (SOLO ADMIN, en su local)
router.post('/admin/products', requireAdminAuth, async (req, res) => {
  const { name, description, price, category, available, image_url, stock, stock_min } = req.body;
  if (!name || !price) {
    return res.status(400).json({ error: 'Nombre y precio son obligatorios' });
  }
  const emoji = CAT_EMOJIS[category] || '🍔';
  try {
    const result = await pool.query(
      `INSERT INTO products (local_id, name, description, price, category, available, image_url, emoji, stock, stock_min)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.admin.local_id, name, description || '', price, category || 'burgers', available !== false, image_url || '', emoji, stock || 0, stock_min || 3]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear producto' });
  }
});

// PUT /api/admin/products/:id - editar producto (SOLO ADMIN, solo si es de su local)
router.put('/admin/products/:id', requireAdminAuth, async (req, res) => {
  const { id } = req.params;
  const { name, description, price, category, available, image_url, stock, stock_min } = req.body;
  try {
    const result = await pool.query(
      `UPDATE products SET
         name = COALESCE($1, name),
         description = COALESCE($2, description),
         price = COALESCE($3, price),
         category = COALESCE($4, category),
         available = COALESCE($5, available),
         image_url = COALESCE($6, image_url),
         stock = COALESCE($7, stock),
         stock_min = COALESCE($8, stock_min)
       WHERE id = $9 AND local_id = $10 RETURNING *`,
      [name, description, price, category, available, image_url, stock, stock_min, id, req.admin.local_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al editar producto' });
  }
});

// DELETE /api/admin/products/:id (SOLO ADMIN, solo si es de su local)
router.delete('/admin/products/:id', requireAdminAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'DELETE FROM products WHERE id = $1 AND local_id = $2 RETURNING id',
      [id, req.admin.local_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json({ deleted: true, id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar producto' });
  }
});

// ------------------------------------------------------------
// RUTA PUBLICA (cliente), identificada por slug en la URL. Va AL FINAL
// porque /:slug/products coincidiria con cualquier path de 2 segmentos,
// incluyendo /admin/products si estuviera registrada antes.
// GET /api/:slug/products - lista productos de ESE local
router.get('/:slug/products', resolveLocal, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM products WHERE local_id = $1 ORDER BY id ASC',
      [req.local.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

module.exports = router;
