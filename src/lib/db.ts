import "server-only";
import type { DatabaseSync } from "node:sqlite";
import type { Pool } from "pg";
import { generateDemoData } from "./demoData";
import { schemaDDL, universe, type Dialect } from "./universe";

// Two backends behind one read-only API:
// - PostgreSQL (e.g. Supabase) when DATABASE_URL is set;
// - otherwise an in-memory SQLite database seeded with the demo data.

export interface QueryRows {
  columns: string[];
  rows: unknown[][];
  truncated: boolean;
}

const MAX_ROWS = 1000;

export const dialect: Dialect = process.env.DATABASE_URL ? "postgres" : "sqlite";

function checkReadOnly(sql: string): string {
  const cleaned = sql.trim().replace(/;\s*$/, "");
  if (!/^(select|with)\b/i.test(cleaned)) {
    throw new Error("Seules les requêtes SELECT (ou WITH … SELECT) sont autorisées.");
  }
  if (cleaned.includes(";")) {
    throw new Error("Une seule instruction SQL est autorisée.");
  }
  return cleaned;
}

/* ----------------------------- SQLite ----------------------------- */

let sqlite: DatabaseSync | null = null;

async function getSqlite(): Promise<DatabaseSync> {
  if (!sqlite) {
    const { DatabaseSync } = await import("node:sqlite");
    const d = new DatabaseSync(":memory:");
    d.exec(schemaDDL(universe, "sqlite"));
    const data = generateDemoData();
    d.exec("BEGIN");
    for (const [table, rows] of Object.entries(data)) {
      if (!rows.length) continue;
      const stmt = d.prepare(`INSERT INTO ${table} VALUES (${rows[0].map(() => "?").join(", ")})`);
      for (const row of rows) stmt.run(...row);
    }
    d.exec("COMMIT");
    sqlite = d;
  }
  return sqlite;
}

async function sqliteQuery(sql: string): Promise<QueryRows> {
  const stmt = (await getSqlite()).prepare(sql);
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

/* ---------------------------- PostgreSQL --------------------------- */

let pool: Pool | null = null;

async function getPool(): Promise<Pool> {
  if (!pool) {
    const pg = (await import("pg")).default;
    // Return numbers as numbers (COUNT is bigint, ROUND/SUM on NUMERIC is numeric)
    // and dates as plain YYYY-MM-DD strings, like SQLite does.
    pg.types.setTypeParser(pg.types.builtins.INT8, Number);
    pg.types.setTypeParser(pg.types.builtins.NUMERIC, Number);
    pg.types.setTypeParser(pg.types.builtins.DATE, (v: string) => v);

    // sslmode in the URL would override the `ssl` option below, so drop it.
    const url = new URL(process.env.DATABASE_URL!);
    url.searchParams.delete("sslmode");
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    const ca = process.env.DATABASE_CA_CERT;

    pool = new pg.Pool({
      connectionString: url.toString(),
      max: 3,
      idleTimeoutMillis: 10_000,
      // Supabase requires TLS. Its certificate is signed by Supabase's own CA:
      // set DATABASE_CA_CERT (the PEM from the dashboard) to verify it.
      ssl: local ? undefined : ca ? { ca } : { rejectUnauthorized: false },
    });
  }
  return pool;
}

async function postgresQuery(sql: string): Promise<QueryRows> {
  const client = await (await getPool()).connect();
  try {
    // Defence in depth on top of the read-only database role.
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '10s'");
    const res = await client.query({
      text: `SELECT * FROM (\n${sql}\n) AS q LIMIT ${MAX_ROWS + 1}`,
      rowMode: "array",
    });
    await client.query("ROLLBACK");
    const rows = res.rows as unknown[][];
    return { columns: res.fields.map((f) => f.name), rows: rows.slice(0, MAX_ROWS), truncated: rows.length > MAX_ROWS };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/* ------------------------------ API ------------------------------- */

export async function runReadOnlyQuery(sql: string): Promise<QueryRows> {
  const cleaned = checkReadOnly(sql);
  return dialect === "postgres" ? postgresQuery(cleaned) : sqliteQuery(cleaned);
}

let sampleCache: string | null = null;

/** Distinct values of low-cardinality text columns, to ground the AI assistant. */
export async function sampleValues(): Promise<string> {
  if (sampleCache) return sampleCache;
  const cols: [string, string][] = [
    ["customers", "country"],
    ["customers", "city"],
    ["customers", "segment"],
    ["products", "category"],
    ["products", "subcategory"],
    ["orders", "status"],
    ["orders", "channel"],
  ];
  const lines: string[] = [];
  for (const [t, c] of cols) {
    const { rows } = await runReadOnlyQuery(`SELECT DISTINCT ${c} FROM ${t} ORDER BY 1`);
    lines.push(`${t}.${c}: ${rows.map((r) => String(r[0])).join(", ")}`);
  }
  const { rows } = await runReadOnlyQuery("SELECT MIN(order_date), MAX(order_date) FROM orders");
  lines.push(`orders.order_date: de ${rows[0][0]} à ${rows[0][1]}`);
  sampleCache = lines.join("\n");
  return sampleCache;
}
