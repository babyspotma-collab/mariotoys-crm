// Lecture du prix d'achat et de la référence directement sur la photo
// produit (jamais depuis le nom du fichier — les photos viennent
// d'exports WhatsApp avec des noms aléatoires, voir app/product-jobs/actions.ts).
// Utilise l'API Gemini payante (GEMINI_API_KEY, déjà provisionnée sur
// Vercel) : contrairement à la génération de visuels (mariotoys-images-automation,
// automatisation navigateur sur l'UI web gratuite), il s'agit ici d'un
// simple appel de lecture ponctuel et peu coûteux, fait depuis le CRM.

const GEMINI_MODEL = "gemini-2.5-flash";

const PROMPT = `Cette photo montre un produit destiné à la revente. Un prix d'achat (et parfois une référence produit) est généralement écrit à la main ou sur une étiquette, directement visible sur la photo — ce n'est PAS le prix de vente final, juste le coût d'achat noté par le fournisseur.

Réponds uniquement avec un objet JSON de la forme {"cost": nombre ou null, "sku": chaîne ou null} :
- "cost" : le prix d'achat visible sur la photo, en dirhams, sous forme de nombre entier (sans "DH" ni symbole). Si aucun prix n'est clairement lisible sur la photo, réponds null — ne jamais deviner.
- "sku" : la référence produit visible (étiquette, emballage fournisseur), telle quelle. Si aucune référence n'est visible, réponds null.`;

export type PhotoReading = { cost: number; sku: string | null };

export async function readProductPhoto(imageBuffer: Buffer, mimeType: string): Promise<PhotoReading | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY manquant — impossible de lire la photo.");
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPT },
              { inlineData: { mimeType, data: imageBuffer.toString("base64") } },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              cost: { type: "number", nullable: true },
              sku: { type: "string", nullable: true },
            },
            required: ["cost", "sku"],
          },
        },
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini API a répondu ${res.status} : ${await res.text()}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Réponse Gemini vide ou inattendue.");
  }

  const parsed = JSON.parse(text) as { cost: number | null; sku: string | null };
  if (parsed.cost === null || parsed.cost === undefined || !Number.isFinite(parsed.cost) || parsed.cost <= 0) {
    return null;
  }

  const sku = typeof parsed.sku === "string" ? parsed.sku.trim() : "";
  return { cost: Math.round(parsed.cost), sku: sku || null };
}
