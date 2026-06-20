// db/init.js
// Corre el esquema SQL y los datos iniciales contra la base de datos conectada.
// Uso: npm run init-db
// Es seguro correrlo mas de una vez: crea las tablas si no existen, y solo
// carga los datos de ejemplo (productos, franjas, premios) si la tabla
// "products" esta vacia, para no duplicar nada.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function init() {
  console.log('Conectando a la base de datos...');
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(schema);
    console.log('✅ Tablas creadas/verificadas correctamente.');

    const { rows } = await pool.query('SELECT COUNT(*) FROM products');
    const productCount = parseInt(rows[0].count, 10);

    if (productCount === 0) {
      const seedPath = path.join(__dirname, 'seed.sql');
      const seed = fs.readFileSync(seedPath, 'utf8');
      await pool.query(seed);
      console.log('🌱 Datos de ejemplo cargados (productos, franjas, premios).');
    } else {
      console.log(`ℹ️  Ya hay ${productCount} productos cargados, no se repite el seed.`);
    }
  } catch (err) {
    console.error('❌ Error al inicializar la base de datos:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

init();
