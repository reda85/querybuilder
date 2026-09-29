import "server-only";
import { DatabaseSync } from "node:sqlite";
import { schemaDDL, universe } from "./universe";

// In-memory demo database, seeded deterministically so results are stable
// across restarts. Replace this module to point the app at a real database.

let db: DatabaseSync | null = null;

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const FIRST = ["Camille", "Louis", "Emma", "Hugo", "Léa", "Lucas", "Chloé", "Nathan", "Inès", "Jules", "Sarah", "Adam", "Manon", "Yanis", "Lina", "Karim", "Sofia", "Omar", "Julie", "Thomas"];
const LAST = ["Martin", "Bernard", "Dubois", "Durand", "Lefebvre", "Moreau", "Laurent", "Simon", "Michel", "Garcia", "Benali", "Roux", "Fournier", "Girard", "Bonnet", "Mercier", "Haddad", "Lambert"];
const PLACES: [string, string][] = [
  ["France", "Paris"], ["France", "Lyon"], ["France", "Marseille"], ["France", "Lille"], ["France", "Bordeaux"],
  ["Belgique", "Bruxelles"], ["Belgique", "Liège"], ["Suisse", "Genève"], ["Suisse", "Lausanne"],
  ["Maroc", "Casablanca"], ["Maroc", "Rabat"], ["Canada", "Montréal"], ["Canada", "Québec"],
];
const SEGMENTS = ["Particulier", "Particulier", "Particulier", "Professionnel", "VIP"];
const CATALOG: [string, string, string, number][] = [
  ["T-shirt coton bio", "Vêtements", "Hauts", 19.9],
  ["Chemise lin", "Vêtements", "Hauts", 49.0],
  ["Pull mérinos", "Vêtements", "Hauts", 79.0],
  ["Jean slim", "Vêtements", "Bas", 59.0],
  ["Chino", "Vêtements", "Bas", 45.0],
  ["Short de bain", "Vêtements", "Bas", 29.0],
  ["Veste en jean", "Vêtements", "Manteaux", 89.0],
  ["Parka", "Vêtements", "Manteaux", 169.0],
  ["Baskets cuir", "Chaussures", "Sport", 99.0],
  ["Running", "Chaussures", "Sport", 119.0],
  ["Mocassins", "Chaussures", "Ville", 129.0],
  ["Bottines", "Chaussures", "Ville", 149.0],
  ["Sac cabas", "Accessoires", "Sacs", 69.0],
  ["Sac à dos", "Accessoires", "Sacs", 59.0],
  ["Ceinture cuir", "Accessoires", "Petite maroquinerie", 35.0],
  ["Portefeuille", "Accessoires", "Petite maroquinerie", 39.0],
  ["Casquette", "Accessoires", "Chapeaux", 22.0],
  ["Bonnet laine", "Accessoires", "Chapeaux", 25.0],
];
const STATUSES = ["Livrée", "Livrée", "Livrée", "Livrée", "Expédiée", "En attente", "Annulée"];
const CHANNELS = ["Web", "Web", "Mobile", "Magasin"];

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function seed(d: DatabaseSync) {
  const r = rng(42);
  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)];

  d.exec("BEGIN");
  const insC = d.prepare("INSERT INTO customers VALUES (?, ?, ?, ?, ?, ?, ?)");
  for (let i = 1; i <= 120; i++) {
    const first = pick(FIRST);
    const last = pick(LAST);
    const [country, city] = pick(PLACES);
    const created = new Date(Date.UTC(2022, 0, 1) + Math.floor(r() * 900) * 86400000);
    insC.run(i, `${first} ${last}`, `${first}.${last}${i}@example.com`.toLowerCase(), country, city, pick(SEGMENTS), iso(created));
  }

  const insP = d.prepare("INSERT INTO products VALUES (?, ?, ?, ?, ?)");
  CATALOG.forEach(([name, cat, sub, price], i) => insP.run(i + 1, name, cat, sub, price));

  const insO = d.prepare("INSERT INTO orders VALUES (?, ?, ?, ?, ?)");
  const insI = d.prepare("INSERT INTO order_items VALUES (?, ?, ?, ?, ?, ?)");
  let itemId = 1;
  for (let o = 1; o <= 1500; o++) {
    const date = new Date(Date.UTC(2023, 0, 1) + Math.floor(r() * 1000) * 86400000);
    insO.run(o, 1 + Math.floor(r() * 120), iso(date), pick(STATUSES), pick(CHANNELS));
    const lines = 1 + Math.floor(r() * 4);
    for (let l = 0; l < lines; l++) {
      const p = Math.floor(r() * CATALOG.length);
      const discount = r() < 0.7 ? 0 : pick([0.05, 0.1, 0.15, 0.2, 0.3]);
      insI.run(itemId++, o, p + 1, 1 + Math.floor(r() * 3), CATALOG[p][3], discount);
    }
  }
  d.exec("COMMIT");
}

export function getDb(): DatabaseSync {
  if (!db) {
    db = new DatabaseSync(":memory:");
    db.exec(schemaDDL(universe));
    seed(db);
  }
  return db;
}

const MAX_ROWS = 1000;

export function runReadOnlyQuery(sql: string) {
  const cleaned = sql.trim().replace(/;\s*$/, "");
  if (!/^(select|with)\b/i.test(cleaned)) {
    throw new Error("Seules les requêtes SELECT (ou WITH … SELECT) sont autorisées.");
  }
  if (cleaned.includes(";")) {
    throw new Error("Une seule instruction SQL est autorisée.");
  }
  const stmt = getDb().prepare(cleaned);
  const columns = stmt.columns().map((c) => c.name);
  const rows: unknown[][] = [];
  let truncated = false;
  for (const row of stmt.iterate() as Iterable<Record<string, unknown>>) {
    if (rows.length >= MAX_ROWS) {
      truncated = true;
      break;
    }
    rows.push(columns.map((c) => row[c]));
  }
  return { columns, rows, truncated };
}

/** Distinct values of low-cardinality text columns, to ground the AI assistant. */
export function sampleValues(): string {
  const d = getDb();
  const cols: [string, string][] = [
    ["customers", "country"],
    ["customers", "city"],
    ["customers", "segment"],
    ["products", "category"],
    ["products", "subcategory"],
    ["orders", "status"],
    ["orders", "channel"],
  ];
  const lines = cols.map(([t, c]) => {
    const vals = d
      .prepare(`SELECT DISTINCT ${c} AS v FROM ${t} ORDER BY 1`)
      .all()
      .map((r) => String((r as { v: unknown }).v));
    return `${t}.${c}: ${vals.join(", ")}`;
  });
  const range = d.prepare("SELECT MIN(order_date) AS a, MAX(order_date) AS b FROM orders").get() as { a: string; b: string };
  lines.push(`orders.order_date: de ${range.a} à ${range.b}`);
  return lines.join("\n");
}
