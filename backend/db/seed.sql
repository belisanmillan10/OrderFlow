-- ============================================================
-- DATOS INICIALES (seed) de productos, franjas y premios.
-- ============================================================
-- Este archivo se corre UNA SOLA VEZ, controlado por codigo en server.js
-- (que verifica si la tabla "products" esta vacia antes de ejecutarlo).
-- No usar ON CONFLICT aca: las tablas no tienen una columna UNIQUE real
-- para detectar duplicados, asi que repetir este archivo crearia copias.

INSERT INTO products (name, description, price, category, available, emoji, stock, stock_min) VALUES
  ('La Clásica', 'Cheddar, lechuga, tomate, mayonesa', 2500, 'burgers', true, '🍔', 18, 5),
  ('BBQ Crispy', 'Panceta, cebolla caramelizada, BBQ', 2900, 'burgers', true, '🥩', 12, 3),
  ('Doble Inferno', 'Doble medallón, jalapeño, picante', 3400, 'burgers', false, '🔥', 0, 3),
  ('Veggie Power', 'Medallón de garbanzos, hummus, rúcula', 2600, 'burgers', true, '🥦', 8, 3),
  ('Combo Clásico', 'Hamburguesa + papas + bebida', 3800, 'combos', true, '🍱', 10, 3),
  ('Coca-Cola', 'Lata 354ml', 600, 'bebidas', true, '🥤', 30, 8),
  ('Agua Mineral', '500ml con o sin gas', 400, 'bebidas', true, '💧', 25, 8),
  ('Papas fritas', 'Porción grande con dip', 900, 'extras', true, '🍟', 15, 4),
  ('Onion rings', 'Anillos crocantes', 850, 'extras', false, '🧅', 0, 3),
  ('Brownie', 'Con helado de vainilla', 1100, 'postres', true, '🍫', 7, 2);

INSERT INTO time_slots (start_time, end_time, max_capacity, used_capacity, active) VALUES
  ('18:00', '18:15', 8, 1, true),
  ('18:15', '18:30', 8, 2, true),
  ('19:00', '19:15', 8, 6, true),
  ('19:15', '19:30', 8, 7, true),
  ('20:00', '20:15', 10, 8, true),
  ('20:15', '20:30', 10, 10, true),
  ('20:30', '20:45', 8, 3, true),
  ('21:00', '21:15', 8, 0, false);

INSERT INTO rewards (name, emoji, points_cost) VALUES
  ('Papas chicas', '🍟', 500),
  ('Bebida gratis', '🥤', 350),
  ('10% de descuento', '🏷️', 700),
  ('Combo especial', '🍱', 1200);
