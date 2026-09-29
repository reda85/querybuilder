// Generates the Supabase migration (schema + read-only role) and seed data from
// src/lib/universe.ts and src/lib/demoData.ts, so Supabase holds exactly the
// same database as the local SQLite demo.
//
// Usage: npm run db:generate   (Node >= 22.18, which runs .ts files natively)

import { mkdirSync, writeFileSync } from "node:fs";
import { schemaDDL, universe } from "../src/lib/universe.ts";
import { generateDemoData } from "../src/lib/demoData.ts";

const ROLE = "querybuilder_ro";
const tables = universe.tables.map((t) => t.name);

const literal = (v) => (typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

const migration = `-- Généré par scripts/generate-supabase-sql.mjs — ne pas modifier à la main.
-- Schéma de l'univers « ${universe.name} ».

${schemaDDL(universe, "postgres")}

CREATE INDEX ON orders (customer_id);
CREATE INDEX ON orders (order_date);
CREATE INDEX ON order_items (order_id);
CREATE INDEX ON order_items (product_id);

-- Tables non exposées par l'API REST de Supabase : RLS activé, aucune policy pour anon/authenticated.
${tables.map((t) => `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`).join("\n")}

-- Rôle en lecture seule utilisé par l'application (DATABASE_URL).
-- Il n'a pas de mot de passe tant que vous n'en définissez pas un :
--   ALTER ROLE ${ROLE} WITH PASSWORD '<mot-de-passe-fort>';
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${ROLE}') THEN
    CREATE ROLE ${ROLE} LOGIN NOINHERIT;
  END IF;
END
$$;
ALTER ROLE ${ROLE} SET default_transaction_read_only = on;
ALTER ROLE ${ROLE} SET statement_timeout = '10s';
GRANT USAGE ON SCHEMA public TO ${ROLE};
${tables.map((t) => `GRANT SELECT ON ${t} TO ${ROLE};\nCREATE POLICY "${ROLE} read" ON ${t} FOR SELECT TO ${ROLE} USING (true);`).join("\n")}
`;

const data = generateDemoData();
const chunks = [];
for (const t of tables) {
  const rows = data[t];
  for (let i = 0; i < rows.length; i += 500) {
    const values = rows.slice(i, i + 500).map((r) => `(${r.map(literal).join(", ")})`);
    chunks.push(`INSERT INTO ${t} VALUES\n${values.join(",\n")};`);
  }
}
const seed = `-- Généré par scripts/generate-supabase-sql.mjs — ne pas modifier à la main.
-- Données de démonstration (${tables.map((t) => `${data[t].length} ${t}`).join(", ")}).

BEGIN;
TRUNCATE ${[...tables].reverse().join(", ")};
${chunks.join("\n\n")}
COMMIT;
`;

mkdirSync("supabase/migrations", { recursive: true });
writeFileSync("supabase/migrations/20260929000000_querybuilder_schema.sql", migration);
writeFileSync("supabase/seed.sql", seed);
console.log("supabase/migrations/20260929000000_querybuilder_schema.sql, supabase/seed.sql écrits.");
