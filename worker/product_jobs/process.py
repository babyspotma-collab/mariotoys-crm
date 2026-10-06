"""File Création produits — logique REPRISE À L'IDENTIQUE de l'ancien
worker.py (process_queue / download_photo) : analyse de la photo par Claude,
visuel Gemini (nouveau chat par tentative, 2 réessais, aucun repli sur la
photo d'origine), création du produit Shopify en brouillon.

Seuls changements : le câblage (heartbeat -> state.Activity, appels HTTP ->
crm.py) et le fait que la fonction ne sonde la file que lorsqu'on l'appelle
(le programme unique décide quand — /api/product-jobs/next réclame le job).
"""

import logging
import traceback
from pathlib import Path
from urllib.parse import urlparse

import requests

import crm
from config import QUEUE_TMP_DIR, SHOPIFY_STORE
from product_jobs.claude_analysis import analyze_photo
from product_jobs.create_shopify_product import (
    add_to_collection,
    compute_sell_price,
    create_draft_product,
    get_access_token,
    list_collections,
    list_existing_tags,
    publish_to_all_channels,
    upload_images,
)
from product_jobs.product_pipeline import VisualGenerationError, generate_visual
from state import Activity


def download_photo(job: dict) -> Path:
    QUEUE_TMP_DIR.mkdir(exist_ok=True)
    url = job["originalPhotoUrl"]
    # Garde l'extension d'origine (nécessaire pour que Chrome/Gemini accepte
    # le fichier) ; le nom du fichier lui-même est ignoré côté génération.
    ext = Path(urlparse(url).path).suffix or ".jpg"
    dest = QUEUE_TMP_DIR / f"{job['id']}{ext}"
    res = requests.get(url, timeout=30)
    res.raise_for_status()
    dest.write_bytes(res.content)
    return dest


def process_product_queue(activity: Activity) -> bool:
    """Traite UN job produit s'il y en a un. True si un job a été récupéré."""
    try:
        job = crm.fetch_next_product_job()
    except requests.RequestException as exc:
        logging.error("Impossible de contacter le CRM : %s", exc)
        return False

    if not job:
        return False

    job_id = job["id"]
    logging.info("Job %s récupéré (%s).", job_id, job["originalFilename"])
    activity.product(job, "READING")

    try:
        photo_path = download_photo(job)

        token = get_access_token()
        collections = list_collections(token)
        existing_tags = list_existing_tags(token)
        collection_titles = [c["title"] for c in collections]

        # 1. Analyse de la photo et fiche : Claude.
        reading = analyze_photo(photo_path, existing_tags, collection_titles)
        logging.info(
            "Job %s : analyse Claude OK (%s, coût %s, SKU %s).",
            job_id, reading["title"], reading["cost"], reading["sku"],
        )

        # 2. Visuel : 100 % Gemini (nouveau chat par tentative, 2 réessais).
        # Aucun repli sur la photo d'origine : sans visuel, le job passe en
        # erreur et Shopify n'est ni créé ni modifié.
        activity.product(job, "GENERATING")
        try:
            image_paths = generate_visual(job_id, photo_path)
        except VisualGenerationError as exc:
            message = f"Erreur – visuel non généré : {exc}"
            logging.error("Job %s : %s", job_id, message)
            crm.report_product_fail(job_id, message)
            return True
        notes = []
        if reading["colors"]:
            # Variantes pas encore créées automatiquement : signalé sur le job.
            notes.append(f"Couleurs détectées : {', '.join(reading['colors'])} (variantes à créer à la main).")
        note = " ".join(notes) or None

        cost = reading.get("cost")
        sku = reading.get("sku")
        missing_fields = []
        if cost is None:
            missing_fields.append("cost")
        if not sku:
            missing_fields.append("sku")

        sell_price = compute_sell_price(cost) if cost is not None else None

        tags = list(reading.get("tags") or [])
        if missing_fields and "À compléter" not in tags:
            tags.append("À compléter")

        category = reading.get("category")
        info = {
            "title": reading["title"],
            "about": reading["about"],
            "features": reading.get("features") or [],
            "age": reading["age"],
            "price": sell_price,
            "cost": cost,
            "sku": sku,
            "tags": tags,
            "category": category,
            "stock": 10,
        }

        activity.product(job, "SHOPIFY")
        product = create_draft_product(token, info)

        if image_paths:
            upload_images(token, product["id"], [str(p) for p in image_paths])

        if category:
            match = next((c for c in collections if c["title"].lower() == category.lower()), None)
            if match:
                add_to_collection(token, product["id"], match["id"])
            else:
                logging.warning("Job %s : collection \"%s\" introuvable — ignorée.", job_id, category)

        publish_to_all_channels(token, product["id"])

        numeric_id = product["id"].split("/")[-1]
        shopify_url = f"https://{SHOPIFY_STORE}/admin/products/{numeric_id}"

        crm.report_product_created(
            job_id,
            image_paths,
            cost=cost,
            sku=sku,
            sell_price=sell_price,
            compare_at_price=product.get("compareAtPrice"),
            shopify_product_id=product["id"],
            shopify_product_url=shopify_url,
            missing_fields=missing_fields,
            note=note,
        )
        logging.info(
            "Job %s terminé : produit Shopify créé (%s)%s.",
            job_id, shopify_url, " — À compléter" if missing_fields else "",
        )
    except Exception as exc:  # noqa: BLE001 — un job en échec ne doit jamais planter le programme
        logging.error("Job %s : erreur —\n%s", job_id, traceback.format_exc())
        crm.report_product_fail(job_id, str(exc))
    finally:
        activity.idle()
        # Nettoyage de la photo téléchargée — elle reste consultable côté CRM.
        try:
            photo_path.unlink(missing_ok=True)
        except NameError:
            pass
    return True
