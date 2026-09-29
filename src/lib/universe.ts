// Semantic layer ("univers") on top of the physical schema, in the spirit of
// SAP BusinessObjects: business-friendly classes and objects that map to SQL
// expressions, plus the joins needed to connect the underlying tables.
//
// Object expressions are written in portable SQL that runs unchanged on both
// SQLite (local demo) and PostgreSQL (Supabase).

export type Dialect = "sqlite" | "postgres";

export type DataType = "string" | "number" | "date";
export type ObjectKind = "dimension" | "measure" | "detail";

export interface Column {
  name: string;
  type: "INTEGER" | "REAL" | "TEXT" | "DATE";
  pk?: boolean;
  references?: string; // "table.column"
  description?: string;
}

export interface Table {
  name: string;
  description: string;
  columns: Column[];
}

export interface Join {
  left: string; // table name
  right: string;
  on: string; // SQL join condition
}

export interface UniverseObject {
  id: string;
  name: string;
  kind: ObjectKind;
  dataType: DataType;
  select: string; // SQL expression
  tables: string[]; // tables referenced by the expression
  description?: string;
}

export interface UniverseClass {
  id: string;
  name: string;
  objects: UniverseObject[];
}

export interface Universe {
  name: string;
  description: string;
  tables: Table[];
  joins: Join[];
  classes: UniverseClass[];
}

export const universe: Universe = {
  name: "Ventes eFashion",
  description:
    "Univers de démonstration : clients, commandes, lignes de commande et produits d'une boutique en ligne.",
  tables: [
    {
      name: "customers",
      description: "Clients de la boutique",
      columns: [
        { name: "id", type: "INTEGER", pk: true },
        { name: "name", type: "TEXT", description: "Nom complet du client" },
        { name: "email", type: "TEXT" },
        { name: "country", type: "TEXT" },
        { name: "city", type: "TEXT" },
        { name: "segment", type: "TEXT", description: "Particulier, Professionnel ou VIP" },
        { name: "created_at", type: "DATE", description: "Date d'inscription (YYYY-MM-DD)" },
      ],
    },
    {
      name: "products",
      description: "Catalogue produits",
      columns: [
        { name: "id", type: "INTEGER", pk: true },
        { name: "name", type: "TEXT" },
        { name: "category", type: "TEXT" },
        { name: "subcategory", type: "TEXT" },
        { name: "unit_price", type: "REAL", description: "Prix catalogue en euros" },
      ],
    },
    {
      name: "orders",
      description: "En-têtes de commande",
      columns: [
        { name: "id", type: "INTEGER", pk: true },
        { name: "customer_id", type: "INTEGER", references: "customers.id" },
        { name: "order_date", type: "DATE", description: "Date de commande (YYYY-MM-DD)" },
        { name: "status", type: "TEXT", description: "Livrée, Expédiée, En attente, Annulée" },
        { name: "channel", type: "TEXT", description: "Web, Mobile ou Magasin" },
      ],
    },
    {
      name: "order_items",
      description: "Lignes de commande",
      columns: [
        { name: "id", type: "INTEGER", pk: true },
        { name: "order_id", type: "INTEGER", references: "orders.id" },
        { name: "product_id", type: "INTEGER", references: "products.id" },
        { name: "quantity", type: "INTEGER" },
        { name: "unit_price", type: "REAL", description: "Prix unitaire facturé en euros" },
        { name: "discount", type: "REAL", description: "Remise entre 0 et 1" },
      ],
    },
  ],
  joins: [
    { left: "customers", right: "orders", on: "customers.id = orders.customer_id" },
    { left: "orders", right: "order_items", on: "orders.id = order_items.order_id" },
    { left: "products", right: "order_items", on: "products.id = order_items.product_id" },
  ],
  classes: [
    {
      id: "client",
      name: "Client",
      objects: [
        { id: "client.nom", name: "Nom client", kind: "dimension", dataType: "string", select: "customers.name", tables: ["customers"] },
        { id: "client.email", name: "Email", kind: "detail", dataType: "string", select: "customers.email", tables: ["customers"] },
        { id: "client.pays", name: "Pays", kind: "dimension", dataType: "string", select: "customers.country", tables: ["customers"] },
        { id: "client.ville", name: "Ville", kind: "dimension", dataType: "string", select: "customers.city", tables: ["customers"] },
        { id: "client.segment", name: "Segment", kind: "dimension", dataType: "string", select: "customers.segment", tables: ["customers"] },
        { id: "client.inscription", name: "Date d'inscription", kind: "detail", dataType: "date", select: "customers.created_at", tables: ["customers"] },
        { id: "client.nb", name: "Nombre de clients", kind: "measure", dataType: "number", select: "COUNT(DISTINCT customers.id)", tables: ["customers"] },
      ],
    },
    {
      id: "produit",
      name: "Produit",
      objects: [
        { id: "produit.nom", name: "Produit", kind: "dimension", dataType: "string", select: "products.name", tables: ["products"] },
        { id: "produit.categorie", name: "Catégorie", kind: "dimension", dataType: "string", select: "products.category", tables: ["products"] },
        { id: "produit.souscategorie", name: "Sous-catégorie", kind: "dimension", dataType: "string", select: "products.subcategory", tables: ["products"] },
        { id: "produit.prix", name: "Prix catalogue", kind: "detail", dataType: "number", select: "products.unit_price", tables: ["products"] },
      ],
    },
    {
      id: "commande",
      name: "Commande",
      objects: [
        { id: "commande.id", name: "N° commande", kind: "dimension", dataType: "number", select: "orders.id", tables: ["orders"] },
        { id: "commande.date", name: "Date commande", kind: "dimension", dataType: "date", select: "orders.order_date", tables: ["orders"] },
        { id: "commande.annee", name: "Année", kind: "dimension", dataType: "string", select: "substr(CAST(orders.order_date AS TEXT), 1, 4)", tables: ["orders"] },
        { id: "commande.trimestre", name: "Trimestre", kind: "dimension", dataType: "string", select: "'T' || ((CAST(substr(CAST(orders.order_date AS TEXT), 6, 2) AS INTEGER) + 2) / 3)", tables: ["orders"] },
        { id: "commande.mois", name: "Mois", kind: "dimension", dataType: "string", select: "substr(CAST(orders.order_date AS TEXT), 1, 7)", tables: ["orders"] },
        { id: "commande.statut", name: "Statut", kind: "dimension", dataType: "string", select: "orders.status", tables: ["orders"] },
        { id: "commande.canal", name: "Canal", kind: "dimension", dataType: "string", select: "orders.channel", tables: ["orders"] },
        { id: "commande.nb", name: "Nombre de commandes", kind: "measure", dataType: "number", select: "COUNT(DISTINCT orders.id)", tables: ["orders"] },
      ],
    },
    {
      id: "ventes",
      name: "Mesures de vente",
      objects: [
        { id: "ventes.ca", name: "Chiffre d'affaires", kind: "measure", dataType: "number", select: "ROUND(SUM(order_items.quantity * order_items.unit_price * (1 - order_items.discount)), 2)", tables: ["order_items"], description: "CA net de remise, en euros" },
        { id: "ventes.qte", name: "Quantité vendue", kind: "measure", dataType: "number", select: "SUM(order_items.quantity)", tables: ["order_items"] },
        { id: "ventes.panier", name: "Panier moyen", kind: "measure", dataType: "number", select: "ROUND(SUM(order_items.quantity * order_items.unit_price * (1 - order_items.discount)) / COUNT(DISTINCT order_items.order_id), 2)", tables: ["order_items"] },
        { id: "ventes.remise", name: "Remise moyenne (%)", kind: "measure", dataType: "number", select: "ROUND(AVG(order_items.discount) * 100, 1)", tables: ["order_items"] },
      ],
    },
  ],
};

