// Client Shopify Admin API (GraphQL) pour la boutique Mario Toys (OAuth
// client-credentials, identifiants propres à ce projet — compte non
// partagé avec une autre marque). Utilisé pour le sélecteur produit du
// Module 1 (commande manuelle).

const STORE = process.env.SHOPIFY_STORE;
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-07";

import { indexCatalogue, matchProducts, type CatalogueEntry } from "@/lib/product-match";

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  if (!STORE || !CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("SHOPIFY_STORE, SHOPIFY_CLIENT_ID ou SHOPIFY_CLIENT_SECRET manquant");
  }

  const res = await fetch(`https://${STORE}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`Auth Shopify échouée (${res.status}): ${await res.text()}`);
  const data = await res.json();
  if (!data.access_token) throw new Error(`Pas de token Shopify: ${JSON.stringify(data)}`);

  // Pas de expires_in documenté de façon fiable pour ce flow — on garde
  // le token en cache 50 minutes par prudence plutôt que de le refaire à
  // chaque appel.
  cachedToken = { value: data.access_token, expiresAt: Date.now() + 50 * 60 * 1000 };
  return data.access_token;
}

export async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`https://${STORE}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify GraphQL HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data as T;
}

export type ShopifyProductSummary = {
  id: string;
  title: string;
  price: number;
  image: string | null;
};

type ProductNode = {
  id: string;
  title: string;
  priceRangeV2: { minVariantPrice: { amount: string } };
  images: { edges: { node: { url: string } }[] };
};

// Catalogue Mario Toys non partagé avec une autre marque : recherche directe
// sur l'ensemble des produits (pas besoin de restreindre à des collections
// précises comme il faudrait le faire pour un compte Shopify partagé
// entre plusieurs marques (non applicable ici).
// Chaque mot tapé doit se retrouver dans le titre (ordre libre). Les caractères
// spéciaux de la syntaxe de recherche Shopify sont retirés.
export function productSearchQuery(searchTerm: string): string | undefined {
  const words = searchTerm
    .replace(/[*:"'\\()<>=~^]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
  return words.length ? words.map((w) => `title:*${w}*`).join(" ") : undefined;
}

// ── Recherche sur TOUT le catalogue ─────────────────────────────────────────
// La recherche native de Shopify ignore les accents (« pate » ne trouve pas
// « Pâte ») et ne trouve qu'en début de mot. On charge donc une fois la liste
// des titres (id, titre, prix, statut — sans images), gardée 10 minutes en
// mémoire, puis on filtre localement (lib/product-match.ts). Les images ne sont
// demandées que pour les quelques propositions affichées.
const CATALOGUE_TTL_MS = 10 * 60 * 1000;
type Catalogue = { index: ReturnType<typeof indexCatalogue>; loadedAt: number };
let catalogue: Catalogue | null = null;
let catalogueLoading: Promise<Catalogue> | null = null;

async function loadCatalogue(): Promise<Catalogue> {
  const entries: CatalogueEntry[] = [];
  let after: string | null = null;
  for (let page = 0; page < 40; page++) {
    const data: {
      products: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        edges: { node: { id: string; title: string; status: string; priceRangeV2: { minVariantPrice: { amount: string } } } }[];
      };
    } = await gql(
      `query ($after: String) {
        products(first: 250, after: $after) {
          pageInfo { hasNextPage endCursor }
          edges { node { id title status priceRangeV2 { minVariantPrice { amount } } } }
        }
      }`,
      { after }
    );
    for (const { node: n } of data.products.edges) {
      entries.push({ id: n.id, title: n.title, status: n.status, price: Math.round(parseFloat(n.priceRangeV2.minVariantPrice.amount)) });
    }
    if (!data.products.pageInfo.hasNextPage) break;
    after = data.products.pageInfo.endCursor;
  }
  return { index: indexCatalogue(entries), loadedAt: Date.now() };
}

async function getCatalogue(): Promise<Catalogue> {
  if (catalogue && Date.now() - catalogue.loadedAt < CATALOGUE_TTL_MS) return catalogue;
  catalogueLoading ??= loadCatalogue()
    .then((c) => (catalogue = c))
    .finally(() => {
      catalogueLoading = null;
    });
  try {
    return await catalogueLoading;
  } catch (err) {
    if (catalogue) return catalogue; // Shopify indisponible : on garde l'ancienne liste
    throw err;
  }
}

/** Chauffe le cache (appelé à l'ouverture du formulaire) sans attendre le résultat. */
export async function warmCatalogue(): Promise<void> {
  await getCatalogue();
}

export type ProductSuggestion = ShopifyProductSummary & { status: string };

/** Propositions pour la saisie `query` : meilleures correspondances d'abord, avec leur image. */
export async function searchProducts(query: string, limit = 10): Promise<ProductSuggestion[]> {
  const { index } = await getCatalogue();
  const found = matchProducts(index, query, limit);
  if (found.length === 0) return [];
  const data = await gql<{ nodes: ({ id: string; featuredImage: { url: string } | null } | null)[] }>(
    `query ($ids: [ID!]!) { nodes(ids: $ids) { ... on Product { id featuredImage { url } } } }`,
    { ids: found.map((p) => p.id) }
  );
  const images = new Map(data.nodes.filter((n): n is NonNullable<typeof n> => !!n).map((n) => [n.id, n.featuredImage?.url ?? null]));
  return found.map((p) => ({ ...p, image: images.get(p.id) ?? null }));
}

export async function listProducts(searchTerm = "", limit = 50): Promise<ShopifyProductSummary[]> {
  const query = productSearchQuery(searchTerm);

  const data = await gql<{ products: { edges: { node: ProductNode }[] } }>(
    `query ($query: String, $limit: Int!) {
      products(first: $limit, query: $query) {
        edges {
          node {
            id
            title
            priceRangeV2 { minVariantPrice { amount } }
            images(first: 1) { edges { node { url } } }
          }
        }
      }
    }`,
    { query, limit: Math.min(Math.max(limit, 1), 50) }
  );

  return data.products.edges.map(({ node: n }) => ({
    id: n.id,
    title: n.title,
    price: Math.round(parseFloat(n.priceRangeV2.minVariantPrice.amount)),
    image: n.images.edges[0]?.node.url ?? null,
  }));
}
