// Limites de caractères des transporteurs, vérifiées ou relevées :
// - Forcelog : PRODUCT_NATURE 100 (erreur "exceeded max chars: 100"
//   observée en production). Pas de doc publique pour les autres champs :
//   toute autre limite est remontée en clair par lib/forcelog.ts.
// - Ozon Express : maxlength du formulaire officiel
//   client.ozoneexpress.ma/parcels?action=add (relevé le 28/09/2026).
export const PARCEL_LIMITS = {
  FORCELOG: { productNature: 100 },
  OZON: { receiver: 25, address: 100, comment: 100, productNature: 100 },
} as const satisfies Record<"FORCELOG" | "OZON", Partial<Record<LimitedField, number>>>;

export type LimitedField = "receiver" | "address" | "comment" | "productNature";

export const TOO_LONG: Record<LimitedField, string> = {
  receiver: "Nom du destinataire trop long",
  address: "Adresse trop longue",
  comment: "Commentaire trop long",
  productNature: "Nature du produit trop longue",
};

export function limitFor(carrier: "FORCELOG" | "OZON", field: LimitedField): number | undefined {
  return (PARCEL_LIMITS[carrier] as Partial<Record<LimitedField, number>>)[field];
}

/** Premier champ trop long pour ce transporteur, en français, ou null. */
export function tooLongError(carrier: "FORCELOG" | "OZON", values: Record<LimitedField, string>): string | null {
  for (const field of Object.keys(TOO_LONG) as LimitedField[]) {
    const max = limitFor(carrier, field);
    const length = values[field].length;
    if (max !== undefined && length > max) {
      return `${TOO_LONG[field]} (${max} caractères max, ${length} actuellement).`;
    }
  }
  return null;
}

// "Nature du produit" courte, générée depuis les articles de la commande.
// Du plus détaillé au plus court, on garde la première version qui tient :
// nom nettoyé + variante, nom nettoyé seul, noms les plus longs raccourcis
// mot par mot, puis coupe nette en dernier recours.
// Ex. "Vélo 12 Pouces Pliable – avec Klaxon x1, Mon Petit Chiot Interactif x1".

const VARIANT = /\s*\(variante : ([^)]+)\)\s*$/; // ajouté par le webhook Shopify

function cleanName(title: string): string {
  const parts = title
    .replace(VARIANT, "")
    .replace(/\([^)]*\)/g, " ")
    .split(/\s+(?:avec|with|-|–|—|\|)\s+|[,:]/i)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  // Marque seule avant le tiret ("VTech - Téléphone Bébé") : on garde la suite.
  return (parts[0]?.includes(" ") || parts.length < 2 ? parts[0] : `${parts[0]} ${parts[1]}`) ?? "";
}

export function buildProductNature(items: { title: string; quantity: number }[], max = 100): string {
  if (items.length === 0) return "Jouet";
  const parsed = items.map((i) => ({
    name: cleanName(i.title) || i.title.trim(),
    variant: i.title.match(VARIANT)?.[1]?.trim(),
    qty: i.quantity,
  }));
  const join = (label: (p: (typeof parsed)[number]) => string) =>
    parsed.map((p) => `${label(p)} x${p.qty}`).join(", ");

  const withVariant = join((p) => (p.variant ? `${p.name} ${p.variant}` : p.name));
  if (withVariant.length <= max) return withVariant;

  // Sans variante, puis on retire un mot au nom le plus long (2 mots min)
  // tant que ça dépasse : les noms courts restent entiers.
  const words = parsed.map((p) => p.name.split(" "));
  let text = join((p) => p.name);
  while (text.length > max) {
    const longest = words.reduce((best, w, i) => (w.join(" ").length > words[best].join(" ").length ? i : best), 0);
    if (words[longest].length <= 2) break;
    words[longest] = words[longest].slice(0, -1);
    text = parsed.map((p, i) => `${words[i].join(" ")} x${p.qty}`).join(", ");
  }
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
