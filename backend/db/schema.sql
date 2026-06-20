-- ============================================================
-- ESQUEMA DE BASE DE DATOS - OrderFlow (multi-local)
-- ============================================================
-- A partir de esta version, la base de datos soporta varios locales
-- (hamburgueserias) en la misma instalacion. Cada local se identifica
-- por un "slug" en la URL (ej: tuapp.com/labrasita) y todos sus datos
-- (productos, franjas, pedidos, admins, etc) quedan separados por
-- local_id, sin mezclarse entre negocios.

-- Tabla central: cada fila es un negocio/cliente de la plataforma.
CREATE TABLE IF NOT EXISTS locales (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,          -- identificador en la URL, ej: 'labrasita'
  nombre TEXT NOT NULL,               -- nombre comercial, ej: 'La Brasita Burger'
  store_open BOOLEAN NOT NULL DEFAULT true,
  points_rate INTEGER NOT NULL DEFAULT 100, -- pesos necesarios para sumar 1 punto
  -- Datos de Mercado Pago de ESTE local (no de la plataforma). Se completan
  -- cuando el dueño conecta su cuenta. Mientras esten vacios, el pago con MP
  -- no esta disponible para ese local y se ofrecen los otros medios.
  mp_access_token TEXT DEFAULT NULL,
  mp_user_id TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- Canales de venta (web, presencial, rappi, pedidosya) — uno por local
CREATE TABLE IF NOT EXISTS channels (
  id SERIAL PRIMARY KEY,
  local_id INTEGER NOT NULL REFERENCES locales(id) ON DELETE CASCADE,
  key TEXT NOT NULL,                 -- 'web' | 'presencial' | 'rappi' | 'pedidosya'
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  last_sync TIMESTAMP DEFAULT now(),
  UNIQUE(local_id, key)
);

-- Productos del menu — cada producto pertenece a un local
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  local_id INTEGER NOT NULL REFERENCES locales(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price INTEGER NOT NULL,            -- en pesos argentinos, sin decimales
  category TEXT NOT NULL DEFAULT 'burgers',
  available BOOLEAN NOT NULL DEFAULT true,
  image_url TEXT DEFAULT '',
  emoji TEXT DEFAULT '🍔',
  stock INTEGER NOT NULL DEFAULT 0,
  stock_min INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMP DEFAULT now()
);

-- Franjas horarias — propias de cada local
CREATE TABLE IF NOT EXISTS time_slots (
  id SERIAL PRIMARY KEY,
  local_id INTEGER NOT NULL REFERENCES locales(id) ON DELETE CASCADE,
  start_time TEXT NOT NULL,          -- formato 'HH:MM'
  end_time TEXT NOT NULL,
  max_capacity INTEGER NOT NULL DEFAULT 8,
  used_capacity INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true
);

-- Promociones (descuentos en franjas de baja demanda)
CREATE TABLE IF NOT EXISTS promotions (
  id SERIAL PRIMARY KEY,
  local_id INTEGER NOT NULL REFERENCES locales(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slot_id INTEGER REFERENCES time_slots(id) ON DELETE CASCADE,
  promo_type TEXT NOT NULL,          -- 'pct' | 'dblpts' | 'drink' | 'ship'
  discount_pct INTEGER DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  times_used INTEGER NOT NULL DEFAULT 0
);

-- Premios canjeables con puntos — propios de cada local
CREATE TABLE IF NOT EXISTS rewards (
  id SERIAL PRIMARY KEY,
  local_id INTEGER NOT NULL REFERENCES locales(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  emoji TEXT DEFAULT '🎁',
  points_cost INTEGER NOT NULL
);

-- Clientes: identificados por TELEFONO, unico dentro de cada local.
-- El mismo telefono puede existir en distintos locales como clientes
-- distintos (sus puntos no se mezclan entre negocios).
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  local_id INTEGER NOT NULL REFERENCES locales(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(local_id, phone)
);

-- Pedidos
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  local_id INTEGER NOT NULL REFERENCES locales(id) ON DELETE CASCADE,
  code TEXT NOT NULL,                -- ej. 'BRG-104' (unico DENTRO del local, no global)
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,       -- copia del nombre por si el cliente se borra
  customer_phone TEXT DEFAULT '',
  channel TEXT NOT NULL,             -- 'web' | 'presencial' | 'rappi' | 'pedidosya'
  slot_id INTEGER REFERENCES time_slots(id) ON DELETE SET NULL,
  raw_total INTEGER NOT NULL,
  discount INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  promo_id INTEGER REFERENCES promotions(id) ON DELETE SET NULL,
  payment_method TEXT NOT NULL,      -- 'card' | 'mp' | 'local' | 'rappi' | 'pedidosya'
  payment_status TEXT NOT NULL DEFAULT 'pendiente', -- 'pendiente' | 'aprobado' | 'rechazado'
  status TEXT NOT NULL DEFAULT 'recibido', -- 'recibido' | 'preparando' | 'listo' | 'entregado' | 'cancelado'
  is_delivery BOOLEAN NOT NULL DEFAULT false,
  eta TEXT DEFAULT '',
  points_earned INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(local_id, code)
);

-- Items de cada pedido (relacion N:1 con orders)
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,        -- copia del nombre al momento del pedido
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL
);

-- Metricas operativas acumuladas (contadores simples) — una fila por local
CREATE TABLE IF NOT EXISTS operational_metrics (
  local_id INTEGER PRIMARY KEY REFERENCES locales(id) ON DELETE CASCADE,
  rejected_by_capacity INTEGER NOT NULL DEFAULT 0,
  reassigned_count INTEGER NOT NULL DEFAULT 0
);

-- Usuarios administradores: cada admin pertenece a UN local.
-- Todas sus acciones quedan limitadas a ese local_id automaticamente.
CREATE TABLE IF NOT EXISTS admin_users (
  id SERIAL PRIMARY KEY,
  local_id INTEGER NOT NULL REFERENCES locales(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);
