// Client Shopify Admin API (GraphQL), même boutique et mêmes identifiants
// que mediva-automation/create-product.js (OAuth client-credentials).
// Utilisé pour : le sélecteur produit du Module 1 (commande manuelle) et
// la création de fiche produit du Module 3.

const STORE = process.env.SHOPIFY_STORE;
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const API_VERSION = "2024-07";

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

// Ce compte Shopify est partagé avec Babyspot (autre marque, même
// boutique). Le champ de recherche "collection:" n'est PAS valide sur la
// query globale `products` (Shopify l'ignore silencieusement avec un
// warning "Invalid search field" et renvoie tout le catalogue partagé,
// vérifié en pratique) — il faut passer par `collection(handle) {
// products }`, comme déjà fait côté site (lib/shopify.ts du repo
// `mediva`), puis dédupliquer.
const MEDIVA_COLLECTION_HANDLES = ["pyjamas-infirmier", "crocs"];

type ProductNode = {
  id: string;
  title: string;
  priceRangeV2: { minVariantPrice: { amount: string } };
  images: { edges: { node: { url: string } }[] };
};

// L'API Admin (contrairement à l'API Storefront utilisée côté site) n'a
// pas de champ `collection(handle: ...)` — il faut résoudre l'ID via
// collectionByHandle() d'abord, vérifié en pratique (erreur GraphQL
// "doesn't accept argument 'handle'" sinon).
async function productsInCollection(handle: string): Promise<ProductNode[]> {
  const data = await gql<{
    collectionByHandle: { products: { edges: { node: ProductNode }[] } } | null;
  }>(
    `query ($handle: String!) {
      collectionByHandle(handle: $handle) {
        products(first: 50) {
          edges {
            node {
              id
              title
              priceRangeV2 { minVariantPrice { amount } }
              images(first: 1) { edges { node { url } } }
            }
          }
        }
      }
    }`,
    { handle }
  );
  return data.collectionByHandle?.products.edges.map((e) => e.node) ?? [];
}

export async function listProducts(searchTerm = ""): Promise<ShopifyProductSummary[]> {
  const lists = await Promise.all(MEDIVA_COLLECTION_HANDLES.map(productsInCollection));
  const byId = new Map<string, ProductNode>();
  for (const list of lists) for (const node of list) byId.set(node.id, node);

  const term = searchTerm.trim().toLowerCase();
  return Array.from(byId.values())
    .filter((n) => !term || n.title.toLowerCase().includes(term))
    .map((n) => ({
      id: n.id,
      title: n.title,
      price: Math.round(parseFloat(n.priceRangeV2.minVariantPrice.amount)),
      image: n.images.edges[0]?.node.url ?? null,
    }));
}

export type ShopifyCollection = { id: string; title: string };

// TODO(Module 3) : cette liste renverra aussi les collections Babyspot
// (même boutique partagée) — à filtrer sur les collections Mediva une
// fois ce module construit, comme fait pour listProducts() ci-dessus.
export async function listCollections(): Promise<ShopifyCollection[]> {
  const data = await gql<{ collections: { edges: { node: ShopifyCollection }[] } }>(
    `query { collections(first: 100) { edges { node { id title } } } }`
  );
  return data.collections.edges.map((e) => e.node);
}
