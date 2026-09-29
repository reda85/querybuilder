"use client";

import { useState } from "react";
import { QueryBuilder } from "@/components/QueryBuilder";
import { ChatAssistant } from "@/components/ChatAssistant";

type Mode = "builder" | "chat";

export default function Home() {
  const [mode, setMode] = useState<Mode>("builder");

  return (
    <div className="flex h-dvh flex-col bg-slate-200 text-slate-900">
      <header className="flex items-center gap-6 bg-gradient-to-r from-[#0a3d62] to-[#1e6fa8] px-4 py-2 text-white shadow">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded bg-white/15 font-bold">Q</span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">QueryBuilder</p>
            <p className="text-[11px] text-sky-100/80">Requêtage visuel & assistant IA</p>
          </div>
        </div>
        <nav className="flex gap-1">
          {(
            [
              ["builder", "Éditeur de requêtes"],
              ["chat", "Assistant IA"],
            ] as [Mode, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded px-3 py-1.5 text-sm transition-colors ${mode === m ? "bg-white text-[#0a3d62] font-medium shadow" : "text-white/85 hover:bg-white/10"}`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>
      <main className="min-h-0 flex-1 overflow-auto">
        {/* Both views stay mounted so switching tabs keeps their state. */}
        <div className={mode === "builder" ? "h-full" : "hidden"}>
          <QueryBuilder />
        </div>
        <div className={mode === "chat" ? "h-full" : "hidden"}>
          <ChatAssistant />
        </div>
      </main>
    </div>
  );
}
