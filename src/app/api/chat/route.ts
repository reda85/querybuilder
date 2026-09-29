import Anthropic from "@anthropic-ai/sdk";
import { sampleValues } from "@/lib/db";
import { schemaDDL, universe, universeSummary } from "@/lib/universe";

export const runtime = "nodejs";

function systemPrompt() {
  return `Tu es un assistant SQL intégré à un outil de requêtage façon SAP BusinessObjects.
L'utilisateur décrit en langage naturel les données qu'il veut ; tu écris la requête SQL correspondante.

Base de données : SQLite (utilise la syntaxe SQLite, par ex. strftime pour les dates stockées en texte YYYY-MM-DD).

## Schéma physique
${schemaDDL(universe)}

## Univers « ${universe.name} » (objets métier et leur expression SQL)
Réutilise ces expressions quand la demande correspond à un objet métier, afin que les chiffres restent cohérents avec le reste de l'outil.
${universeSummary(universe)}

## Valeurs présentes dans la base
${sampleValues()}

## Règles de réponse
- Réponds dans la langue de l'utilisateur, en une ou deux phrases qui expliquent la logique.
- Donne exactement un bloc \`\`\`sql contenant une seule instruction SELECT (ou WITH … SELECT), sans point-virgule final.
- Nomme les colonnes du résultat avec des alias lisibles entre guillemets doubles.
- N'écris jamais d'instruction qui modifie les données.
- Si la demande est ambiguë, choisis l'interprétation la plus courante et dis-le ; si elle est impossible avec ce schéma, explique pourquoi sans inventer de colonnes.`;
}

export async function POST(request: Request) {
  const { messages } = (await request.json()) as { messages?: Anthropic.MessageParam[] };
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "Aucun message." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const client = new Anthropic();
        const stream = client.beta.messages.stream({
          model: "claude-opus-5-5",
          max_tokens: 16000,
          output_config: { effort: "medium" },
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: [{ type: "text", text: systemPrompt(), cache_control: { type: "ephemeral" } }],
          messages,
        });
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          controller.enqueue(encoder.encode("\n\n_La demande a été refusée par le modèle._"));
        } else if (final.stop_reason === "max_tokens") {
          controller.enqueue(encoder.encode("\n\n_Réponse tronquée (limite de longueur atteinte)._"));
        }
      } catch (e) {
        let message = e instanceof Error ? e.message : String(e);
        if (e instanceof Anthropic.AuthenticationError || /api[_ ]?key|authentication/i.test(message)) {
          message = "Clé API Anthropic absente ou invalide. Définissez ANTHROPIC_API_KEY dans .env.local puis redémarrez le serveur.";
        } else if (e instanceof Anthropic.RateLimitError) {
          message = "Limite de débit atteinte, réessayez dans quelques instants.";
        }
        controller.enqueue(encoder.encode(`\n\n⚠️ ${message}`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
