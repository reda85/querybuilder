# QueryBuilder

Outil de requêtage inspiré de SAP BusinessObjects (Web Intelligence), en **Next.js + Tailwind CSS**, avec deux modes :

1. **Éditeur de requêtes** : glissez-déposez des objets métier (dimensions, indicateurs, informations) depuis l’univers vers les zones *Objets du résultat*, *Filtres de requête* et *Tri*. Le SQL est généré en direct, avec les jointures et le `GROUP BY` / `HAVING` déduits automatiquement ; il peut aussi être modifié à la main puis exécuté.
2. **Assistant IA** : décrivez en langage naturel les données voulues, Claude génère la requête SQL avec le schéma, l’univers et des valeurs réelles de la base comme contexte. Chaque requête proposée peut être exécutée depuis la conversation.

## Démarrage en local

```bash
npm install
cp .env.example .env.local   # puis renseignez ANTHROPIC_API_KEY (pour l'assistant IA)
npm run dev
```

Ouvrez http://localhost:3000. Sans `DATABASE_URL`, l’app utilise une base SQLite de démonstration en mémoire (Node.js 22.18 ou plus). Avec `DATABASE_URL`, elle interroge PostgreSQL (Supabase).

## Déploiement : Supabase + Vercel

### 1. Base Supabase

1. Créez un projet sur [supabase.com](https://supabase.com).
2. Dans **SQL Editor**, exécutez dans l’ordre :
   - `supabase/migrations/20260929000000_querybuilder_schema.sql` : tables, index, RLS et rôle `querybuilder_ro` en lecture seule ;
   - `supabase/seed.sql` : les mêmes données de démo que la version locale.

   Avec la CLI Supabase, `supabase link` puis `supabase db push` appliquent la migration ; le seed s’exécute ensuite dans le SQL Editor.
3. Donnez un mot de passe au rôle de l’application :
   ```sql
   ALTER ROLE querybuilder_ro WITH PASSWORD '<mot-de-passe-fort>';
   ```
4. Récupérez la chaîne de connexion dans **Connect > Transaction pooler** (port 6543), en remplaçant l’utilisateur par `querybuilder_ro.<project-ref>` et le mot de passe par celui choisi ci-dessus.

Les tables ont le RLS activé sans policy pour `anon`/`authenticated` : elles ne sont pas lisibles via l’API REST publique de Supabase. Seul le rôle `querybuilder_ro` peut les lire, uniquement en lecture.

### 2. Application sur Vercel

1. Sur [vercel.com/new](https://vercel.com/new), importez le dépôt GitHub `reda85/querybuilder` (Next.js est détecté automatiquement).
2. Ajoutez les variables d’environnement :
   | Variable | Valeur |
   |---|---|
   | `DATABASE_URL` | la chaîne du pooler Supabase (étape 1.4) |
   | `ANTHROPIC_API_KEY` | votre clé API Anthropic |
   | `DATABASE_CA_CERT` | *(optionnel)* le certificat CA Supabase, pour vérifier le TLS |
3. Déployez. Chaque push sur la branche principale redéploie l’application.

Sans `DATABASE_CA_CERT`, la connexion à Supabase est chiffrée mais le certificat du serveur n’est pas vérifié : ajoutez-le pour une mise en production.

### Régénérer les scripts SQL

Après une modification de `src/lib/universe.ts` ou `src/lib/demoData.ts` :

```bash
npm run db:generate
```

## Architecture

| Fichier | Rôle |
|---|---|
| `src/lib/universe.ts` | L’univers : tables physiques, jointures, classes et objets métier (expression SQL de chaque objet). Source unique pour l’éditeur, le DDL et le contexte IA. |
| `src/lib/sqlGenerator.ts` | Transforme la requête visuelle en SQL : résolution des jointures (parcours du graphe), `WHERE` / `HAVING` selon le type d’objet, `GROUP BY` automatique, tri, limite. |
| `src/lib/db.ts` | Accès aux données en lecture seule (SELECT uniquement, 1 000 lignes max) : PostgreSQL si `DATABASE_URL` est défini (transaction `READ ONLY`, délai de 10 s), sinon SQLite en mémoire. |
| `src/lib/demoData.ts` | Jeu de données de démo déterministe, commun à SQLite et au seed Supabase. |
| `supabase/` | Migration et seed générés par `scripts/generate-supabase-sql.mjs`. |
| `src/app/api/query/route.ts` | Exécute une requête SQL. |
| `src/app/api/chat/route.ts` | Assistant IA (Claude, réponse en streaming). |
| `src/components/QueryBuilder.tsx` | Panneau de requête façon BO (arbre de l’univers, zones de dépôt, filtres avec liste de valeurs). |
| `src/components/ChatAssistant.tsx` | Interface de chat. |

## Brancher votre propre base

1. Décrivez vos tables, jointures et objets métier dans `src/lib/universe.ts`. Écrivez les expressions en SQL portable, ou adaptez-les à votre SGBD.
2. Pointez `DATABASE_URL` vers votre base PostgreSQL. Pour un autre SGBD, ajoutez un adaptateur dans `src/lib/db.ts` et le dialecte dans le prompt de `src/app/api/chat/route.ts`.
3. Utilisez toujours un rôle en lecture seule : la vérification « SELECT uniquement » de l’application n’est qu’un garde-fou.
