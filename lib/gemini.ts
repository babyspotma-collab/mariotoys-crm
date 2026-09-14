// Génération du TEXTE de fiche produit via l'API Google Gemini (gratuite,
// clé obtenue sur aistudio.google.com — voir README). Portée volontairement
// restreinte à titre + description : la collection, les tags, les tailles
// et le prix restent gérés par du code déterministe (voir
// app/products/new/actions.ts et lib/pricing.ts), pas par l'IA.

// Google a retiré generateContent au profit de l'Interactions API (GA
// depuis juin 2026, https://ai.google.dev/gemini-api/docs/migrate-to-interactions)
// et renommé le SDK Node (@google/generative-ai -> @google/genai) — donc
// pas qu'un changement de nom de modèle, vérifié contre la doc officielle
// avant d'écrire ce code (generateContent restait cité comme "toujours
// supporté" mais l'Interactions API est désormais la voie recommandée).
import { GoogleGenAI } from "@google/genai";
import { readBlob } from "@/lib/blob";

// Instancié à l'appel, pas au chargement du module : évite qu'une
// GEMINI_API_KEY absente fasse planter toute page qui importe ce fichier
// (même principe que lib/forcelog.ts pour FORCELOG_API_KEY).
function getClient(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY manquant");
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

const SYSTEM_PROMPT = `Tu rédiges le texte de fiches produit pour Mediva, une marque
marocaine de tenues médicales (pyjamas infirmier et Crocs, uniquement).

Règles strictes :
- Titre du produit court et concret (ex: "Pyjama infirmier vert menthe")
- "about" : un paragraphe "À propos de cet article", ton professionnel, orienté
  confort et qualité pour le personnel soignant — jamais de référence produit (SKU, ID)
- "features" : 3 à 6 lignes courtes pour "Caractéristiques principales" (matière, coupe,
  poches, entretien...), cohérentes avec les tailles et le prix donnés
- Ne réponds QU'avec un objet JSON valide, au format exact :
  {"title": string, "about": string, "features": string[]}`;

export type ProductText = { title: string; about: string; features: string[] };

// Store Blob privé : lecture via get() (lib/blob.ts), pas un fetch()
// direct de l'URL (non publiquement accessible).
async function imageToContentPart(pathname: string) {
  const { buffer, contentType } = await readBlob(pathname);
  return { type: "image" as const, mime_type: contentType, data: buffer.toString("base64") };
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    about: { type: "string" },
    features: { type: "array", items: { type: "string" } },
  },
  required: ["title", "about", "features"],
};

export async function generateProductText(
  imagePathnames: string[],
  sizes: string[],
  price: number
): Promise<ProductText> {
  const imageParts = await Promise.all(imagePathnames.map(imageToContentPart));
  const client = getClient();

  const interaction = await client.interactions.create({
    model: "gemini-3.6-flash",
    system_instruction: SYSTEM_PROMPT,
    input: [
      ...imageParts,
      {
        type: "text",
        text: `Tailles disponibles : ${sizes.join(", ")}. Prix de vente : ${price} DH. Génère le titre et la description pour ces photos.`,
      },
    ],
    response_format: [{ type: "text", mime_type: "application/json", schema: RESPONSE_SCHEMA }],
  });

  const outputText = interaction.output_text ?? "";
  let parsed: Partial<ProductText>;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new Error(`Réponse Gemini non-JSON : ${outputText.slice(0, 300)}`);
  }

  const title = String(parsed.title ?? "").trim();
  const about = String(parsed.about ?? "").trim();
  const features = Array.isArray(parsed.features) ? parsed.features.map(String) : [];

  if (!title || !about || features.length === 0) {
    throw new Error("Réponse Gemini incomplète (titre, description ou caractéristiques manquants).");
  }

  return { title, about, features };
}

// Assemble le HTML final à partir des champs générés — même logique que
// buildDescriptionHtml() dans mediva-automation/create-product.js, pour
// un rendu garanti cohérent (pas de mise en forme laissée au modèle).
export function buildDescriptionHtml(draft: {
  title: string;
  about: string;
  features: string[];
  sizes: string[];
}): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return [
    `<p><strong>${esc(draft.title)}</strong></p>`,
    `<p><strong>À propos de cet article</strong><br>${esc(draft.about)}</p>`,
    `<p><strong>Caractéristiques principales</strong><br>${draft.features.map(esc).join("<br>")}</p>`,
    `<p><strong>Tailles disponibles</strong><br>${esc(draft.sizes.join(", "))}</p>`,
  ].join("");
}
