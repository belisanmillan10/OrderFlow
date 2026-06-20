// db/create-admin.js
// Crea (o actualiza la contraseña de) un usuario administrador.
// Uso desde la Console de Railway:
//   node db/create-admin.js TU_USUARIO TU_CONTRASEÑA
//
// Ejemplo:
//   node db/create-admin.js belisanmillan miClaveSegura123
//
// La contraseña se guarda siempre hasheada (nunca en texto plano).
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./pool');

async function createAdmin() {
  const username = process.argv[2];
  const password = process.argv[3];

  if (!username || !password) {
    console.error('❌ Uso: node db/create-admin.js <usuario> <contraseña>');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('❌ La contraseña debe tener al menos 8 caracteres.');
    process.exit(1);
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO admin_users (username, password_hash)
       VALUES ($1, $2)
       ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash
       RETURNING id, username`,
      [username, passwordHash]
    );
    console.log(`✅ Usuario administrador listo: ${result.rows[0].username} (id: ${result.rows[0].id})`);
    console.log('   Ya podés usar este usuario y contraseña para entrar a /admin.html');
  } catch (err) {
    console.error('❌ Error al crear el administrador:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

createAdmin();
