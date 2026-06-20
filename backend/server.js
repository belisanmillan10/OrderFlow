// server.js
// Punto de entrada del backend. Levanta el servidor Express,
// conecta las rutas de la API, y sirve el frontend.
require('dotenv').config();
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const path = require('path');
const pool = require('./db/pool');
const { requireAdminAuth } = require('./middleware/auth');

const productsRouter = require('./routes/products');
const slotsRouter = require('./routes/slots');
const ordersRouter = require('./routes/orders');
const channelsRouter = require('./routes/channels');
const promotionsRouter = require('./routes/promotions');
const pointsRouter = require('./routes/points');
const metricsRouter = require('./routes/metrics');
const settingsRouter = require('./routes/settings');
const adminAuthRouter = require('./routes/admin-auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '5mb' })); // 5mb por las imagenes en base64

// ------------------------------------------------------------
// Rutas de autenticacion de administrador (publicas: hay que poder
// hacer login sin estar todavia logueado).
app.use('/api/admin', adminAuthRouter);

// ------------------------------------------------------------
// Rutas de LECTURA, accesibles para el cliente final (menu, franjas,
// canales visibles, promos, etc) y tambien usadas por el panel admin.
// No requieren login porque el cliente las necesita para armar su pedido.
app.use('/api/products', productsRouter);
app.use('/api/slots', slotsRouter);
app.use('/api/orders', ordersRouter); // crear pedido (cliente) + listar/cambiar estado (admin, protegido abajo)
app.use('/api/channels', channelsRouter);
app.use('/api/promotions', promotionsRouter);
app.use('/api/points', pointsRouter);
app.use('/api/settings', settingsRouter);

// ------------------------------------------------------------
// Rutas exclusivas de administrador: requieren un token valido.
// Las metricas del local no le sirven de nada al cliente final, asi que
// quedan completamente detras del login.
app.use('/api/metrics', requireAdminAuth, metricsRouter);

// Dentro de orders/products/slots/channels/promotions/points hay operaciones
// de ESCRITURA (crear, editar, borrar, pausar canal, cambiar estado) que son
// exclusivamente de administrador. Esas rutas individuales ya estan protegidas
// dentro de cada archivo de rutas con el middleware requireAdminAuth
// (ver comentarios en routes/products.js, routes/slots.js, etc).

// Endpoint de salud, util para chequear que el server esta vivo
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ------------------------------------------------------------
// Servir el frontend.
// Hay DOS paginas separadas, sin ningun link visible entre ellas:
//   /        -> public/index.html  (vista CLIENTE, lo que abre el QR)
//   /admin   -> public/admin.html  (panel ADMINISTRADOR, con login)
// El cliente que escanea el QR jamas ve ni descarga el codigo del panel admin:
// el HTML/JS de admin.html no esta linkeado desde index.html en ningun lugar.
// Igual de importante: aunque alguien adivine la URL /admin, no puede HACER
// nada sin loguearse, porque todas las rutas de escritura de la API exigen
// un token JWT valido (ver middleware/auth.js).
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
async function ensureDatabaseReady() {
  try {
    const schemaPath = path.join(__dirname, 'db', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(schema);
    console.log('✅ Tablas verificadas/creadas correctamente.');

    const { rows } = await pool.query('SELECT COUNT(*) FROM products');
    const productCount = parseInt(rows[0].count, 10);

    if (productCount === 0) {
      const seedPath = path.join(__dirname, 'db', 'seed.sql');
      const seed = fs.readFileSync(seedPath, 'utf8');
      await pool.query(seed);
      console.log('🌱 Datos de ejemplo cargados (productos, franjas, premios).');
    } else {
      console.log(`ℹ️  Ya hay ${productCount} productos cargados, no se repite el seed.`);
    }
  } catch (err) {
    console.error('❌ Error al inicializar la base de datos:', err.message);
  }
}

async function start() {
  await ensureDatabaseReady();
  app.listen(PORT, () => {
    console.log(`🚀 OrderFlow backend corriendo en el puerto ${PORT}`);
    console.log(`   Cliente: http://localhost:${PORT}/`);
    console.log(`   Admin:   http://localhost:${PORT}/admin`);
  });
}

start();
