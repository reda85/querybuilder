"use client";

import { useEffect, useRef, useState } from "react";
import { universe } from "@/lib/universe";
import { ResultsTable, runQuery, type QueryResult } from "./ResultsTable";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Chiffre d'affaires par pays et par année",
  "Top 10 des clients par CA en 2024",
  "Panier moyen par canal pour les commandes livrées",
  "Quelle catégorie a le plus progressé entre 2023 et 2024 ?",
];

function SqlBlock({ code, streaming }: { code: string; streaming: boolean }) {
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      setResult(await runQuery(code));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="my-2 overflow-hidden rounded border border-slate-300">
      <div className="flex items-center justify-between bg-slate-800 px-3 py-1 text-xs text-slate-300">
        <span>SQL</span>
        {!streaming && (
          <div className="flex gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(code);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="hover:text-white"
            >
              {copied ? "Copié ✓" : "Copier"}
            </button>
            <button onClick={run} disabled={running} className="rounded bg-sky-600 px-2 py-0.5 font-medium text-white hover:bg-sky-500 disabled:opacity-50">
              ▶ {running ? "…" : "Exécuter"}
            </button>
          </div>
        )}
      </div>
      <pre className="overflow-x-auto bg-slate-900 p-3 font-mono text-[13px] leading-relaxed text-sky-100">{code}</pre>
      {error && <p className="bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {result && (
        <div className="bg-slate-50 p-2">
          <ResultsTable result={result} compact />
        </div>
      )}
    </div>
  );
}

function AssistantContent({ text, streaming }: { text: string; streaming: boolean }) {
  // Split on fenced code blocks; an unterminated block at the end is still streaming.
  const parts: { type: "text" | "code"; value: string; done: boolean }[] = [];
  const re = /```(?:sql)?\s*\n?([\s\S]*?)(```|$)/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "text", value: text.slice(last, m.index), done: true });
    parts.push({ type: "code", value: m[1].trim(), done: m[2] === "```" });
    last = re.lastIndex;
    if (m[0].length === 0) break;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last), done: true });

  return (
    <>
      {parts.map((p, i) =>
        p.type === "code" ? (
          <SqlBlock key={i} code={p.value} streaming={streaming && !p.done} />
        ) : (
          <p key={i} className="whitespace-pre-wrap">
            {p.value.trim()}
          </p>
        ),
      )}
    </>
  );
}

export function ChatAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    const history: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.body) throw new Error(await res.text());
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages([...history, { role: "assistant", content: acc }]);
      }
    } catch (e) {
      setMessages([...history, { role: "assistant", content: `⚠️ ${e instanceof Error ? e.message : String(e)}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-2 p-2 lg:grid-cols-[1fr_300px]">
      <section className="flex min-h-0 flex-col overflow-hidden rounded border border-slate-300 bg-white">
        <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
          {messages.length === 0 && (
            <div className="mx-auto max-w-xl py-10 text-center">
              <h2 className="text-lg font-semibold text-slate-800">Posez votre question en langage naturel</h2>
              <p className="mt-1 text-sm text-slate-500">
                L’assistant connaît le schéma et l’univers « {universe.name} » et génère la requête SQL. Vous pouvez l’exécuter directement.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sm text-sky-800 hover:bg-sky-100">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
              {m.role === "user" ? (
                <div className="max-w-[80%] rounded-lg bg-sky-700 px-3 py-2 text-sm whitespace-pre-wrap text-white">{m.content}</div>
              ) : (
                <div className="max-w-full text-sm text-slate-800">
                  {m.content ? (
                    <AssistantContent text={m.content} streaming={busy && i === messages.length - 1} />
                  ) : (
                    <span className="animate-pulse text-slate-400">Génération de la requête…</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex gap-2 border-t border-slate-200 bg-slate-50 p-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={2}
            placeholder="Ex. : nombre de commandes annulées par mois en 2024"
            className="flex-1 resize-none rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500"
          />
          <div className="flex flex-col gap-1">
            <button type="submit" disabled={busy || !input.trim()} className="rounded bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50">
              Envoyer
            </button>
            {messages.length > 0 && (
              <button type="button" onClick={() => setMessages([])} disabled={busy} className="text-xs text-slate-500 hover:text-slate-800">
                Nouvelle conversation
              </button>
            )}
          </div>
        </form>
      </section>

      <aside className="min-h-0 overflow-auto rounded border border-slate-300 bg-white">
        <header className="border-b border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100 px-2.5 py-1.5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Contexte fourni à l’IA</h2>
        </header>
        <div className="space-y-3 p-2.5 text-xs">
          {universe.tables.map((t) => (
            <div key={t.name}>
              <p className="font-mono font-semibold text-slate-800">{t.name}</p>
              <p className="mb-1 text-slate-500">{t.description}</p>
              <ul className="space-y-0.5 font-mono text-slate-600">
                {t.columns.map((c) => (
                  <li key={c.name} className="flex justify-between gap-2">
                    <span>
                      {c.pk ? "🔑 " : c.references ? "🔗 " : ""}
                      {c.name}
                    </span>
                    <span className="text-slate-400">{c.type}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
