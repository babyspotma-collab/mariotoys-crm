// Config des Créatives produit : format, prompt commun et les 5 angles
// MARKETING (publicités avec texte dans l'image). Modifiable ici — c'est la
// seule copie : le CRM assemble les prompts finaux et les envoie tels quels
// au programme local (worker/), qui n'en garde aucune.
//
// Module pur (aucun import serveur) : utilisé aussi côté navigateur par le
// formulaire pour prévenir, avant le clic sur "Générer", quels angles seront
// ignorés faute de contenu.
//
// Règle : jamais de texte inventé. Une ligne qui dépend d'un champ vide est
// supprimée du prompt ; un angle dont le contenu essentiel manque est ignoré.

export const CREATIVE_FORMAT = "4:5";

export type CreativeFields = {
  nom_produit: string;
  point_fort_1: string;
  point_fort_2: string;
  point_fort_3: string;
  prix: string;
  ligne_offre: string;
};

type VarName = keyof CreativeFields;

// {format} est remplacé par CREATIVE_FORMAT (ou la valeur de la demande).
const COMMON_PROMPT = [
  "Using the attached product photo as the exact reference, create a professional social media advertising creative for this exact product.",
  "CRITICAL: the product must remain strictly identical to the photo: same shape, proportions, colors, materials, logo, printed text and packaging. Never redesign or alter it.",
  "TEXT RULES: write ONLY the French texts given below, copied exactly letter for letter, with correct accents. Do not add, translate, shorten or invent any other text, number, badge or claim. Short, large, highly legible text in a bold rounded sans-serif font, strong contrast with the background, kept inside safe margins.",
  "No people and no faces. Vertical {format} format, high resolution, clean modern composition, bright and playful colors suited to a toy brand.",
].join("\n");

// Une ligne de prompt, supprimée si une des variables de `needs` est vide.
type Line = { text: string; needs?: VarName[] };

type AngleDef = {
  key: string;
  label: string;
  // Raison de l'ignorance si le contenu essentiel manque, sinon null.
  skipReason: (v: CreativeFields) => string | null;
  lines: (v: CreativeFields) => Line[];
};

export const CREATIVE_ANGLES: AngleDef[] = [
  {
    key: "cadeau",
    label: "Idée cadeau",
    skipReason: () => null,
    lines: () => [
      { text: "Gift concept: the product next to a ribbon and a small gift tag, warm festive colors." },
      { text: 'Headline at the top: "L\'idée cadeau parfaite".' },
      { text: 'Below the product, the name: "{nom_produit}".', needs: ["nom_produit"] },
    ],
  },
  {
    key: "point-fort",
    label: "Point fort principal",
    skipReason: (v) => (v.point_fort_1 ? null : "Point fort 1 non renseigné"),
    lines: () => [
      { text: "The product large in the center on a bright solid color background, with one bold callout pointing at it." },
      { text: 'Headline: "{point_fort_1}".', needs: ["point_fort_1"] },
      { text: 'Product name in small text at the bottom: "{nom_produit}".', needs: ["nom_produit"] },
    ],
  },
  {
    key: "plaisir-de-jouer",
    label: "Plaisir de jouer",
    skipReason: () => null,
    lines: () => [
      {
        text: "Joyful playful scene: the product in a colorful playroom set (rug, cushions, soft toys in the background, slightly blurred), energetic mood.",
      },
      { text: 'Headline: "Place au jeu !".' },
      { text: 'Product name: "{nom_produit}".', needs: ["nom_produit"] },
    ],
  },
  {
    key: "offre-prix",
    label: "Offre et prix",
    skipReason: (v) => (v.prix ? null : "Prix non renseigné"),
    lines: () => [
      {
        text: 'Clean promotional layout: the product on a bright background with a round price badge reading "{prix} MAD".',
        needs: ["prix"],
      },
      { text: 'Under it, a button-style label: "Commandez maintenant".' },
      { text: 'Extra line at the bottom: "{ligne_offre}".', needs: ["ligne_offre"] },
    ],
  },
  {
    key: "pourquoi-on-adore",
    label: "Pourquoi on l'adore",
    skipReason: (v) =>
      v.point_fort_1 || v.point_fort_2 || v.point_fort_3 ? null : "Aucun point fort renseigné",
    lines: (v) => {
      // Seuls les points forts remplis apparaissent, dans l'ordre saisi.
      const filled = [v.point_fort_1, v.point_fort_2, v.point_fort_3].filter(Boolean).length;
      const count = ["", "one", "two", "three"][filled];
      const labels = (["point_fort_1", "point_fort_2", "point_fort_3"] as const)
        .filter((k) => v[k])
        .map((k) => `"{${k}}"`)
        .join(", ");
      return [
        {
          text: `Product centered, with ${count} short benefit label${filled > 1 ? "s" : ""} arranged around it, each with a small simple icon: ${labels}.`,
        },
        { text: 'Title at the top: "{nom_produit}".', needs: ["nom_produit"] },
      ];
    },
  },
];

