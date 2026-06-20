// db/init.js
// Crea las tablas (estructura) si no existen. Seguro de correr mas de una vez.
// Uso: npm run init-db
//
// IMPORTANTE: este script ya NO carga datos de ejemplo (eso ahora se hace
// por local, con db/create-local.js). Despues de correr esto, creá tu
// primer local con:
//   node db/create-local.js <slug> <nombre> <usuario_admin> <contraseña>
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
    console.log('   Ahora creá tu primer local con: node db/create-local.js <slug> <nombre> <usuario> <contraseña>');
  } catch (err) {
    console.error('❌ Error al inicializar la base de datos:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

init();
