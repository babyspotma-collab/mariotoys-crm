// Client Shopify Admin API (GraphQL) pour la boutique Mario Toys (OAuth
// client-credentials, identifiants propres à ce projet — compte non
// partagé avec une autre marque). Utilisé pour le sélecteur produit du
// Module 1 (commande manuelle).

const STORE = process.env.SHOPIFY_STORE;
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-07";

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

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
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
// précises comme le faisait mediva-crm pour exclure le catalogue Babyspot).
export async function listProducts(searchTerm = ""): Promise<ShopifyProductSummary[]> {
  const term = searchTerm.trim();
  const query = term ? `title:*${term}*` : undefined;

  const data = await gql<{ products: { edges: { node: ProductNode }[] } }>(
    `query ($query: String) {
      products(first: 50, query: $query) {
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
    { query }
  );

  return data.products.edges.map(({ node: n }) => ({
    id: n.id,
    title: n.title,
    price: Math.round(parseFloat(n.priceRangeV2.minVariantPrice.amount)),
    image: n.images.edges[0]?.node.url ?? null,
  }));
}
