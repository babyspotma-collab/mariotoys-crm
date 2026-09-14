// Génération de fiche produit via l'API Anthropic (vision), en suivant
// les mêmes règles que mediva-automation/CLAUDE.md — mais ici c'est une
// vraie génération automatique dans l'app (pas Claude Code en
// conversation) : le CRM assemble ensuite le HTML final lui-même à
// partir des champs structurés renvoyés, pour un rendu garanti cohérent
// avec le reste du catalogue.

import Anthropic from "@anthropic-ai/sdk";

// Instancié à l'appel (pas au chargement du module) : le SDK lève une
// erreur synchrone si ANTHROPIC_API_KEY est absente, ce qui ferait
// planter toute page qui importe ce module si le client était construit
// en haut de fichier — avant même que la clé soit configurée sur Vercel.
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY manquant");
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

const SYSTEM_PROMPT = `Tu rédiges des fiches produit pour Mediva, une marque marocaine de
tenues médicales (pyjamas infirmier et Crocs, uniquement).

Règles strictes :
- Titre du produit court et concret (ex: "Pyjama infirmier vert menthe")
- "about" : un paragraphe "À propos de cet article", ton professionnel, orienté
  confort et qualité pour le personnel soignant — jamais de référence produit (SKU, ID)
- "features" : 3 à 6 lignes courtes pour "Caractéristiques principales" (matière, coupe, poches, entretien...)
- "sizes" : tailles réellement visibles/déduites, sinon ["S","M","L","XL"] par défaut — jamais vide
- "collectionTitle" : le titre EXACT d'une des collections fournies qui correspond le mieux à la photo,
  ou null si aucune ne correspond clairement (n'invente jamais une collection)
- "brand" : une marque visible sur la photo (ex: "Crocs"), sinon null
- Ne réponds QU'avec un objet JSON valide, sans texte autour, au format :
  {"title": string, "about": string, "features": string[], "sizes": string[], "collectionTitle": string|null, "brand": string|null}`;

export type ProductDraftAI = {
  title: string;
  about: string;
  features: string[];
  sizes: string[];
  collectionTitle: string | null;
  brand: string | null;
};

async function imageToBase64(url: string): Promise<{ data: string; mediaType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Téléchargement image échoué (${res.status}): ${url}`);
  const mediaType = res.headers.get("content-type") || "image/jpeg";
  const buffer = Buffer.from(await res.arrayBuffer());
  return { data: buffer.toString("base64"), mediaType };
}

export async function generateProductDraft(
  imageUrls: string[],
  collectionTitles: string[]
): Promise<ProductDraftAI> {
  const images = await Promise.all(imageUrls.map(imageToBase64));
  const client = getClient();

  const message = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          ...images.map(
            (img): Anthropic.ImageBlockParam => ({
              type: "image",
              source: { type: "base64", media_type: img.mediaType as any, data: img.data },
            })
          ),
          {
            type: "text",
            text: `Collections existantes disponibles : ${collectionTitles.join(", ")}.\n\nGénère la fiche produit pour ces photos.`,
          },
        ],
      },
    ],
  });

  const textBlock = message.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!textBlock) throw new Error("Réponse Claude sans contenu texte");

  let parsed: ProductDraftAI;
  try {
    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : textBlock.text);
  } catch {
    throw new Error(`Réponse Claude non-JSON : ${textBlock.text.slice(0, 300)}`);
  }

  return {
    title: String(parsed.title ?? ""),
    about: String(parsed.about ?? ""),
    features: Array.isArray(parsed.features) ? parsed.features.map(String) : [],
    sizes: Array.isArray(parsed.sizes) && parsed.sizes.length > 0 ? parsed.sizes.map(String) : ["S", "M", "L", "XL"],
    collectionTitle: parsed.collectionTitle ? String(parsed.collectionTitle) : null,
    brand: parsed.brand ? String(parsed.brand) : null,
  };
}

// Assemble le HTML final à partir des champs structurés — même logique
// que buildDescriptionHtml() dans mediva-automation/create-product.js,
// pour un rendu identique et garanti (pas de mise en forme laissée au
// modèle).
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
