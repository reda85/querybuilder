import { getObject, universe, type Universe, type UniverseObject } from "./universe";

export type Operator =
  | "="
  | "<>"
  | ">"
  | ">="
  | "<"
  | "<="
  | "IN"
  | "NOT IN"
  | "CONTAINS"
  | "STARTS WITH"
  | "BETWEEN"
  | "IS NULL"
  | "IS NOT NULL";

export const OPERATORS: { value: Operator; label: string; arity: 0 | 1 | 2 | "list" }[] = [
  { value: "=", label: "Égal à", arity: 1 },
  { value: "<>", label: "Différent de", arity: 1 },
  { value: ">", label: "Supérieur à", arity: 1 },
  { value: ">=", label: "Supérieur ou égal à", arity: 1 },
  { value: "<", label: "Inférieur à", arity: 1 },
  { value: "<=", label: "Inférieur ou égal à", arity: 1 },
  { value: "IN", label: "Dans la liste", arity: "list" },
  { value: "NOT IN", label: "Pas dans la liste", arity: "list" },
  { value: "CONTAINS", label: "Contient", arity: 1 },
  { value: "STARTS WITH", label: "Commence par", arity: 1 },
  { value: "BETWEEN", label: "Entre", arity: 2 },
  { value: "IS NULL", label: "Est vide", arity: 0 },
  { value: "IS NOT NULL", label: "N'est pas vide", arity: 0 },
];

export interface Filter {
  id: string;
  objectId: string;
  operator: Operator;
  value: string; // for lists: comma separated
  value2: string; // upper bound for BETWEEN
}

export interface Sort {
  objectId: string;
  direction: "ASC" | "DESC";
}

export interface QuerySpec {
  resultObjects: string[];
  filters: Filter[];
  filterLogic: "AND" | "OR";
  sorts: Sort[];
  limit: number | null;
  distinct: boolean;
}

export interface GeneratedSql {
  sql: string;
  errors: string[];
}

function quote(value: string, obj: UniverseObject): string {
  const v = value.trim();
  if (obj.dataType === "number" && v !== "" && !Number.isNaN(Number(v))) return v;
  return `'${v.replace(/'/g, "''")}'`;
}