const objectIndex = new Map<string, UniverseObject>(
  universe.classes.flatMap((c) => c.objects.map((o) => [o.id, o] as const)),
);

export function getObject(id: string): UniverseObject | undefined {
  return objectIndex.get(id);
}

const PG_TYPES: Record<Column["type"], string> = {
  INTEGER: "INTEGER",
  REAL: "NUMERIC(10, 2)",
  TEXT: "TEXT",
  DATE: "DATE",
};

export function schemaDDL(u: Universe = universe, dialect: Dialect = "sqlite"): string {
  return u.tables
    .map((t) => {
      const cols = t.columns.map((c, i) => {
        let line = `  ${c.name} ${dialect === "postgres" ? PG_TYPES[c.type] : c.type}`;
        if (c.pk) line += " PRIMARY KEY";
        if (c.references) {
          const [rt, rc] = c.references.split(".");
          line += ` REFERENCES ${rt}(${rc})`;
        }
        if (i < t.columns.length - 1) line += ",";
        // The comment must come after the comma, or it would swallow it.
        if (c.description) line += ` -- ${c.description}`;
        return line;
      });
      return `-- ${t.description}\nCREATE TABLE ${t.name} (\n${cols.join("\n")}\n);`;
    })
    .join("\n\n");
}

export function universeSummary(u: Universe = universe): string {
  return u.classes
    .map(
      (c) =>
        `Classe "${c.name}":\n` +
        c.objects
          .map((o) => `  - ${o.name} [${o.kind}] = ${o.select}${o.description ? ` (${o.description})` : ""}`)
          .join("\n"),
    )
    .join("\n");
}
