"use client";

import { useMemo, useState, type DragEvent, type ReactNode } from "react";
import { getObject, universe, type UniverseObject } from "@/lib/universe";
import { generateSql, OPERATORS, resolveJoins, type Filter, type Operator, type QuerySpec } from "@/lib/sqlGenerator";
import { ObjectIcon } from "./ObjectIcon";
import { ResultsTable, runQuery, type QueryResult } from "./ResultsTable";

const MIME = "application/x-qb";

type DragPayload = { source: "tree"; objectId: string } | { source: "result"; index: number };

function setPayload(e: DragEvent, p: DragPayload) {
  e.dataTransfer.setData(MIME, JSON.stringify(p));
  e.dataTransfer.setData("text/plain", p.source === "tree" ? p.objectId : String(p.index));
  e.dataTransfer.effectAllowed = "copyMove";
}

function readPayload(e: DragEvent): DragPayload | null {
  try {
    return JSON.parse(e.dataTransfer.getData(MIME));
  } catch {
    return null;
  }
}

let nextId = 1;
const newFilter = (objectId: string): Filter => ({
  id: `f${nextId++}`,
  objectId,
  operator: getObject(objectId)?.kind === "measure" ? ">" : "=",
  value: "",
  value2: "",
});

const initialSpec: QuerySpec = {
  resultObjects: ["commande.annee", "produit.categorie", "ventes.ca"],
  filters: [],
  filterLogic: "AND",
  sorts: [{ objectId: "commande.annee", direction: "ASC" }],
  limit: null,
  distinct: false,
};

/* ------------------------------------------------------------------ */

