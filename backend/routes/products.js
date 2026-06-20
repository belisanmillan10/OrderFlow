// routes/products.js
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireAdminAuth } = require('../middleware/auth');

const CAT_EMOJIS = { burgers: '🍔', combos: '🍱', bebidas: '🥤', extras: '🍟', postres: '🍦' };

// GET /api/products - lista todos los productos (publico: el cliente lo necesita para ver el menu)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

// POST /api/products - crear producto nuevo (SOLO ADMIN)
router.post('/', requireAdminAuth, async (req, res) => {
  const { name, description, price, category, available, image_url, stock, stock_min } = req.body;
  if (!name || !price) {
    return res.status(400).json({ error: 'Nombre y precio son obligatorios' });
  }
  const emoji = CAT_EMOJIS[category] || '🍔';
  try {
    const result = await pool.query(
      `INSERT INTO products (name, description, price, category, available, image_url, emoji, stock, stock_min)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [name, description || '', price, category || 'burgers', available !== false, image_url || '', emoji, stock || 0, stock_min || 3]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear producto' });
  }
});

// PUT /api/products/:id - editar producto existente (SOLO ADMIN)
router.put('/:id', requireAdminAuth, async (req, res) => {
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
       WHERE id = $9 RETURNING *`,
      [name, description, price, category, available, image_url, stock, stock_min, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al editar producto' });
  }
});

// DELETE /api/products/:id (SOLO ADMIN)
router.delete('/:id', requireAdminAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json({ deleted: true, id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar producto' });
  }
});

module.exports = router;
