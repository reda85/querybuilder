# QueryBuilder

Outil de requêtage inspiré de SAP BusinessObjects (Web Intelligence), en **Next.js + Tailwind CSS**, avec deux modes :

1. **Éditeur de requêtes** : glissez-déposez des objets métier (dimensions, indicateurs, informations) depuis l’univers vers les zones *Objets du résultat*, *Filtres de requête* et *Tri*. Le SQL est généré en direct, avec les jointures et le `GROUP BY` / `HAVING` déduits automatiquement ; il peut aussi être modifié à la main puis exécuté.
2. **Assistant IA** : décrivez en langage naturel les données voulues, Claude génère la requête SQL avec le schéma, l’univers et des valeurs réelles de la base comme contexte. Chaque requête proposée peut être exécutée depuis la conversation.

## Démarrage

```bash
npm install
cp .env.example .env.local   # puis renseignez ANTHROPIC_API_KEY (pour l'assistant IA)
npm run dev
```

Ouvrez http://localhost:3000. Node.js 22.5 ou plus est requis (base de démonstration via `node:sqlite`).

## Architecture

| Fichier | Rôle |
|---|---|
| `src/lib/universe.ts` | L’univers : tables physiques, jointures, classes et objets métier (expression SQL de chaque objet). Source unique pour l’éditeur, le DDL et le contexte IA. |
| `src/lib/sqlGenerator.ts` | Transforme la requête visuelle en SQL : résolution des jointures (parcours du graphe), `WHERE` / `HAVING` selon le type d’objet, `GROUP BY` automatique, tri, limite. |
| `src/lib/db.ts` | Base SQLite en mémoire remplie avec des données de démo déterministes ; exécution en lecture seule (SELECT uniquement, 1 000 lignes max). |
| `src/app/api/query/route.ts` | Exécute une requête SQL. |
| `src/app/api/chat/route.ts` | Assistant IA (Claude, réponse en streaming). |
| `src/components/QueryBuilder.tsx` | Panneau de requête façon BO (arbre de l’univers, zones de dépôt, filtres avec liste de valeurs). |
| `src/components/ChatAssistant.tsx` | Interface de chat. |

## Brancher votre propre base

1. Décrivez vos tables, jointures et objets métier dans `src/lib/universe.ts`.
2. Remplacez `getDb()` / `runReadOnlyQuery()` dans `src/lib/db.ts` par un client vers votre SGBD (PostgreSQL, MySQL…) et adaptez le dialecte mentionné dans le prompt de `src/app/api/chat/route.ts`.
3. Utilisez un compte de base de données en lecture seule : la vérification « SELECT uniquement » de l’application n’est qu’un garde-fou.