function alias(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Find the joins needed to connect every table in `needed`, growing a tree
 * from the first table by breadth-first search over the join graph.
 */
export function resolveJoins(needed: string[], u: Universe = universe) {
  const tables = [...new Set(needed)];
  if (tables.length === 0) return { from: null as string | null, joins: [] as { table: string; on: string }[], error: null as string | null };

  const adjacency = new Map<string, { to: string; on: string }[]>();
  for (const j of u.joins) {
    adjacency.set(j.left, [...(adjacency.get(j.left) ?? []), { to: j.right, on: j.on }]);
    adjacency.set(j.right, [...(adjacency.get(j.right) ?? []), { to: j.left, on: j.on }]);
  }

  const included = new Set([tables[0]]);
  const joins: { table: string; on: string }[] = [];

  for (const target of tables.slice(1)) {
    if (included.has(target)) continue;
    // BFS from the whole included set towards target.
    const prev = new Map<string, { from: string; on: string }>();
    const queue = [...included];
    const seen = new Set(included);
    while (queue.length && !seen.has(target)) {
      const cur = queue.shift()!;
      for (const edge of adjacency.get(cur) ?? []) {
        if (seen.has(edge.to)) continue;
        seen.add(edge.to);
        prev.set(edge.to, { from: cur, on: edge.on });
        queue.push(edge.to);
      }
    }
    if (!seen.has(target)) {
      return { from: tables[0], joins, error: `Aucune jointure ne relie la table « ${target} ».` };
    }
    const path: { table: string; on: string }[] = [];
    let node = target;
    while (!included.has(node)) {
      const p = prev.get(node)!;
      path.unshift({ table: node, on: p.on });
      node = p.from;
    }
    for (const step of path) {
      included.add(step.table);
      joins.push(step);
    }
  }
  return { from: tables[0], joins, error: null };
}

function filterCondition(f: Filter, obj: UniverseObject): string | null {
  const expr = obj.select;
  const list = () =>
    f.value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
      .map((v) => quote(v, obj))
      .join(", ");
  const like = (pattern: string) => `'${pattern.replace(/'/g, "''")}'`;

  switch (f.operator) {
    case "IS NULL":
    case "IS NOT NULL":
      return `${expr} ${f.operator}`;
    case "IN":
    case "NOT IN": {
      const l = list();
      return l ? `${expr} ${f.operator} (${l})` : null;
    }
    case "CONTAINS":
      return f.value.trim() ? `${expr} LIKE ${like(`%${f.value.trim()}%`)}` : null;
    case "STARTS WITH":
      return f.value.trim() ? `${expr} LIKE ${like(`${f.value.trim()}%`)}` : null;
    case "BETWEEN":
      return f.value.trim() && f.value2.trim()
        ? `${expr} BETWEEN ${quote(f.value, obj)} AND ${quote(f.value2, obj)}`
        : null;
    default:
      return f.value.trim() ? `${expr} ${f.operator} ${quote(f.value, obj)}` : null;
  }
}

export function generateSql(spec: QuerySpec, u: Universe = universe): GeneratedSql {
  const errors: string[] = [];
  const results = spec.resultObjects.map(getObject).filter((o): o is UniverseObject => !!o);
  if (results.length === 0) {
    return { sql: "-- Glissez des objets dans « Objets du résultat » pour construire la requête", errors: [] };
  }

  const activeFilters = spec.filters
    .map((f) => ({ f, obj: getObject(f.objectId) }))
    .filter((x): x is { f: Filter; obj: UniverseObject } => !!x.obj)
    .map((x) => ({ ...x, cond: filterCondition(x.f, x.obj) }));
  for (const x of activeFilters) {
    if (!x.cond) errors.push(`Le filtre sur « ${x.obj.name} » est incomplet et sera ignoré.`);
  }
  const conditions = activeFilters.filter((x) => x.cond);

  const sorts = spec.sorts
    .map((s) => ({ s, obj: getObject(s.objectId) }))
    .filter((x): x is { s: Sort; obj: UniverseObject } => !!x.obj);

  const neededTables = [
    ...results.flatMap((o) => o.tables),
    ...conditions.flatMap((x) => x.obj.tables),
    ...sorts.flatMap((x) => x.obj.tables),
  ];
  const { from, joins, error } = resolveJoins(neededTables, u);
  if (error) errors.push(error);

  const hasMeasure = results.some((o) => o.kind === "measure");
  const groupBy = hasMeasure ? results.filter((o) => o.kind !== "measure") : [];

  const where = conditions.filter((x) => x.obj.kind !== "measure").map((x) => x.cond!);
  const having = conditions.filter((x) => x.obj.kind === "measure").map((x) => x.cond!);
  const joiner = `\n  ${spec.filterLogic} `;

  const lines: string[] = [];
  lines.push(`SELECT${spec.distinct && !hasMeasure ? " DISTINCT" : ""}`);
  lines.push(results.map((o) => `  ${o.select} AS ${alias(o.name)}`).join(",\n"));
  lines.push(`FROM ${from}`);
  for (const j of joins) lines.push(`  INNER JOIN ${j.table} ON ${j.on}`);
  if (where.length) lines.push(`WHERE\n  ${where.join(joiner)}`);
  if (groupBy.length || (having.length && !hasMeasure)) {
    const gb = (groupBy.length ? groupBy : results).map((o) => o.select);
    lines.push(`GROUP BY\n  ${gb.join(",\n  ")}`);
  }
  if (having.length) lines.push(`HAVING\n  ${having.join(joiner)}`);
  if (sorts.length) {
    lines.push(
      `ORDER BY\n  ${sorts
        .map(({ s, obj }) => {
          const inResult = results.includes(obj);
          return `${inResult ? alias(obj.name) : obj.select} ${s.direction}`;
        })
        .join(",\n  ")}`,
    );
  }
  if (spec.limit && spec.limit > 0) lines.push(`LIMIT ${Math.floor(spec.limit)}`);

  return { sql: lines.join("\n"), errors };
}
