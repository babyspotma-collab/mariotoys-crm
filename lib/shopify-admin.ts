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

// Collections Mediva connues (voir mediva-automation/CLAUDE.md) — le
// compte Shopify est partagé avec Babyspot, dont les collections
// (Univers Bébé, Kidilo, Candide, etc.) ne doivent jamais apparaître ici.
// Filtré par titre plutôt que par handle : plus robuste, et on ne connaît
// pas les handles exacts de toutes ces collections historiques.
const MEDIVA_COLLECTION_TITLES = [
  "blouses",
  "pantalons",
  "vestes",
  "tenues chirurgicales",
  "accessoires",
  "pyjamas infirmier",
  "crocs",
  "pyjama",
];

export async function listCollections(): Promise<ShopifyCollection[]> {
  const data = await gql<{ collections: { edges: { node: ShopifyCollection }[] } }>(
    `query { collections(first: 100) { edges { node { id title } } } }`
  );
  return data.collections.edges
    .map((e) => e.node)
    .filter((c) => MEDIVA_COLLECTION_TITLES.includes(c.title.trim().toLowerCase()));
}

// ─── Création de produit (Module 3) ───────────────────────────────────────────
// Même flow que mediva-automation/create-product.js (productCreate ->
// productOptionsCreate -> productVariantsBulkCreate/Update), mais les
// images viennent de Vercel Blob (déjà des URLs HTTPS publiques) donc
// productCreateMedia les prend directement en originalSource — pas
// besoin du staged-upload nécessaire pour des fichiers locaux.

export type CreateDraftProductInput = {
  title: string;
  descriptionHtml: string;
  tags: string[];
  sizes: string[]; // jamais vide
  price: number;
  compareAtPrice: number;
  cost: number;
  imageUrls: string[];
  collectionId: string;
};

export type CreatedProduct = { id: string; adminUrl: string };

export async function createDraftProduct(input: CreateDraftProductInput): Promise<CreatedProduct> {
  const createData = await gql<{
    productCreate: {
      product: { id: string; variants: { edges: { node: { id: string } }[] } };
      userErrors: { field: string[]; message: string }[];
    };
  }>(
    `mutation ($input: ProductInput!) {
      productCreate(input: $input) {
        product { id variants(first: 1) { edges { node { id } } } }
        userErrors { field message }
      }
    }`,
    { input: { title: input.title, descriptionHtml: input.descriptionHtml, status: "DRAFT", tags: input.tags } }
  );
  if (createData.productCreate.userErrors.length > 0) {
    throw new Error(`Création produit: ${JSON.stringify(createData.productCreate.userErrors)}`);
  }
  const productId = createData.productCreate.product.id;

  const optData = await gql<{
    productOptionsCreate: { userErrors: { field: string[]; message: string }[] };
  }>(
    `mutation ($productId: ID!, $options: [OptionCreateInput!]!) {
      productOptionsCreate(productId: $productId, options: $options) {
        userErrors { field message }
      }
    }`,
    { productId, options: [{ name: "Taille", values: input.sizes.map((s) => ({ name: s })) }] }
  );
  if (optData.productOptionsCreate.userErrors.length > 0) {
    throw new Error(`Création option Taille: ${JSON.stringify(optData.productOptionsCreate.userErrors)}`);
  }

  const details = await gql<{
    product: {
      options: { id: string; name: string; optionValues: { id: string; name: string }[] }[];
      variants: { edges: { node: { id: string; selectedOptions: { name: string; value: string }[] } }[] };
    };
  }>(
    `query ($id: ID!) {
      product(id: $id) {
        options { id name optionValues { id name } }
        variants(first: 20) { edges { node { id selectedOptions { name value } } } }
      }
    }`,
    { id: productId }
  );

  const tailleOpt = details.product.options.find((o) => o.name === "Taille");
  if (!tailleOpt) throw new Error('Option "Taille" introuvable après création');

  const covered = new Set(
    details.product.variants.edges.flatMap((e) =>
      e.node.selectedOptions.filter((o) => o.name === "Taille").map((o) => o.value)
    )
  );
  const missing = tailleOpt.optionValues.filter((ov) => !covered.has(ov.name));

  if (missing.length > 0) {
    const cvData = await gql<{
      productVariantsBulkCreate: { userErrors: { field: string[]; message: string }[] };
    }>(
      `mutation ($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkCreate(productId: $productId, variants: $variants) {
          userErrors { field message }
        }
      }`,
      {
        productId,
        variants: missing.map((ov) => ({
          price: String(input.price),
          compareAtPrice: String(input.compareAtPrice),
          taxable: false,
          inventoryItem: { cost: String(input.cost) },
          optionValues: [{ optionId: tailleOpt.id, id: ov.id }],
        })),
      }
    );
    if (cvData.productVariantsBulkCreate.userErrors.length > 0) {
      throw new Error(`Création variantes: ${JSON.stringify(cvData.productVariantsBulkCreate.userErrors)}`);
    }
  }

  const existingIds = details.product.variants.edges.map((e) => e.node.id);
  if (existingIds.length > 0) {
    const upData = await gql<{
      productVariantsBulkUpdate: { userErrors: { field: string[]; message: string }[] };
    }>(
      `mutation ($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          userErrors { field message }
        }
      }`,
      {
        productId,
        variants: existingIds.map((id) => ({
          id,
          price: String(input.price),
          compareAtPrice: String(input.compareAtPrice),
          taxable: false,
          inventoryItem: { cost: String(input.cost) },
        })),
      }
    );
    if (upData.productVariantsBulkUpdate.userErrors.length > 0) {
      throw new Error(`Mise à jour variantes: ${JSON.stringify(upData.productVariantsBulkUpdate.userErrors)}`);
    }
  }

  if (input.imageUrls.length > 0) {
    const mediaData = await gql<{
      productCreateMedia: { mediaUserErrors: { field: string[]; message: string }[] };
    }>(
      `mutation ($productId: ID!, $media: [CreateMediaInput!]!) {
        productCreateMedia(productId: $productId, media: $media) {
          mediaUserErrors { field message }
        }
      }`,
      {
        productId,
        media: input.imageUrls.map((url) => ({ originalSource: url, mediaContentType: "IMAGE" })),
      }
    );
    if (mediaData.productCreateMedia.mediaUserErrors.length > 0) {
      throw new Error(`Ajout images: ${JSON.stringify(mediaData.productCreateMedia.mediaUserErrors)}`);
    }
  }

  const collData = await gql<{
    collectionAddProducts: { userErrors: { field: string[]; message: string }[] };
  }>(
    `mutation ($id: ID!, $productIds: [ID!]!) {
      collectionAddProducts(id: $id, productIds: $productIds) {
        userErrors { field message }
      }
    }`,
    { id: input.collectionId, productIds: [productId] }
  );
  if (collData.collectionAddProducts.userErrors.length > 0) {
    throw new Error(`Ajout à la collection: ${JSON.stringify(collData.collectionAddProducts.userErrors)}`);
  }

  const numericId = productId.split("/").pop();
  return { id: productId, adminUrl: `https://${STORE}/admin/products/${numericId}` };
}