function UniverseTree({ onAdd }: { onAdd: (id: string) => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(universe.classes.map((c) => [c.id, true])),
  );
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-slate-200 p-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un objet…"
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-sky-500"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1.5 text-sm">
        {universe.classes.map((cls) => {
          const objects = cls.objects.filter((o) => !q || o.name.toLowerCase().includes(q));
          if (!objects.length) return null;
          const isOpen = open[cls.id] || !!q;
          return (
            <div key={cls.id}>
              <button
                onClick={() => setOpen((s) => ({ ...s, [cls.id]: !s[cls.id] }))}
                className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left font-medium text-slate-800 hover:bg-slate-100"
              >
                <span className="w-3 text-[10px] text-slate-500">{isOpen ? "▼" : "▶"}</span>
                <span className="text-amber-500">📁</span>
                {cls.name}
              </button>
              {isOpen && (
                <ul className="ml-5 border-l border-dotted border-slate-300 pl-1">
                  {objects.map((o) => (
                    <li
                      key={o.id}
                      draggable
                      onDragStart={(e) => setPayload(e, { source: "tree", objectId: o.id })}
                      onDoubleClick={() => onAdd(o.id)}
                      title={`${o.select}\n(double-clic ou glisser-déposer)`}
                      className="flex cursor-grab items-center gap-2 rounded px-1.5 py-0.5 text-slate-700 hover:bg-sky-50 active:cursor-grabbing"
                    >
                      <ObjectIcon kind={o.kind} />
                      {o.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 border-t border-slate-200 px-2 py-1.5 text-[11px] text-slate-500">
        <span className="flex items-center gap-1"><ObjectIcon kind="dimension" /> Dimension</span>
        <span className="flex items-center gap-1"><ObjectIcon kind="measure" /> Indicateur</span>
        <span className="flex items-center gap-1"><ObjectIcon kind="detail" /> Information</span>
      </div>
    </div>
  );
}

function DropZone({
  title,
  hint,
  onDropPayload,
  children,
  actions,
  className = "",
}: {
  title: string;
  hint: string;
  onDropPayload: (p: DragPayload) => void;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const [over, setOver] = useState(false);
  return (
    <section className={`flex min-h-0 flex-col rounded border border-slate-300 bg-white ${className}`}>
      <header className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100 px-2.5 py-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</h3>
        {actions}
      </header>
      <div
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(MIME)) {
            e.preventDefault();
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const p = readPayload(e);
          if (p) onDropPayload(p);
        }}
        className={`min-h-0 flex-1 overflow-auto p-2 transition-colors ${over ? "bg-sky-50 ring-2 ring-inset ring-sky-400" : ""}`}
      >
        {children}
        <p className="mt-1 text-center text-xs italic text-slate-400">{hint}</p>
      </div>
    </section>
  );
}

function FilterRow({
  filter,
  obj,
  onChange,
  onRemove,
}: {
  filter: Filter;
  obj: UniverseObject;
  onChange: (f: Filter) => void;
  onRemove: () => void;
}) {
  const [lov, setLov] = useState<string[] | null>(null);
  const arity = OPERATORS.find((o) => o.value === filter.operator)?.arity ?? 1;
  const listId = `lov-${filter.id}`;

  const loadLov = async () => {
    if (lov || obj.kind === "measure") return;
    const { from, joins } = resolveJoins(obj.tables);
    const sql = `SELECT DISTINCT ${obj.select} FROM ${from} ${joins.map((j) => `INNER JOIN ${j.table} ON ${j.on}`).join(" ")} ORDER BY 1 LIMIT 200`;
    try {
      const r = await runQuery(sql);
      setLov(r.rows.map((row) => String(row[0])));
    } catch {
      setLov([]);
    }
  };

  const input = (key: "value" | "value2", placeholder: string) => (
    <input
      value={filter[key]}
      onFocus={loadLov}
      onChange={(e) => onChange({ ...filter, [key]: e.target.value })}
      list={arity === "list" ? undefined : listId}
      type={obj.dataType === "date" ? "date" : "text"}
      placeholder={placeholder}
      className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm outline-none focus:border-sky-500"
    />
  );

  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-1.5 rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
      <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
        <ObjectIcon kind={obj.kind} /> {obj.name}
      </span>
      <select
        value={filter.operator}
        onChange={(e) => onChange({ ...filter, operator: e.target.value as Operator })}
        className="rounded border border-slate-300 bg-white px-1.5 py-1 text-sm"
      >
        {OPERATORS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {arity === 1 && input("value", "Valeur")}
      {arity === "list" && input("value", "val1, val2, …")}
      {arity === 2 && (
        <>
          {input("value", "De")}
          <span className="text-xs text-slate-500">et</span>
          {input("value2", "À")}
        </>
      )}
      {arity === "list" && lov && lov.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            const cur = filter.value.split(",").map((v) => v.trim()).filter(Boolean);
            if (!cur.includes(e.target.value)) onChange({ ...filter, value: [...cur, e.target.value].join(", ") });
          }}
          className="max-w-36 rounded border border-slate-300 bg-white px-1.5 py-1 text-sm"
        >
          <option value="">+ Valeur…</option>
          {lov.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      )}
      <datalist id={listId}>{lov?.map((v) => <option key={v} value={v} />)}</datalist>
      <button onClick={onRemove} title="Supprimer le filtre" className="ml-auto rounded px-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
        ✕
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function QueryBuilder() {
  const [spec, setSpec] = useState<QuerySpec>(initialSpec);
  const [tab, setTab] = useState<"results" | "sql">("sql");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [customSql, setCustomSql] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generated = useMemo(() => generateSql(spec), [spec]);
  const sql = customSql ?? generated.sql;

  const update = (patch: Partial<QuerySpec>) => {
    setSpec((s) => ({ ...s, ...patch }));
    setCustomSql(null);
  };

  const addResult = (id: string, at?: number) => {
    setSpec((s) => {
      const list = s.resultObjects.filter((x) => x !== id);
      list.splice(at ?? list.length, 0, id);
      return { ...s, resultObjects: list };
    });
    setCustomSql(null);
  };

  const moveResult = (from: number, to: number) => {
    setSpec((s) => {
      const list = [...s.resultObjects];
      const [item] = list.splice(from, 1);
      list.splice(to > from ? to - 1 : to, 0, item);
      return { ...s, resultObjects: list };
    });
    setCustomSql(null);
  };

  const execute = async () => {
    setRunning(true);
    setError(null);
    try {
      setResult(await runQuery(sql));
      setTab("results");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
      setTab("results");
    } finally {
      setRunning(false);
    }
  };

  const clearAll = () => {
    update({ resultObjects: [], filters: [], sorts: [], limit: null, distinct: false });
    setResult(null);
    setError(null);
  };

  const canRun = spec.resultObjects.length > 0 || customSql !== null;

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-2 p-2 lg:grid-cols-[280px_1fr]">
      {/* Universe outline */}
      <aside className="flex min-h-64 flex-col overflow-hidden rounded border border-slate-300 bg-white lg:min-h-0">
        <header className="border-b border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100 px-2.5 py-1.5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Univers</h2>
          <p className="text-sm font-medium text-slate-800">{universe.name}</p>
        </header>
        <UniverseTree onAdd={(id) => addResult(id)} />
      </aside>

      {/* Query panel */}
      <div className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-2">
        <div className="grid gap-2 md:grid-cols-[2fr_1fr]">
          <DropZone
            title="Objets du résultat"
            hint="Glissez ici des dimensions, indicateurs ou informations"
            onDropPayload={(p) => (p.source === "tree" ? addResult(p.objectId) : moveResult(p.index, spec.resultObjects.length))}
            className="min-h-28"
            actions={
              <button onClick={clearAll} className="text-xs text-slate-500 hover:text-red-600">
                Tout effacer
              </button>
            }
          >
            <div className="flex flex-wrap gap-1.5">
              {spec.resultObjects.map((id, i) => {
                const o = getObject(id);
                if (!o) return null;
                return (
                  <span
                    key={id}
                    draggable
                    onDragStart={(e) => setPayload(e, { source: "result", index: i })}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const p = readPayload(e);
                      if (!p) return;
                      if (p.source === "tree") addResult(p.objectId, i);
                      else moveResult(p.index, i);
                    }}
                    className={`flex cursor-grab items-center gap-1.5 rounded border py-0.5 pl-2 pr-1 text-sm shadow-sm ${
                      o.kind === "measure"
                        ? "border-orange-300 bg-orange-50"
                        : o.kind === "detail"
                          ? "border-emerald-300 bg-emerald-50"
                          : "border-sky-300 bg-sky-50"
                    }`}
                  >
                    <ObjectIcon kind={o.kind} />
                    {o.name}
                    <button
                      onClick={() => update({ resultObjects: spec.resultObjects.filter((x) => x !== id) })}
                      className="rounded px-1 text-slate-400 hover:text-red-600"
                      title="Retirer"
                    >
                      ✕
                    </button>
                  </span>
                );
              })}
            </div>
          </DropZone>

          <DropZone
            title="Tri"
            hint="Glissez un objet pour trier"
            onDropPayload={(p) => {
              const id = p.source === "tree" ? p.objectId : spec.resultObjects[p.index];
              if (id && !spec.sorts.some((s) => s.objectId === id)) update({ sorts: [...spec.sorts, { objectId: id, direction: "ASC" }] });
            }}
            className="min-h-28"
          >
            {spec.sorts.map((s, i) => {
              const o = getObject(s.objectId);
              if (!o) return null;
              return (
                <div key={s.objectId} className="mb-1 flex items-center gap-1.5 text-sm">
                  <ObjectIcon kind={o.kind} />
                  <span className="flex-1 truncate">{o.name}</span>
                  <button
                    onClick={() =>
                      update({ sorts: spec.sorts.map((x, j) => (j === i ? { ...x, direction: x.direction === "ASC" ? "DESC" : "ASC" } : x)) })
                    }
                    className="rounded border border-slate-300 px-1.5 text-xs hover:bg-slate-100"
                  >
                    {s.direction === "ASC" ? "▲ Croissant" : "▼ Décroissant"}
                  </button>
                  <button onClick={() => update({ sorts: spec.sorts.filter((_, j) => j !== i) })} className="px-1 text-slate-400 hover:text-red-600">
                    ✕
                  </button>
                </div>
              );
            })}
          </DropZone>
        </div>

        <DropZone
          title="Filtres de requête"
          hint="Glissez un objet ici pour créer une condition"
          onDropPayload={(p) => {
            const id = p.source === "tree" ? p.objectId : spec.resultObjects[p.index];
            if (id) update({ filters: [...spec.filters, newFilter(id)] });
          }}
          className="max-h-72 min-h-28"
          actions={
            <div className="flex items-center gap-3 text-xs text-slate-600">
              {spec.filters.length > 1 && (
                <button
                  onClick={() => update({ filterLogic: spec.filterLogic === "AND" ? "OR" : "AND" })}
                  className="rounded border border-slate-300 bg-white px-2 py-0.5 font-semibold hover:bg-slate-100"
                  title="Basculer ET / OU"
                >
                  {spec.filterLogic === "AND" ? "ET" : "OU"}
                </button>
              )}
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={spec.distinct} onChange={(e) => update({ distinct: e.target.checked })} />
                Lignes distinctes
              </label>
              <label className="flex items-center gap-1">
                Max. lignes
                <input
                  type="number"
                  min={1}
                  value={spec.limit ?? ""}
                  onChange={(e) => update({ limit: e.target.value ? Number(e.target.value) : null })}
                  className="w-16 rounded border border-slate-300 px-1 py-0.5"
                />
              </label>
            </div>
          }
        >
          {spec.filters.map((f, i) => {
            const o = getObject(f.objectId);
            if (!o) return null;
            return (
              <div key={f.id}>
                {i > 0 && <div className="my-0.5 pl-2 text-[11px] font-semibold text-slate-500">{spec.filterLogic === "AND" ? "ET" : "OU"}</div>}
                <FilterRow
                  filter={f}
                  obj={o}
                  onChange={(nf) => update({ filters: spec.filters.map((x) => (x.id === f.id ? nf : x)) })}
                  onRemove={() => update({ filters: spec.filters.filter((x) => x.id !== f.id) })}
                />
              </div>
            );
          })}
        </DropZone>

        {/* SQL / results */}
        <section className="flex min-h-72 flex-col overflow-hidden rounded border border-slate-300 bg-white">
          <header className="flex items-center gap-1 border-b border-slate-200 bg-slate-100 px-2 pt-1.5">
            {(["sql", "results"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-t border border-b-0 px-3 py-1 text-sm ${
                  tab === t ? "border-slate-300 bg-white font-medium text-slate-900" : "border-transparent text-slate-600 hover:text-slate-900"
                }`}
              >
                {t === "sql" ? "SQL généré" : "Résultats"}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2 pb-1.5">
              <button
                onClick={execute}
                disabled={!canRun || running}
                className="flex items-center gap-1.5 rounded bg-sky-700 px-3 py-1 text-sm font-medium text-white shadow hover:bg-sky-800 disabled:opacity-50"
              >
                ▶ {running ? "Exécution…" : "Exécuter la requête"}
              </button>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {tab === "sql" ? (
              <div className="flex h-full flex-col gap-2">
                {generated.errors.map((e) => (
                  <p key={e} className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                    ⚠ {e}
                  </p>
                ))}
                <textarea
                  value={sql}
                  onChange={(e) => setCustomSql(e.target.value)}
                  spellCheck={false}
                  className="min-h-48 flex-1 resize-none rounded border border-slate-200 bg-slate-900 p-3 font-mono text-[13px] leading-relaxed text-sky-100 outline-none focus:border-sky-500"
                />
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  {customSql !== null ? (
                    <>
                      <span className="text-amber-700">SQL personnalisé (modifié à la main)</span>
                      <button onClick={() => setCustomSql(null)} className="text-sky-700 hover:underline">
                        Revenir au SQL généré
                      </button>
                    </>
                  ) : (
                    <span>Le SQL est régénéré à chaque modification. Vous pouvez aussi l’éditer directement.</span>
                  )}
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(sql);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                    className="ml-auto text-sky-700 hover:underline"
                  >
                    {copied ? "Copié ✓" : "Copier"}
                  </button>
                </div>
              </div>
            ) : error ? (
              <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>
            ) : result ? (
              <ResultsTable result={result} />
            ) : (
              <p className="p-6 text-center text-sm text-slate-400">Exécutez la requête pour afficher les résultats.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
