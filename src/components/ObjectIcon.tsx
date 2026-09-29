import type { ObjectKind } from "@/lib/universe";

// BusinessObjects colour code: blue cube = dimension, orange = measure, green = detail.
export function ObjectIcon({ kind }: { kind: ObjectKind }) {
  if (kind === "measure") {
    return (
      <span title="Indicateur" className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-orange-500 text-[9px] font-bold text-white">
        Σ
      </span>
    );
  }
  if (kind === "detail") {
    return <span title="Information" className="inline-block h-3 w-3 shrink-0 rotate-45 rounded-[2px] bg-emerald-500" />;
  }
  return <span title="Dimension" className="inline-block h-3.5 w-3.5 shrink-0 rounded-[3px] bg-sky-600 shadow-[inset_-3px_-3px_0_rgba(0,0,0,0.2)]" />;
}
