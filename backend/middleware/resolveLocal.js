// middleware/resolveLocal.js
// Identifica a que local pertenece una peticion del CLIENTE, a partir del
// slug que viene en la URL (ej: /api/labrasita/products).
// Si el slug no corresponde a ningun local existente, responde 404.
// El resultado queda disponible como req.local (objeto con id, slug, nombre, etc).
const pool = require('../db/pool');

async function resolveLocal(req, res, next) {
  const { slug } = req.params;
  if (!slug) {
    return res.status(400).json({ error: 'Falta el identificador del local en la URL' });
  }
  try {
    const result = await pool.query('SELECT * FROM locales WHERE slug = $1', [slug]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Local no encontrado' });
    }
    req.local = result.rows[0];
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al identificar el local' });
  }
}

module.exports = { resolveLocal };
