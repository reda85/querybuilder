import { runReadOnlyQuery } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { sql } = (await request.json()) as { sql?: string };
  if (!sql || typeof sql !== "string") {
    return Response.json({ error: "Requête SQL manquante." }, { status: 400 });
  }
  const started = performance.now();
  try {
    const result = await runReadOnlyQuery(sql);
    return Response.json({ ...result, durationMs: Math.round(performance.now() - started) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
