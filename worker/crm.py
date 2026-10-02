"""Client HTTP du CRM (production ou local selon CRM_BASE_URL).

Toutes les routes sont protégées par WORKER_SECRET (Authorization: Bearer).
Le secret n'est jamais journalisé.
"""

import io
import json
import logging
import mimetypes
from pathlib import Path

import requests

from config import CRM_BASE_URL, HTTP_TIMEOUT_S, MAX_UPLOAD_BYTES, WORKER_SECRET


class CrmError(RuntimeError):
    """Réponse d'erreur du CRM (code HTTP conservé pour les décisions du pipeline)."""

    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


def _headers() -> dict:
    return {"Authorization": f"Bearer {WORKER_SECRET}"}


def _check(res: requests.Response, what: str) -> requests.Response:
    if res.ok:
        return res
    try:
        detail = res.json().get("error") or res.text[:200]
    except ValueError:
        detail = res.text[:200]
    raise CrmError(f"{what} : HTTP {res.status_code} — {detail}", res.status_code)


def configured() -> str | None:
    """None si la configuration est complète, sinon le message d'erreur."""
    if not CRM_BASE_URL:
        return "CRM_BASE_URL manquant (worker/.env)"
    if not WORKER_SECRET:
        return "WORKER_SECRET manquant (worker/.env)"
    return None


# ─── Battement de cœur (commun aux deux files) ──────────────────────────────


def heartbeat(payload: dict) -> None:
    """Jamais bloquant : le CRM peut être momentanément injoignable."""
    try:
        _check(
            requests.post(f"{CRM_BASE_URL}/api/worker/heartbeat", headers=_headers(), json=payload, timeout=10),
            "heartbeat",
        )
    except (requests.RequestException, CrmError) as exc:
        logging.warning("Battement de cœur non envoyé : %s", exc)


# ─── File Créatives ─────────────────────────────────────────────────────────


def next_creative_request() -> dict | None:
    res = _check(
        requests.get(f"{CRM_BASE_URL}/api/worker/creatives/next", headers=_headers(), timeout=HTTP_TIMEOUT_S),
        "creatives/next",
    )
    return res.json().get("request")


def start_image(image_id: str) -> bool:
    """False si l'image a déjà été prise (409) — pas une erreur."""
    res = requests.post(f"{CRM_BASE_URL}/api/worker/creatives/images/{image_id}/start", headers=_headers(), timeout=HTTP_TIMEOUT_S)
    if res.status_code == 409:
        return False
    _check(res, "start image")
    return True


def release_image(image_id: str) -> None:
    _check(
        requests.post(f"{CRM_BASE_URL}/api/worker/creatives/images/{image_id}/release", headers=_headers(), timeout=HTTP_TIMEOUT_S),
        "release image",
    )


def fail_image(image_id: str, message: str) -> None:
    _check(
        requests.post(
            f"{CRM_BASE_URL}/api/worker/creatives/images/{image_id}/fail",
            headers=_headers(),
            json={"errorMessage": message[:500]},
            timeout=HTTP_TIMEOUT_S,
        ),
        "fail image",
    )


def fit_for_upload(data: bytes, mime: str) -> tuple[bytes, str, str]:
    """(octets, type MIME, extension) prêts pour l'envoi. Vercel limite chaque
    requête à 4,5 Mo : une image plus lourde est ré-encodée en JPEG de haute
    qualité (qualité décroissante, puis réduction si besoin) — jamais envoyée
    telle quelle pour échouer sans message côté plateforme."""
    ext = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}.get(mime, "png")
    if len(data) <= MAX_UPLOAD_BYTES:
        return data, mime, ext

    from PIL import Image  # import tardif : inutile pour les petites images

    with Image.open(io.BytesIO(data)) as im:
        im = im.convert("RGB")  # JPEG sans transparence
        scale = 1.0
        while True:
            work = im if scale == 1.0 else im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))))
            for quality in (95, 92, 88, 84, 80):
                buf = io.BytesIO()
                work.save(buf, format="JPEG", quality=quality, optimize=True)
                if buf.tell() <= MAX_UPLOAD_BYTES:
                    logging.info(
                        "Image ré-encodée en JPEG q%d (%d -> %d octets, échelle %.2f)", quality, len(data), buf.tell(), scale
                    )
                    return buf.getvalue(), "image/jpeg", "jpg"
            scale *= 0.85
            if scale < 0.3:
                raise CrmError("Image trop lourde même après ré-encodage")


def upload_image(image_id: str, data: bytes, mime: str) -> str:
    """Envoie l'image générée ; renvoie son URL Blob."""
    payload, content_type, ext = fit_for_upload(data, mime)
    res = requests.post(
        f"{CRM_BASE_URL}/api/worker/creatives/images/{image_id}/upload",
        headers=_headers(),
        files={"image": (f"image.{ext}", payload, content_type)},
        timeout=max(HTTP_TIMEOUT_S, 90),
    )
    return _check(res, "upload image").json().get("url", "")


def download_to(url: str, dest: Path) -> Path:
    """Télécharge une photo (Blob public) vers dest."""
    res = requests.get(url, timeout=HTTP_TIMEOUT_S)
    res.raise_for_status()
    dest.write_bytes(res.content)
    return dest


# ─── File Création produits (inchangée par rapport à l'ancien worker.py) ────


def fetch_next_product_job() -> dict | None:
    res = requests.get(f"{CRM_BASE_URL}/api/product-jobs/next", headers=_headers(), timeout=HTTP_TIMEOUT_S)
    res.raise_for_status()
    return res.json().get("job")


def report_product_created(
    job_id: str,
    image_paths: list[Path],
    *,
    cost: float | None,
    sku: str | None,
    sell_price: float | None,
    compare_at_price: float | None,
    shopify_product_id: str,
    shopify_product_url: str,
    missing_fields: list[str],
    note: str | None,
) -> None:
    files = [("images", (p.name, open(p, "rb"), mimetypes.guess_type(p.name)[0] or "image/png")) for p in image_paths]
    data = {
        "cost": "" if cost is None else str(cost),
        "sku": sku or "",
        "sellPrice": "" if sell_price is None else str(sell_price),
        "compareAtPrice": "" if compare_at_price is None else str(compare_at_price),
        "shopifyProductId": shopify_product_id,
        "shopifyProductUrl": shopify_product_url,
        "missingFields": json.dumps(missing_fields),
        "note": note or "",
    }
    try:
        res = requests.post(
            f"{CRM_BASE_URL}/api/product-jobs/{job_id}/created",
            headers=_headers(),
            files=files,
            data=data,
            timeout=HTTP_TIMEOUT_S,
        )
        res.raise_for_status()
    finally:
        for _, (_, fh, _) in files:
            fh.close()


def report_product_fail(job_id: str, error_message: str) -> None:
    try:
        res = requests.post(
            f"{CRM_BASE_URL}/api/product-jobs/{job_id}/fail",
            headers=_headers(),
            json={"errorMessage": error_message},
            timeout=HTTP_TIMEOUT_S,
        )
        res.raise_for_status()
    except requests.RequestException as exc:
        # Le CRM est peut-être injoignable : on garde tout dans le log
        # (le job restera "En cours" côté CRM, relançable depuis la page).
        logging.error("Impossible de signaler l'échec du job %s au CRM (%s). Message : %s", job_id, exc, error_message)
