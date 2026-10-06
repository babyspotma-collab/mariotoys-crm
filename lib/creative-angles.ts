// Config des Créatives produit : format, prompt commun et les 5 angles
// "publicité à accroche" (Instagram / Facebook). Modifiable ici — c'est la
// seule copie : le CRM assemble les prompts finaux et les envoie tels quels
// au programme local (worker/), qui n'en garde aucune.
//
// Module pur (aucun import serveur) : utilisé aussi côté navigateur par le
// formulaire pour prévenir, avant le clic sur "Générer", quels angles seront
// ignorés et quel titre sera utilisé.
//
// Règles :
//  - jamais de texte inventé : une ligne qui dépend d'un champ vide est
//    supprimée du prompt ; un angle dont le contenu essentiel manque
//    (angle BENEFICE sans point fort 1, angle OFFRE sans prix) est ignoré ;
//  - chaque texte n'apparaît qu'UNE SEULE fois dans l'image : si le titre
//    retombe sur le nom du produit (ou sur le même texte que le nom), la
//    ligne "nom du produit" est supprimée au lieu de le répéter ;
//  - accroche vide -> titre NEUTRE tiré du formulaire (point fort 1, sinon
//    nom du produit), jamais généré. Les accroches suggérées par l'IA ne
//    sont jamais utilisées sans que l'utilisateur les ait validées.

export const CREATIVE_FORMAT = "4:5";
export const HOOK_MAX_WORDS = 6;

export type CreativeFields = {
  nom_produit: string;
  accroche: string;
  point_fort_1: string;
  point_fort_2: string;
  point_fort_3: string;
  prix: string;
  ligne_offre: string;
};

type VarName = keyof CreativeFields;

// {format} est remplacé par CREATIVE_FORMAT (ou la valeur de la demande).
const COMMON_PROMPT = [
  "Using the attached product photo as the exact reference, create a high-converting social media advertisement for this exact product, designed to stop the scroll.",
  "CRITICAL: the product must remain strictly identical to the photo (shape, proportions, colors, materials, logo, printed text, packaging). Never redesign or alter it.",
  "TEXT RULES: write ONLY the French texts given below, copied exactly letter for letter with correct accents. Each text appears exactly ONCE. No other text, number, badge or claim. The main hook is huge, bold, rounded sans-serif, max 6 words, placed in the upper third, very high contrast with the background, inside safe margins.",
  "The product is large, sharp and clearly the hero. One single idea per image. No faces; if a child is shown, only small hands.",
  "Vertical {format}, high resolution, bright and playful, clean uncluttered composition.",
].join("\n");

export type HookSource = "accroche" | "point_fort_1" | "nom_produit";

// Titre d'accroche réellement utilisé : celui saisi, sinon un texte neutre
// tiré du formulaire (jamais inventé).
export function describeHook(v: CreativeFields): { text: string; source: HookSource } {
  if (v.accroche) return { text: v.accroche, source: "accroche" };
  if (v.point_fort_1) return { text: v.point_fort_1, source: "point_fort_1" };
  return { text: v.nom_produit, source: "nom_produit" };
}

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Une ligne de prompt, supprimée si une des variables de `needs` est vide.
type Line = { text: string; needs?: VarName[] };

type AngleContext = {
  v: CreativeFields;
  hook: { text: string; source: HookSource };
};

type AngleDef = {
  key: string;
  label: string;
  // Raison de l'ignorance si le contenu essentiel manque, sinon null.
  skipReason: (v: CreativeFields) => string | null;
  lines: (ctx: AngleContext) => Line[];
};

// Ligne "nom du produit" : supprimée quand le même texte est déjà utilisé comme
// titre (un texte ne doit apparaître qu'une fois).
function nameLine(text: string, ctx: AngleContext, usedAsTitle: string): Line[] {
  return sameText(usedAsTitle, ctx.v.nom_produit) ? [] : [{ text, needs: ["nom_produit"] }];
}

