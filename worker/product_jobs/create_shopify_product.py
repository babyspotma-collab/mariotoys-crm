#!/usr/bin/env python
"""
create_shopify_product.py — création produit Shopify Mario Toys (brouillon)

Reprend le pattern déjà éprouvé de create-product.js (projet Mediva,
C:\\Users\\user\\mediva-automation\\) en Python, adapté aux règles Mario
Toys — voir REGLES_PRODUIT.md (pas de tailles/variantes, âge à la place,
formule de prix différente, ajout automatique aux canaux de vente).

Usage :
  venv\\Scripts\\python.exe create_shopify_product.py image1.png [image2.png ...]
  venv\\Scripts\\python.exe create_shopify_product.py --list-collections
  venv\\Scripts\\python.exe create_shopify_product.py --list-tags

product-input.json (écrit par Claude avant l'appel) :
  {
    "title":    "...",
    "about":    "Texte brut — paragraphe 'À propos de cet article'",
    "features": ["Ligne 1", "Ligne 2", ...],
    "age":      "3-5 ans",              // jamais vide
    "price":    249,                     // déjà arrondi (coût × 2,1, puis règle d'arrondi)
    "cost":     220,                     // coût d'achat brut (nom de fichier ou photo)
    "sku":      "25415",                 // référence visible sur la photo, sinon null/absent
    "tags":     ["Nouveauté", "3-5 ans", ...],
    "category": "Voitures",              // nom de collection existante | "Autre"
    "stock":    10
  }

Règles fixes (voir REGLES_PRODUIT.md) :
  - Taxable toujours décoché (taxable: false)
  - Prix de comparaison : entier se terminant par 9, remise affichée 10-30 %
  - Produit créé en brouillon, ajouté aux canaux de vente
"""

import argparse
import json
import math
import random
import sys
import uuid
from pathlib import Path

import requests

from config import (
    PRODUCT_INPUT_FILE,
    SHOPIFY_API_VERSION,
    SHOPIFY_CLIENT_ID,
    SHOPIFY_CLIENT_SECRET,
    SHOPIFY_STORE,
)

# ─── Auth ────────────────────────────────────────────────────────────────────


def get_access_token() -> str:
    res = requests.post(
        f"https://{SHOPIFY_STORE}/admin/oauth/access_token",
        json={
            "client_id": SHOPIFY_CLIENT_ID,
            "client_secret": SHOPIFY_CLIENT_SECRET,
            "grant_type": "client_credentials",
        },
    )
    if not res.ok:
        raise RuntimeError(f"Auth échouée ({res.status_code}): {res.text}")
    data = res.json()
    if "access_token" not in data:
        raise RuntimeError(f"Pas de token: {data}")
    return data["access_token"]


def gql(token: str, query: str, variables: dict | None = None) -> dict:
    res = requests.post(
        f"https://{SHOPIFY_STORE}/admin/api/{SHOPIFY_API_VERSION}/graphql.json",
        headers={"Content-Type": "application/json", "X-Shopify-Access-Token": token},
        json={"query": query, "variables": variables or {}},
    )
    if not res.ok:
        raise RuntimeError(f"GraphQL HTTP {res.status_code}: {res.text}")
    body = res.json()
    if body.get("errors"):
        raise RuntimeError(f"GraphQL errors: {json.dumps(body['errors'], ensure_ascii=False)}")
    return body["data"]


# ─── Description (texte brut → HTML minimal compatible Shopify) ──────────────


def esc(s: str) -> str:
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def build_description_html(info: dict) -> str:
    features_html = "<br>".join(esc(f) for f in info["features"])
    return (
        f"<p><strong>{esc(info['title'])}</strong></p>"
        f"<p><strong>À propos de cet article</strong><br>{esc(info['about'])}</p>"
        f"<p><strong>Caractéristiques principales</strong><br>{features_html}</p>"
        f"<p><strong>Âge recommandé</strong><br>{esc(info['age'])}</p>"
    )


