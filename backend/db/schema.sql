-- ============================================================
-- ESQUEMA DE BASE DE DATOS - OrderFlow
-- ============================================================
-- Cada tabla corresponde a una parte de lo que antes vivia en
-- el objeto STATE de localStorage. Ahora es una sola copia
-- compartida por todos los que usan la app.

-- Configuracion general del local (un solo registro, fila id=1)
CREATE TABLE IF NOT EXISTS store_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  store_open BOOLEAN NOT NULL DEFAULT true,
  points_rate INTEGER NOT NULL DEFAULT 100, -- pesos necesarios para sumar 1 punto
  local_name TEXT NOT NULL DEFAULT 'La Brasita Burger',
  CONSTRAINT single_row CHECK (id = 1)
);

-- Canales de venta (web, presencial, rappi, pedidosya)
CREATE TABLE IF NOT EXISTS channels (
  key TEXT PRIMARY KEY,             -- 'web' | 'presencial' | 'rappi' | 'pedidosya'
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  last_sync TIMESTAMP DEFAULT now()
);

-- Productos del menu
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
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

-- Franjas horarias
CREATE TABLE IF NOT EXISTS time_slots (
  id SERIAL PRIMARY KEY,
  start_time TEXT NOT NULL,          -- formato 'HH:MM'
  end_time TEXT NOT NULL,
  max_capacity INTEGER NOT NULL DEFAULT 8,
  used_capacity INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true
);

-- Promociones (descuentos en franjas de baja demanda)
CREATE TABLE IF NOT EXISTS promotions (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slot_id INTEGER REFERENCES time_slots(id) ON DELETE CASCADE,
  promo_type TEXT NOT NULL,          -- 'pct' | 'dblpts' | 'drink' | 'ship'
  discount_pct INTEGER DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  times_used INTEGER NOT NULL DEFAULT 0
);

-- Premios canjeables con puntos
CREATE TABLE IF NOT EXISTS rewards (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT DEFAULT '🎁',
  points_cost INTEGER NOT NULL
);

-- Clientes (simplificado: identificados por nombre + telefono opcional)
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  points INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT now()
);

-- Pedidos
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,         -- ej. 'BRG-104'
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,       -- copia del nombre por si el cliente se borra
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
  created_at TIMESTAMP DEFAULT now()
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

-- Metricas operativas acumuladas (contadores simples)
CREATE TABLE IF NOT EXISTS operational_metrics (
  id INTEGER PRIMARY KEY DEFAULT 1,
  rejected_by_capacity INTEGER NOT NULL DEFAULT 0,
  reassigned_count INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT single_row_metrics CHECK (id = 1)
);

-- Usuarios administradores (login del panel privado)
CREATE TABLE IF NOT EXISTS admin_users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- store_settings y operational_metrics son tablas de una sola fila (id=1),
-- asi que es seguro insertarlas siempre con ON CONFLICT DO NOTHING: nunca
-- se duplican porque "id" es PRIMARY KEY.
INSERT INTO store_settings (id, store_open, points_rate, local_name)
VALUES (1, true, 100, 'La Brasita Burger')
ON CONFLICT (id) DO NOTHING;

INSERT INTO operational_metrics (id, rejected_by_capacity, reassigned_count)
VALUES (1, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- "channels" tiene "key" como PRIMARY KEY, asi que tambien es seguro repetir.
INSERT INTO channels (key, name, active, last_sync) VALUES
  ('web', 'Web / QR', true, now()),
  ('presencial', 'Presencial', true, now()),
  ('rappi', 'Rappi', true, now()),
  ('pedidosya', 'PedidosYa', true, now())
ON CONFLICT (key) DO NOTHING;

-- IMPORTANTE: los datos de ejemplo de productos, franjas y premios NO estan
-- aca, porque esas tablas usan "id SERIAL" sin restriccion UNIQUE real, lo
-- que hace que "ON CONFLICT DO NOTHING" no detecte duplicados y los vuelva
-- a insertar cada vez que el servidor arranca. Ese seed vive en seed.sql y
-- el codigo (server.js) lo corre una sola vez, verificando primero si la
-- tabla esta vacia.