export const CREATIVE_ANGLES: AngleDef[] = [
  {
    key: "probleme",
    label: "Problème / accroche",
    skipReason: () => null,
    lines: (ctx) => [
      {
        // "en question" seulement pour une vraie accroche saisie ; un titre de
        // repli (point fort, nom) n'est pas une question.
        text:
          ctx.hook.source === "accroche"
            ? 'Hook as a question at the top: "{accroche}".'
            : 'Headline at the top: "{accroche}".',
      },
      { text: "The product large and centered on a simple bright background with a bold complementary color." },
      ...nameLine('Product name small at the bottom: "{nom_produit}".', ctx, ctx.hook.text),
    ],
  },
  {
    key: "benefice",
    label: "Bénéfice",
    skipReason: (v) => (v.point_fort_1 ? null : "Point fort 1 non renseigné"),
    lines: (ctx) => [
      { text: 'Huge headline: "{point_fort_1}", with a bold arrow pointing to the product.', needs: ["point_fort_1"] },
      { text: "Product large on a vivid solid background." },
      ...nameLine('Small name at the bottom: "{nom_produit}".', ctx, ctx.v.point_fort_1),
    ],
  },
  {
    key: "plaisir",
    label: "Plaisir de jouer",
    skipReason: () => null,
    lines: (ctx) => [
      {
        text: "The product in a joyful play moment on a colorful rug, small child hands interacting with it (hands only, no face), warm natural light.",
      },
      { text: 'Hook at the top: "{accroche}".' },
      ...nameLine('Name at the bottom: "{nom_produit}".', ctx, ctx.hook.text),
    ],
  },
  {
    key: "offre",
    label: "Offre et prix",
    skipReason: (v) => (v.prix ? null : "Prix non renseigné"),
    lines: () => [
      {
        text: 'The product on a bright background, a very large round price badge reading "{prix} MAD", and a button-style label "Commandez maintenant".',
        needs: ["prix"],
      },
      { text: 'Additional line: "{ligne_offre}".', needs: ["ligne_offre"] },
    ],
  },
  {
    key: "cadeau",
    label: "Idée cadeau",
    skipReason: () => null,
    lines: (ctx) => [
      { text: "Gift moment, the product with a ribbon and a small tag, warm festive light." },
      { text: 'Hook at the top: "{accroche}".' },
      ...nameLine('Name at the bottom: "{nom_produit}".', ctx, ctx.hook.text),
    ],
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

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export const HOOK_SUGGESTION_COUNT = 3;

// Nettoie les accroches proposées par l'IA avant de les montrer à l'utilisateur :
// une seule ligne, sans guillemets doubles, 6 mots maximum, sans doublon,
// 3 au maximum. Ce ne sont que des PROPOSITIONS : rien n'est utilisé sans que
// l'utilisateur les ait choisies ou modifiées dans le formulaire.
export function sanitizeHooks(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const text = cleanText(item, 60);
    if (!text || countWords(text) > HOOK_MAX_WORDS) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length === HOOK_SUGGESTION_COUNT) break;
  }
  return out;
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
  hook?: string | null;
  pointFort1?: string | null;
  pointFort2?: string | null;
  pointFort3?: string | null;
  price?: number | string | null;
  offerLine?: string | null;
}): CreativeFields {
  const price = typeof input.price === "number" ? input.price : parsePrice(input.price ?? "");
  return {
    nom_produit: cleanText(input.productName, 80),
    accroche: cleanText(input.hook, 60),
    point_fort_1: cleanText(input.pointFort1, 40),
    point_fort_2: cleanText(input.pointFort2, 40),
    point_fort_3: cleanText(input.pointFort3, 40),
    prix: formatPriceForPrompt(price),
    ligne_offre: cleanText(input.offerLine, 80),
  };
}

// Assemble les 5 angles : prompt commun + prompt de l'angle, variables
// injectées, lignes vides supprimées. Un angle ignoré a prompt = null.
export function buildAngles(fields: CreativeFields, format: string = CREATIVE_FORMAT): BuiltAngle[] {
  const hook = describeHook(fields);
  // {accroche} dans les prompts = le titre réellement utilisé (saisi ou neutre).
  const values: Record<string, string> = { ...fields, accroche: hook.text };
  const fill = (text: string) => text.replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? "");

  return CREATIVE_ANGLES.map((angle, i) => {
    const skipReason = angle.skipReason(fields);
    if (skipReason) {
      return { key: angle.key, label: angle.label, position: i + 1, prompt: null, skipReason };
    }
    const lines = angle
      .lines({ v: fields, hook })
      .filter((l) => !l.needs || l.needs.every((n) => fields[n]))
      .map((l) => fill(l.text));
    const prompt = `${COMMON_PROMPT.replace("{format}", format)}\n\n${lines.join(" ")}`;
    return { key: angle.key, label: angle.label, position: i + 1, prompt, skipReason: null };
  });
}

export function angleLabel(key: string): string {
  // Anciennes clés (demandes créées avant la direction "accroche") conservées
  // lisibles dans la page de résultats.
  const legacy: Record<string, string> = {
    cadeau: "Idée cadeau",
    "point-fort": "Point fort principal",
    "plaisir-de-jouer": "Plaisir de jouer",
    "offre-prix": "Offre et prix",
    "pourquoi-on-adore": "Pourquoi on l'adore",
  };
  return CREATIVE_ANGLES.find((a) => a.key === key)?.label ?? legacy[key] ?? key;
}
