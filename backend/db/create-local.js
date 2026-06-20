// db/create-local.js
// Crea un nuevo local (negocio) en la plataforma, con datos de ejemplo
// y su primer usuario administrador.
//
// Uso desde la Console de Railway:
//   node db/create-local.js <slug> <nombre_del_local> <usuario_admin> <contraseña_admin>
//
// Ejemplo:
//   node db/create-local.js labrasita "La Brasita Burger" belisanmillan miClaveSegura123
//
// El cliente de ESE local accede por: https://tu-app.up.railway.app/labrasita
// El admin de ESE local entra por:    https://tu-app.up.railway.app/admin
// (el panel admin detecta el local automaticamente segun el usuario logueado)
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./pool');

const DEFAULT_PRODUCTS = [
  { name: 'La Clásica', description: 'Cheddar, lechuga, tomate, mayonesa', price: 2500, category: 'burgers', emoji: '🍔', stock: 18, stock_min: 5 },
  { name: 'BBQ Crispy', description: 'Panceta, cebolla caramelizada, BBQ', price: 2900, category: 'burgers', emoji: '🥩', stock: 12, stock_min: 3 },
  { name: 'Veggie Power', description: 'Medallón de garbanzos, hummus, rúcula', price: 2600, category: 'burgers', emoji: '🥦', stock: 8, stock_min: 3 },
  { name: 'Combo Clásico', description: 'Hamburguesa + papas + bebida', price: 3800, category: 'combos', emoji: '🍱', stock: 10, stock_min: 3 },
  { name: 'Coca-Cola', description: 'Lata 354ml', price: 600, category: 'bebidas', emoji: '🥤', stock: 30, stock_min: 8 },
  { name: 'Agua Mineral', description: '500ml con o sin gas', price: 400, category: 'bebidas', emoji: '💧', stock: 25, stock_min: 8 },
  { name: 'Papas fritas', description: 'Porción grande con dip', price: 900, category: 'extras', emoji: '🍟', stock: 15, stock_min: 4 },
  { name: 'Brownie', description: 'Con helado de vainilla', price: 1100, category: 'postres', emoji: '🍫', stock: 7, stock_min: 2 },
];

const DEFAULT_SLOTS = [
  { start_time: '19:00', end_time: '19:15', max_capacity: 8 },
  { start_time: '19:15', end_time: '19:30', max_capacity: 8 },
  { start_time: '20:00', end_time: '20:15', max_capacity: 10 },
  { start_time: '20:15', end_time: '20:30', max_capacity: 10 },
  { start_time: '20:30', end_time: '20:45', max_capacity: 8 },
];

const DEFAULT_CHANNELS = [
  { key: 'web', name: 'Web / QR' },
  { key: 'presencial', name: 'Presencial' },
  { key: 'rappi', name: 'Rappi' },
  { key: 'pedidosya', name: 'PedidosYa' },
];

const DEFAULT_REWARDS = [
  { name: 'Papas chicas', emoji: '🍟', points_cost: 500 },
  { name: 'Bebida gratis', emoji: '🥤', points_cost: 350 },
  { name: '10% de descuento', emoji: '🏷️', points_cost: 700 },
];

async function createLocal() {
  const [slug, nombre, adminUser, adminPass] = process.argv.slice(2);

  if (!slug || !nombre || !adminUser || !adminPass) {
    console.error('❌ Uso: node db/create-local.js <slug> <nombre> <usuario_admin> <contraseña_admin>');
    console.error('   Ejemplo: node db/create-local.js labrasita "La Brasita Burger" belisanmillan miClaveSegura123');
    process.exit(1);
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    console.error('❌ El slug solo puede tener letras minúsculas, números y guiones (sin espacios ni acentos). Ej: "labrasita" o "la-brasita".');
    process.exit(1);
  }
  if (adminPass.length < 8) {
    console.error('❌ La contraseña del admin debe tener al menos 8 caracteres.');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query('SELECT id FROM locales WHERE slug = $1', [slug]);
    if (existing.rows.length > 0) {
      console.error(`❌ Ya existe un local con el slug "${slug}". Elegí otro.`);
      await client.query('ROLLBACK');
      process.exit(1);
    }

    const localRes = await client.query(
      `INSERT INTO locales (slug, nombre, store_open, points_rate) VALUES ($1, $2, true, 100) RETURNING id`,
      [slug, nombre]
    );
    const localId = localRes.rows[0].id;

    for (const p of DEFAULT_PRODUCTS) {
      await client.query(
        `INSERT INTO products (local_id, name, description, price, category, available, emoji, stock, stock_min)
         VALUES ($1,$2,$3,$4,$5,true,$6,$7,$8)`,
        [localId, p.name, p.description, p.price, p.category, p.emoji, p.stock, p.stock_min]
      );
    }

    for (const s of DEFAULT_SLOTS) {
      await client.query(
        `INSERT INTO time_slots (local_id, start_time, end_time, max_capacity, used_capacity, active)
         VALUES ($1,$2,$3,$4,0,true)`,
        [localId, s.start_time, s.end_time, s.max_capacity]
      );
    }

    for (const c of DEFAULT_CHANNELS) {
      await client.query(
        `INSERT INTO channels (local_id, key, name, active, last_sync) VALUES ($1,$2,$3,true,now())`,
        [localId, c.key, c.name]
      );
    }

    for (const r of DEFAULT_REWARDS) {
      await client.query(
        `INSERT INTO rewards (local_id, name, emoji, points_cost) VALUES ($1,$2,$3,$4)`,
        [localId, r.name, r.emoji, r.points_cost]
      );
    }

    await client.query(
      `INSERT INTO operational_metrics (local_id, rejected_by_capacity, reassigned_count) VALUES ($1, 0, 0)`,
      [localId]
    );

    const passwordHash = await bcrypt.hash(adminPass, 10);
    await client.query(
      `INSERT INTO admin_users (local_id, username, password_hash) VALUES ($1,$2,$3)`,
      [localId, adminUser, passwordHash]
    );

    await client.query('COMMIT');

    console.log('✅ Local creado correctamente:');
    console.log(`   Nombre: ${nombre}`);
    console.log(`   Slug:   ${slug}`);
    console.log(`   Cliente: https://TU-DOMINIO.up.railway.app/${slug}`);
    console.log(`   Admin:   https://TU-DOMINIO.up.railway.app/admin  (usuario: ${adminUser})`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error al crear el local:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

createLocal();