export type BuiltAngle = {
  key: string;
  label: string;
  position: number; // 1..5
  prompt: string | null; // null si l'angle est ignoré
  skipReason: string | null;
};

// Nettoie une valeur saisie avant de l'injecter entre guillemets dans un
// prompt : une seule ligne, espaces normalisés, pas de guillemets doubles
// (ils fermeraient le texte à écrire), longueur bornée.
export function cleanText(value: string | null | undefined, max: number): string {
  return (value ?? "").replace(/["“”«»]/g, "'").replace(/\s+/g, " ").trim().slice(0, max);
}

// "199" ou "199,5" / "199.5" -> nombre, sinon null.
export function parsePrice(raw: string | null | undefined): number | null {
  const s = (raw ?? "").replace(/\s/g, "").replace(/MAD|DH|dh|mad/g, "").replace(",", ".");
  if (!s || !/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 && n < 1_000_000 ? n : null;
}

export function formatPriceForPrompt(price: number | null): string {
  if (price === null) return "";
  return Number.isInteger(price) ? String(price) : price.toFixed(2).replace(".", ",");
}

export function buildFields(input: {
  productName?: string | null;
  pointFort1?: string | null;
  pointFort2?: string | null;
  pointFort3?: string | null;
  price?: number | string | null;
  offerLine?: string | null;
}): CreativeFields {
  const price = typeof input.price === "number" ? input.price : parsePrice(input.price ?? "");
  return {
    nom_produit: cleanText(input.productName, 80),
    point_fort_1: cleanText(input.pointFort1, 40),
    point_fort_2: cleanText(input.pointFort2, 40),
    point_fort_3: cleanText(input.pointFort3, 40),
    prix: formatPriceForPrompt(price),
    ligne_offre: cleanText(input.offerLine, 80),
  };
}

function fill(text: string, v: CreativeFields): string {
  return text.replace(/\{(\w+)\}/g, (_, name: string) => v[name as VarName] ?? "");
}

// Assemble les 5 angles : prompt commun + prompt de l'angle, variables
// injectées, lignes vides supprimées. Un angle ignoré a prompt = null.
export function buildAngles(fields: CreativeFields, format: string = CREATIVE_FORMAT): BuiltAngle[] {
  return CREATIVE_ANGLES.map((angle, i) => {
    const skipReason = angle.skipReason(fields);
    if (skipReason) {
      return { key: angle.key, label: angle.label, position: i + 1, prompt: null, skipReason };
    }
    const lines = angle
      .lines(fields)
      .filter((l) => !l.needs || l.needs.every((n) => fields[n]))
      .map((l) => fill(l.text, fields));
    const prompt = `${COMMON_PROMPT.replace("{format}", format)}\n\n${lines.join(" ")}`;
    return { key: angle.key, label: angle.label, position: i + 1, prompt, skipReason: null };
  });
}

export function angleLabel(key: string): string {
  return CREATIVE_ANGLES.find((a) => a.key === key)?.label ?? key;
}
