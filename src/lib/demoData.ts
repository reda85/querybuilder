// Deterministic demo dataset, shared by the local SQLite database and the
// generated Supabase seed file so both hold exactly the same rows.
// No imports: this file is also loaded directly by scripts/generate-supabase-sql.mjs.

export type Row = (string | number)[];

export interface DemoData {
  customers: Row[];
  products: Row[];
  orders: Row[];
  order_items: Row[];
}

const FIRST = ["Camille", "Louis", "Emma", "Hugo", "Léa", "Lucas", "Chloé", "Nathan", "Inès", "Jules", "Sarah", "Adam", "Manon", "Yanis", "Lina", "Karim", "Sofia", "Omar", "Julie", "Thomas"];
const LAST = ["Martin", "Bernard", "Dubois", "Durand", "Lefebvre", "Moreau", "Laurent", "Simon", "Michel", "Garcia", "Benali", "Roux", "Fournier", "Girard", "Bonnet", "Mercier", "Haddad", "Lambert"];
const PLACES: [string, string][] = [
  ["France", "Paris"], ["France", "Lyon"], ["France", "Marseille"], ["France", "Lille"], ["France", "Bordeaux"],
  ["Belgique", "Bruxelles"], ["Belgique", "Liège"], ["Suisse", "Genève"], ["Suisse", "Lausanne"],
  ["Maroc", "Casablanca"], ["Maroc", "Rabat"], ["Canada", "Montréal"], ["Canada", "Québec"],
];
const SEGMENTS = ["Particulier", "Particulier", "Particulier", "Professionnel", "VIP"];
const CATALOG: [string, string, string, number][] = [
  ["T-shirt coton bio", "Vêtements", "Hauts", 19.9],
  ["Chemise lin", "Vêtements", "Hauts", 49.0],
  ["Pull mérinos", "Vêtements", "Hauts", 79.0],
  ["Jean slim", "Vêtements", "Bas", 59.0],
  ["Chino", "Vêtements", "Bas", 45.0],
  ["Short de bain", "Vêtements", "Bas", 29.0],
  ["Veste en jean", "Vêtements", "Manteaux", 89.0],
  ["Parka", "Vêtements", "Manteaux", 169.0],
  ["Baskets cuir", "Chaussures", "Sport", 99.0],
  ["Running", "Chaussures", "Sport", 119.0],
  ["Mocassins", "Chaussures", "Ville", 129.0],
  ["Bottines", "Chaussures", "Ville", 149.0],
  ["Sac cabas", "Accessoires", "Sacs", 69.0],
  ["Sac à dos", "Accessoires", "Sacs", 59.0],
  ["Ceinture cuir", "Accessoires", "Petite maroquinerie", 35.0],
  ["Portefeuille", "Accessoires", "Petite maroquinerie", 39.0],
  ["Casquette", "Accessoires", "Chapeaux", 22.0],
  ["Bonnet laine", "Accessoires", "Chapeaux", 25.0],
];
const STATUSES = ["Livrée", "Livrée", "Livrée", "Livrée", "Expédiée", "En attente", "Annulée"];
const CHANNELS = ["Web", "Web", "Mobile", "Magasin"];

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function generateDemoData(): DemoData {
  const r = rng(42);
  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)];
  const data: DemoData = { customers: [], products: [], orders: [], order_items: [] };

  for (let i = 1; i <= 120; i++) {
    const first = pick(FIRST);
    const last = pick(LAST);
    const [country, city] = pick(PLACES);
    const created = new Date(Date.UTC(2022, 0, 1) + Math.floor(r() * 900) * 86400000);
    data.customers.push([i, `${first} ${last}`, `${first}.${last}${i}@example.com`.toLowerCase(), country, city, pick(SEGMENTS), iso(created)]);
  }

  CATALOG.forEach(([name, cat, sub, price], i) => data.products.push([i + 1, name, cat, sub, price]));

  let itemId = 1;
  for (let o = 1; o <= 1500; o++) {
    const date = new Date(Date.UTC(2023, 0, 1) + Math.floor(r() * 1000) * 86400000);
    data.orders.push([o, 1 + Math.floor(r() * 120), iso(date), pick(STATUSES), pick(CHANNELS)]);
    const lines = 1 + Math.floor(r() * 4);
    for (let l = 0; l < lines; l++) {
      const p = Math.floor(r() * CATALOG.length);
      const discount = r() < 0.7 ? 0 : pick([0.05, 0.1, 0.15, 0.2, 0.3]);
      data.order_items.push([itemId++, o, p + 1, 1 + Math.floor(r() * 3), CATALOG[p][3], discount]);
    }
  }
  return data;
}
