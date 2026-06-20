// db/pool.js
// Conexion compartida a PostgreSQL. Todos los archivos de rutas importan
// este mismo "pool" en vez de abrir una conexion nueva cada vez.
require('dotenv').config();
const { Pool } = require('pg');

// Diagnostico temporal: confirma si la variable de entorno realmente
// esta llegando al proceso. Una vez que funcione, se puede borrar este log.
if (!process.env.DATABASE_URL) {
  console.error('⚠️  DATABASE_URL no está definida en las variables de entorno.');
  console.error('   Variables disponibles que contienen "DATA" o "POSTGRES":',
    Object.keys(process.env).filter((k) => /DATA|POSTGRES|PG/i.test(k)));
} else {
  // Mostramos solo el host (no el password) para confirmar a que DB se conecta
  try {
    const safeUrl = process.env.DATABASE_URL.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@');
    console.log('🔌 Conectando con DATABASE_URL:', safeUrl);
  } catch (e) {
    console.log('🔌 DATABASE_URL está definida (no se pudo enmascarar para mostrar).');
  }
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Railway y la mayoria de hostings de Postgres requieren SSL.
  // En tu compu local probablemente NO lo necesites, por eso lo hacemos condicional.
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')
    ? { rejectUnauthorized: false }
    : false,
});

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL:', err);
});

module.exports = pool;
