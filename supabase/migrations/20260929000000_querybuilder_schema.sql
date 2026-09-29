-- Généré par scripts/generate-supabase-sql.mjs — ne pas modifier à la main.
-- Schéma de l'univers « Ventes eFashion ».

-- Clients de la boutique
CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  name TEXT, -- Nom complet du client
  email TEXT,
  country TEXT,
  city TEXT,
  segment TEXT, -- Particulier, Professionnel ou VIP
  created_at DATE -- Date d'inscription (YYYY-MM-DD)
);

-- Catalogue produits
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  name TEXT,
  category TEXT,
  subcategory TEXT,
  unit_price NUMERIC(10, 2) -- Prix catalogue en euros
);

-- En-têtes de commande
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id),
  order_date DATE, -- Date de commande (YYYY-MM-DD)
  status TEXT, -- Livrée, Expédiée, En attente, Annulée
  channel TEXT -- Web, Mobile ou Magasin
);

-- Lignes de commande
CREATE TABLE order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  product_id INTEGER REFERENCES products(id),
  quantity INTEGER,
  unit_price NUMERIC(10, 2), -- Prix unitaire facturé en euros
  discount NUMERIC(10, 2) -- Remise entre 0 et 1
);

CREATE INDEX ON orders (customer_id);
CREATE INDEX ON orders (order_date);
CREATE INDEX ON order_items (order_id);
CREATE INDEX ON order_items (product_id);

-- Tables non exposées par l'API REST de Supabase : RLS activé, aucune policy pour anon/authenticated.
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Rôle en lecture seule utilisé par l'application (DATABASE_URL).
-- Il n'a pas de mot de passe tant que vous n'en définissez pas un :
--   ALTER ROLE querybuilder_ro WITH PASSWORD '<mot-de-passe-fort>';
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'querybuilder_ro') THEN
    CREATE ROLE querybuilder_ro LOGIN NOINHERIT;
  END IF;
END
$$;
ALTER ROLE querybuilder_ro SET default_transaction_read_only = on;
ALTER ROLE querybuilder_ro SET statement_timeout = '10s';
GRANT USAGE ON SCHEMA public TO querybuilder_ro;
GRANT SELECT ON customers TO querybuilder_ro;
CREATE POLICY "querybuilder_ro read" ON customers FOR SELECT TO querybuilder_ro USING (true);
GRANT SELECT ON products TO querybuilder_ro;
CREATE POLICY "querybuilder_ro read" ON products FOR SELECT TO querybuilder_ro USING (true);
GRANT SELECT ON orders TO querybuilder_ro;
CREATE POLICY "querybuilder_ro read" ON orders FOR SELECT TO querybuilder_ro USING (true);
GRANT SELECT ON order_items TO querybuilder_ro;
CREATE POLICY "querybuilder_ro read" ON order_items FOR SELECT TO querybuilder_ro USING (true);
