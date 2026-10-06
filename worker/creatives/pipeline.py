"""Pipeline Créatives : une demande = 5 angles marketing, générés UN PAR UN
(jamais en parallèle), chacun dans une conversation Gemini neuve.

Le CRM envoie les prompts finaux (voir lib/creative-angles.ts) : ce module ne
connaît aucun texte publicitaire, il les transmet tels quels au fournisseur.
"""

import logging
import random
import time
from pathlib import Path
from urllib.parse import urlparse

import crm
from config import IMAGE_RETRIES, QUEUE_TMP_DIR
from providers.base import GenerationFailed, ImageProvider, ProviderBlocked
from state import Activity


class Paused(Exception):
    """Gemini bloque le programme : arrêter proprement et passer en pause."""

    def __init__(self, issue: str, message: str):
        super().__init__(message)
        self.issue = issue
        self.message = message


def _download_photo(request: dict) -> Path:
    QUEUE_TMP_DIR.mkdir(exist_ok=True)
    ext = Path(urlparse(request["sourcePhotoUrl"]).path).suffix or ".jpg"
    return crm.download_to(request["sourcePhotoUrl"], QUEUE_TMP_DIR / f"creative-{request['id']}{ext}")


def _generate_with_retries(provider: ImageProvider, photo: Path, prompt: str, label: str):
    """1 tentative + IMAGE_RETRIES nouvelles, chacune dans un nouveau chat.
    ProviderBlocked remonte tout de suite (ce n'est pas un échec d'image)."""
    reasons: list[str] = []
    attempts = IMAGE_RETRIES + 1
    for attempt in range(1, attempts + 1):
        try:
            return provider.generate(photo, prompt, label)
        except GenerationFailed as exc:
            reasons.append(f"tentative {attempt}/{attempts} : {exc}")
            logging.warning("[%s] %s", label, reasons[-1])
            if attempt < attempts:
                time.sleep(random.uniform(*provider.retry_pause))
    raise GenerationFailed(" ; ".join(reasons))


def process_request(request: dict, provider: ImageProvider, activity: Activity) -> int:
    """Traite les images EN_ATTENTE d'une demande. Renvoie le nombre d'images
    terminées. Lève Paused si Gemini bloque (l'image en cours est remise en
    attente, sans échec)."""
    name = request["productName"]
    images = sorted(request["images"], key=lambda i: i["position"])
    logging.info("Créatives : demande %s (%s), %d image(s) à générer.", request["id"], name, len(images))

    photo: Path | None = None
    done = 0
    try:
        photo = _download_photo(request)
        for index, image in enumerate(images):
            image_id = image["id"]
            label = f"{name} — image {image['position']}/5"
            if not crm.start_image(image_id):
                logging.info("[%s] déjà prise, ignorée.", label)
                continue
            activity.creative(f"Créatives : {label}")
            try:
                generated = _generate_with_retries(provider, photo, image["prompt"], label)
            except ProviderBlocked as blocked:
                crm.release_image(image_id)
                logging.warning("[%s] Gemini bloqué (%s) : image remise en attente, pause.", label, blocked.issue)
                raise Paused(blocked.issue, blocked.message) from blocked
            except GenerationFailed as exc:
                crm.fail_image(image_id, str(exc))
                logging.error("[%s] ÉCHEC : %s", label, exc)
                continue
            except Exception as exc:  # noqa: BLE001 — une image en erreur ne doit pas bloquer les autres
                crm.fail_image(image_id, f"Erreur inattendue : {exc}")
                logging.exception("[%s] erreur inattendue", label)
                continue

            try:
                url = crm.upload_image(image_id, generated.data, generated.mime)
                done += 1
                logging.info(
                    "[%s] OK (%s, %sx%s, %d octets) -> %s",
                    label, generated.source or provider.name, generated.width, generated.height, len(generated.data), url,
                )
            except crm.CrmError as exc:
                crm.fail_image(image_id, f"Envoi de l'image au CRM impossible : {exc}")
                logging.error("[%s] envoi refusé : %s", label, exc)

            if index < len(images) - 1:
                pause = random.uniform(*provider.pause_between_images)
                if pause > 0:
                    time.sleep(pause)
    finally:
        activity.idle()
        if photo is not None:
            photo.unlink(missing_ok=True)
    return done
