// middleware/auth.js
// Verifica que las peticiones a rutas protegidas traigan un token JWT valido.
// El token se genera al hacer login en POST /api/admin/login y debe enviarse
// en cada request como header: Authorization: Bearer <token>
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  // Sin esto, cualquiera podria forjar un token falso. Mejor fallar fuerte
  // al arrancar que dejar el panel admin inseguro en produccion.
  console.error('❌ Falta la variable de entorno JWT_SECRET. Definila en Railway antes de desplegar.');
}

function requireAdminAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'No autenticado. Iniciá sesión como administrador.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'admin') {
      return res.status(403).json({ error: 'No tenés permisos de administrador.' });
    }
    req.admin = payload; // disponible para las rutas siguientes si lo necesitan
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sesión inválida o expirada. Volvé a iniciar sesión.' });
  }
}

module.exports = { requireAdminAuth, JWT_SECRET };