# ─── Prix / remise ─────────────────────────────────────────────────────────


def compute_sell_price(cost: float) -> int:
    """Prix de vente = coût x 2,1, arrondi au multiple de 50 DH supérieur,
    -1 DH (jamais un prix qui finit par 0). Voir REGLES_PRODUIT.md."""
    return math.ceil((cost * 2.1) / 50) * 50 - 1


def compute_compare_at_price(price: float) -> int:
    """compareAtPrice toujours un entier se terminant par 9 (jamais de
    décimales), choisi aléatoirement parmi les valeurs donnant une remise
    affichée entre 10 % et 30 % par rapport au prix de vente (voir
    REGLES_PRODUIT.md)."""
    low = price / 0.90  # remise = 10 % à ce compareAtPrice
    high = price / 0.70  # remise = 30 % à ce compareAtPrice

    c = (int(low) // 10) * 10 + 9  # premier "...9" >= plancher approx.
    if c < low:
        c += 10

    candidates = []
    while c <= high:
        if c > price:
            candidates.append(c)
        c += 10

    if not candidates:
        # Plage trop étroite (prix très bas) — prend le premier "...9"
        # strictement au-dessus du prix de vente, quitte à dépasser 30 %.
        c = (int(price) // 10) * 10 + 9
        while c <= price:
            c += 10
        candidates = [c]

    return random.choice(candidates)


# ─── Collections ──────────────────────────────────────────────────────────────


def list_collections(token: str) -> list[dict]:
    data = gql(token, """
        query {
          collections(first: 100) {
            edges { node { id title } }
          }
        }
    """)
    return [e["node"] for e in data["collections"]["edges"]]


def find_collection_id(token: str, title: str) -> str | None:
    for c in list_collections(token):
        if c["title"].lower() == title.lower():
            return c["id"]
    return None


# ─── Tags (agrégés depuis les produits existants) ─────────────────────────────


def list_existing_tags(token: str) -> list[str]:
    tag_set = set()
    cursor = None
    for _ in range(5):  # jusqu'à 1250 produits
        data = gql(token, """
            query ($cursor: String) {
              products(first: 250, after: $cursor) {
                edges { cursor node { tags } }
                pageInfo { hasNextPage }
              }
            }
        """, {"cursor": cursor})
        edges = data["products"]["edges"]
        for e in edges:
            tag_set.update(e["node"]["tags"])
        if not data["products"]["pageInfo"]["hasNextPage"] or not edges:
            break
        cursor = edges[-1]["cursor"]
    return sorted(tag_set)


# ─── Stock (inventaire) ────────────────────────────────────────────────────


def get_primary_location_id(token: str) -> str | None:
    data = gql(token, """
        query {
          locations(first: 1) {
            edges { node { id } }
          }
        }
    """)
    edges = data["locations"]["edges"]
    return edges[0]["node"]["id"] if edges else None


def get_current_stock(token: str, inventory_item_id: str, location_id: str) -> int:
    data = gql(token, """
        query ($id: ID!, $locationId: ID!) {
          inventoryItem(id: $id) {
            inventoryLevel(locationId: $locationId) {
              quantities(names: ["available"]) { quantity }
            }
          }
        }
    """, {"id": inventory_item_id, "locationId": location_id})
    level = data["inventoryItem"]["inventoryLevel"]
    if not level or not level["quantities"]:
        return 0
    return level["quantities"][0]["quantity"]


def set_stock(token: str, inventory_item_id: str, location_id: str, quantity: int) -> None:
    # changeFromQuantity requis par l'API (garde-fou anti-race-condition) —
    # doit correspondre exactement à la quantité déjà persistée (0 pour un
    # article tout juste créé, mais pas pour une correction ultérieure —
    # vérifié en pratique : "no longer matches the persisted quantity"
    # sinon). @idempotent va sur le CHAMP (pas la mutation) et exige une
    # clé unique — les deux aussi constatés en pratique.
    change_from = get_current_stock(token, inventory_item_id, location_id)
    data = gql(token, """
        mutation inventorySetQuantities($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
          inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
            userErrors { field message }
          }
        }
    """, {
        "input": {
            "name": "available",
            "reason": "correction",
            "quantities": [{
                "inventoryItemId": inventory_item_id,
                "locationId": location_id,
                "quantity": quantity,
                "changeFromQuantity": change_from,
            }],
        },
        "idempotencyKey": str(uuid.uuid4()),
    })
    errors = data["inventorySetQuantities"]["userErrors"]
    if errors:
        raise RuntimeError(f"Erreur stock: {errors}")


# ─── Création du produit ──────────────────────────────────────────────────────


def create_draft_product(token: str, info: dict) -> dict:
    description_html = build_description_html(info)

    create_data = gql(token, """
        mutation productCreate($input: ProductInput!) {
          productCreate(input: $input) {
            product {
              id title status
              variants(first: 1) { edges { node { id inventoryItem { id } } } }
            }
            userErrors { field message }
          }
        }
    """, {
        "input": {
            "title": info["title"],
            "descriptionHtml": description_html,
            "status": "DRAFT",
            "tags": info.get("tags", []),
        },
    })

    errors = create_data["productCreate"]["userErrors"]
    if errors:
        raise RuntimeError(f"Erreur création produit: {errors}")

    product = create_data["productCreate"]["product"]
    product_id = product["id"]
    variant = product["variants"]["edges"][0]["node"]
    variant_id = variant["id"]
    inventory_item_id = variant["inventoryItem"]["id"]

    # Prix/coût/SKU peuvent être absents (photo sans texte lisible — voir
    # REGLES_PRODUIT.md, "SI UNE INFO MANQUE") : le produit est créé quand
    # même en brouillon, avec ces champs vides côté Shopify (prix par
    # défaut à 0, laissé tel quel plutôt que deviné), et le tag "À
    # compléter" (voir main()/worker.py, qui construit la liste tags).
    price = info.get("price")
    compare_at_price = compute_compare_at_price(price) if price is not None else None

    variant_input = {
        "id": variant_id,
        "taxable": False,
        "inventoryItem": {
            "cost": str(info["cost"]) if info.get("cost") is not None else None,
            "tracked": True,
            "sku": info["sku"] if info.get("sku") else None,
        },
    }
    if price is not None:
        variant_input["price"] = str(price)
    if compare_at_price is not None:
        variant_input["compareAtPrice"] = str(compare_at_price)

    # productVariantUpdate n'existe plus en API 2026-07 (dépréciée au
    # profit du bulk, même sur un produit à variante unique) — vérifié en
    # pratique (erreur "doesn't exist on type 'Mutation'").
    variant_update = gql(token, """
        mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            productVariants { id price compareAtPrice }
            userErrors { field message }
          }
        }
    """, {
        "productId": product_id,
        "variants": [variant_input],
    })
    errors = variant_update["productVariantsBulkUpdate"]["userErrors"]
    if errors:
        raise RuntimeError(f"Erreur mise à jour variante: {errors}")

    stock = info.get("stock", 10)
    location_id = get_primary_location_id(token)
    if location_id:
        set_stock(token, inventory_item_id, location_id, stock)
    else:
        print("  ⚠ Aucun emplacement (location) trouvé — stock non défini.")

    return {"id": product_id, "title": product["title"], "status": product["status"],
            "compareAtPrice": compare_at_price}


# ─── Upload d'images ──────────────────────────────────────────────────────────


def mime_type(file_path: str) -> str:
    ext = Path(file_path).suffix.lower()
    return {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
    }.get(ext, "image/jpeg")


def upload_images(token: str, product_id: str, image_paths: list[str]) -> int:
    if not image_paths:
        return 0

    stage_data = gql(token, """
        mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
          stagedUploadsCreate(input: $input) {
            stagedTargets {
              url resourceUrl
              parameters { name value }
            }
            userErrors { field message }
          }
        }
    """, {
        "input": [{
            "filename": Path(p).name,
            "mimeType": mime_type(p),
            "resource": "IMAGE",
            "fileSize": str(Path(p).stat().st_size),
        } for p in image_paths],
    })

    errors = stage_data["stagedUploadsCreate"]["userErrors"]
    if errors:
        raise RuntimeError(f"Erreur staging: {errors}")
    staged_targets = stage_data["stagedUploadsCreate"]["stagedTargets"]

    # PUT direct sur l'URL déjà signée (V4 GCS, signature dans la query
    # string) — pas un POST multipart avec policy en champs séparés comme
    # d'anciennes versions de l'API Shopify/GCS. Vérifié en pratique : un
    # POST multipart échoue avec SignatureDoesNotMatch sur cette réponse
    # de stagedUploadsCreate (seuls content_type/acl sont renvoyés comme
    # "parameters", pas les champs de policy classiques).
    resource_urls = []
    for i, image_path in enumerate(image_paths):
        target = staged_targets[i]
        params = {p["name"]: p["value"] for p in target["parameters"]}
        content_type = params.get("content_type", mime_type(image_path))
        with open(image_path, "rb") as f:
            data = f.read()
        up = requests.put(target["url"], data=data, headers={"Content-Type": content_type})
        if not up.ok:
            raise RuntimeError(f"Upload image {i + 1} échoué ({up.status_code}): {up.text[:300]}")
        resource_urls.append(target["resourceUrl"])
        print(f"  ✓ Image {i + 1}/{len(image_paths)} uploadée")

    media_data = gql(token, """
        mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
          productCreateMedia(productId: $productId, media: $media) {
            media { ... on MediaImage { id image { url } } }
            mediaUserErrors { field message }
          }
        }
    """, {
        "productId": product_id,
        "media": [{"originalSource": url, "mediaContentType": "IMAGE"} for url in resource_urls],
    })

    media_errors = media_data["productCreateMedia"]["mediaUserErrors"]
    if media_errors:
        raise RuntimeError(f"Erreur médias: {media_errors}")

    return len(resource_urls)


# ─── Collection assignment ────────────────────────────────────────────────────


def add_to_collection(token: str, product_id: str, collection_id: str) -> None:
    data = gql(token, """
        mutation collectionAddProducts($id: ID!, $productIds: [ID!]!) {
          collectionAddProducts(id: $id, productIds: $productIds) {
            collection { id title }
            userErrors { field message }
          }
        }
    """, {"id": collection_id, "productIds": [product_id]})
    errors = data["collectionAddProducts"]["userErrors"]
    if errors:
        raise RuntimeError(f"Erreur collection: {errors}")


# ─── Canaux de vente ────────────────────────────────────────────────────────


def publish_to_all_channels(token: str, product_id: str) -> int:
    """Sans ça, un produit reste invisible sur le site même une fois passé
    en statut actif plus tard (règle Mario Toys, voir REGLES_PRODUIT.md)."""
    data = gql(token, """
        query {
          publications(first: 20) {
            edges { node { id name } }
          }
        }
    """)
    publications = [e["node"] for e in data["publications"]["edges"]]
    if not publications:
        return 0

    pub_data = gql(token, """
        mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
          publishablePublish(id: $id, input: $input) {
            userErrors { field message }
          }
        }
    """, {
        "id": product_id,
        "input": [{"publicationId": p["id"]} for p in publications],
    })
    errors = pub_data["publishablePublish"]["userErrors"]
    if errors:
        raise RuntimeError(f"Erreur publication canaux: {errors}")
    return len(publications)


# ─── Main ─────────────────────────────────────────────────────────────────────


def main():
    if not SHOPIFY_STORE or not SHOPIFY_CLIENT_ID or not SHOPIFY_CLIENT_SECRET:
        print("❌ Variables manquantes dans .env : SHOPIFY_STORE, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET")
        sys.exit(1)

    parser = argparse.ArgumentParser()
    parser.add_argument("images", nargs="*", help="Chemins des images validées à attacher")
    parser.add_argument("--list-collections", action="store_true")
    parser.add_argument("--list-tags", action="store_true")
    args = parser.parse_args()

    if args.list_collections:
        token = get_access_token()
        cols = list_collections(token)
        print("\n📁 Collections existantes :")
        for c in cols:
            print(f"  - {c['title']}  ({c['id']})")
        return

    if args.list_tags:
        token = get_access_token()
        tags = list_existing_tags(token)
        print("\n🏷️  Tags existants :")
        print("  " + ", ".join(tags))
        return

    if not PRODUCT_INPUT_FILE.exists():
        print(f"❌ Fichier introuvable : {PRODUCT_INPUT_FILE}")
        print("   Demande à Claude de générer ce fichier avant de lancer le script.")
        sys.exit(1)

    try:
        info = json.loads(PRODUCT_INPUT_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"❌ product-input.json invalide : {e}")
        sys.exit(1)

    required = ["title", "about", "features", "age", "price", "category"]
    missing = [k for k in required if not info.get(k)]
    if missing:
        print(f"❌ Champs manquants dans product-input.json : {', '.join(missing)}")
        sys.exit(1)

    image_paths = [p for p in args.images if Path(p).exists()]
    for p in args.images:
        if not Path(p).exists():
            print(f"  ⚠ Image introuvable, ignorée : {p}")

    print("\n🔐 Récupération du token OAuth...")
    token = get_access_token()
    print("  ✓ Token obtenu")

    print("\n🔍 Test de connexion...")
    shop = gql(token, "{ shop { name primaryDomain { url } } }")
    print(f"  ✓ Connecté à : {shop['shop']['name']} ({shop['shop']['primaryDomain']['url']})")

    print("\n📋 Produit à créer :")
    print(f"  Titre      : {info['title']}")
    print(f"  Prix       : {info['price']} DH" + (f" (coût : {info['cost']} DH)" if info.get("cost") is not None else ""))
    print(f"  Âge        : {info['age']}")
    print(f"  SKU        : {info.get('sku') or '(vide)'}")
    print(f"  Tags       : {', '.join(info.get('tags', [])) or 'aucun'}")
    print(f"  Catégorie  : {info['category']}")
    print(f"  Stock      : {info.get('stock', 10)}")
    if image_paths:
        print(f"  Images     : {', '.join(image_paths)}")

    print("\n📦 Création du produit en brouillon...")
    product = create_draft_product(token, info)
    numeric_id = product["id"].split("/")[-1]
    print(f"  ✓ Produit créé : \"{product['title']}\" — statut : {product['status']}")
    print(f"  ✓ Prix de comparaison : {product['compareAtPrice']} DH")

    if image_paths:
        print(f"\n🖼️  Upload des images ({len(image_paths)})...")
        uploaded = upload_images(token, product["id"], image_paths)
        print(f"  ✓ {uploaded} image(s) attachée(s)")

    if info["category"] and info["category"] != "Autre":
        print(f"\n📁 Assignation à la collection \"{info['category']}\"...")
        col_id = find_collection_id(token, info["category"])
        if col_id:
            add_to_collection(token, product["id"], col_id)
            print(f"  ✓ Ajouté à la collection \"{info['category']}\"")
        else:
            print(f"  ⚠ Collection \"{info['category']}\" introuvable — créez-la dans l'admin Shopify")

    print("\n📡 Ajout aux canaux de vente...")
    n_channels = publish_to_all_channels(token, product["id"])
    print(f"  ✓ Ajouté à {n_channels} canal/canaux")

    print("\n" + "─" * 60)
    print("✅  Produit créé avec succès !")
    print(f"\n🔗 Lien admin :\nhttps://{SHOPIFY_STORE}/admin/products/{numeric_id}")
    print("─" * 60 + "\n")


if __name__ == "__main__":
    main()
