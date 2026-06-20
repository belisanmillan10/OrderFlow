// server.js
// Punto de entrada del backend. Levanta el servidor Express,
// conecta las rutas de la API, y sirve el frontend.
//
// MULTI-LOCAL: ahora cada negocio (local) tiene su propio slug en la URL.
// El cliente accede por /:slug (ej: /labrasita) y la API publica vive en
// /api/:slug/... . El panel admin entra por /admin y su API vive en
// /api/admin/... ; el local del admin se identifica por su token, nunca
// por un parametro que el cliente pueda manipular.
require('dotenv').config();
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const path = require('path');
const pool = require('./db/pool');

const productsRouter = require('./routes/products');
const slotsRouter = require('./routes/slots');
const ordersRouter = require('./routes/orders');
const channelsRouter = require('./routes/channels');
const promotionsRouter = require('./routes/promotions');
const pointsRouter = require('./routes/points');
const metricsRouter = require('./routes/metrics');
const settingsRouter = require('./routes/settings');
const adminAuthRouter = require('./routes/admin-auth');
const { requireAdminAuth } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '5mb' })); // 5mb por las imagenes en base64

// Endpoint de salud: se registra ANTES de cualquier router, para que
// nunca pueda quedar atrapado por un middleware de autenticacion de
// algun router montado mas adelante.
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ------------------------------------------------------------
// Rutas de autenticacion de administrador (publica: hay que poder
// hacer login sin estar todavia logueado).
app.use('/api/admin', adminAuthRouter);

// ------------------------------------------------------------
// Cada uno de estos routers ya define internamente tanto las rutas
// publicas (/:slug/...) como las de admin (/admin/...), asi que se
// montan todos directo en /api.
app.use('/api', productsRouter);
app.use('/api', slotsRouter);
app.use('/api', ordersRouter);
app.use('/api', channelsRouter);
app.use('/api', promotionsRouter);
app.use('/api', pointsRouter);
app.use('/api', settingsRouter);

// Metrics es exclusivamente de administrador, se protege a nivel de montaje.
app.use('/api/metrics', requireAdminAuth, metricsRouter);

// ------------------------------------------------------------
// Servir el frontend.
//   /admin    -> public/admin.html  (panel administrador, con login)
//   /:slug    -> public/index.html  (vista cliente de ESE local)
// El cliente que escanea el QR de un local especifico nunca ve ni
// descarga el codigo del panel admin: no hay ningun link entre ambos.
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(publicPath, 'admin.html'));
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(publicPath, 'index.html'), (err) => {
    if (err) next();
  });
});

// ------------------------------------------------------------
// Manejo de errores no capturados
app.use((err, req, res, next) => {
  console.error('Error no manejado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ------------------------------------------------------------
// Inicializacion de la base de datos al arrancar.
// Solo crea las tablas (estructura). Los locales y sus datos de ejemplo
// se crean por separado con: node db/create-local.js <slug> <nombre> <user> <pass>
async function ensureDatabaseReady() {
  try {
    const schemaPath = path.join(__dirname, 'db', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(schema);
    console.log('✅ Tablas verificadas/creadas correctamente.');

    const { rows } = await pool.query('SELECT COUNT(*) FROM locales');
    const localCount = parseInt(rows[0].count, 10);
    if (localCount === 0) {
      console.log('ℹ️  No hay locales creados todavía. Corré:');
      console.log('   node db/create-local.js <slug> <nombre> <usuario_admin> <contraseña>');
    } else {
      console.log(`ℹ️  Hay ${localCount} local(es) configurado(s).`);
    }
  } catch (err) {
    console.error('❌ Error al inicializar la base de datos:', err.message);
  }
}

async function start() {
  await ensureDatabaseReady();
  app.listen(PORT, () => {
    console.log(`🚀 OrderFlow backend corriendo en el puerto ${PORT}`);
    console.log(`   Admin:   http://localhost:${PORT}/admin`);
    console.log(`   Cliente: http://localhost:${PORT}/<slug-del-local>`);
  });
}

start();
