"use client";

import { useState } from "react";

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  truncated: boolean;
  durationMs: number;
}

export async function runQuery(sql: string): Promise<QueryResult> {
  const res = await fetch("/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Erreur inconnue");
  return data;
}

function formatCell(v: unknown) {
  if (v === null || v === undefined) return <span className="text-slate-400">∅</span>;
  if (typeof v === "number") return v.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  return String(v);
}

function toCsv(result: QueryResult) {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [result.columns, ...result.rows].map((r) => r.map(esc).join(";")).join("\n");
}

export function ResultsTable({ result, compact = false }: { result: QueryResult; compact?: boolean }) {
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);

  const rows = sort
    ? [...result.rows].sort((a, b) => {
        const x = a[sort.col];
        const y = b[sort.col];
        if (x === y) return 0;
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        return (x < y ? -1 : 1) * sort.dir;
      })
    : result.rows;

  const download = () => {
    const blob = new Blob(["﻿" + toCsv(result)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "resultat.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-1 pb-1.5 text-xs text-slate-500">
        <span>
          {result.rows.length.toLocaleString("fr-FR")} ligne{result.rows.length > 1 ? "s" : ""}
          {result.truncated && " (limité à 1 000)"} · {result.durationMs} ms
        </span>
        <button onClick={download} className="rounded px-2 py-0.5 text-sky-700 hover:bg-sky-50">
          Exporter CSV
        </button>
      </div>
      <div className={`overflow-auto rounded border border-slate-200 bg-white ${compact ? "max-h-72" : "min-h-0 flex-1"}`}>
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-slate-100 text-left text-xs font-semibold text-slate-700">
            <tr>
              {result.columns.map((c, i) => (
                <th
                  key={i}
                  onClick={() => setSort((s) => (s?.col === i ? { col: i, dir: s.dir === 1 ? -1 : 1 } : { col: i, dir: 1 }))}
                  className="cursor-pointer select-none whitespace-nowrap border-b border-slate-200 px-3 py-2 hover:bg-slate-200"
                >
                  {c}
                  {sort?.col === i && (sort.dir === 1 ? " ▲" : " ▼")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="odd:bg-white even:bg-slate-50 hover:bg-sky-50">
                {r.map((v, j) => (
                  <td
                    key={j}
                    className={`whitespace-nowrap border-b border-slate-100 px-3 py-1.5 ${typeof v === "number" ? "text-right tabular-nums" : ""}`}
                  >
                    {formatCell(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
