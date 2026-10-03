"""Fournisseur "gemini-web" : interface web de Gemini pilotée dans le vrai
Chrome (CDP), compte Google secondaire, aucune API payante.

Réutilise les fonctions éprouvées de la file Création produits
(product_jobs/product_pipeline.py : attente de la zone de saisie, envoi de la
photo + attente de sa miniature, envoi du prompt avec contrôle de l'URL de
conversation, collecte des images) ; ajoute la classification précise des
blocages et la récupération pleine résolution.

Chaque appel = un nouvel onglet = une nouvelle conversation, refermé à la fin
(jamais tout Chrome : c'est un navigateur partagé).
"""

import io
import logging
import re
import tempfile
from pathlib import Path

from playwright.sync_api import TimeoutError as PWTimeoutError, sync_playwright
from PIL import Image

from config import (
    CDP_URL,
    CREATIVES_FULLSIZE_DOWNLOAD,
    DELAY_BEFORE_UPLOAD,
    GEMINI_URL,
)
from gemini_session import (
    classify_page,
    click_upload_button,
    ensure_chrome_running,
    human_pause,
)
from product_jobs.product_pipeline import (
    AttemptFailed,
    _collect_images,
    _first_line,
    _send_prompt,
    _wait_for_thumbnail,
    _wait_page_ready,
)
from providers.base import GeneratedImage, GenerationFailed, ImageProvider, ProviderBlocked

_FULLSIZE_BUTTON = re.compile(r"(télécharger|download).*(taille réelle|full[- ]?size|original)", re.IGNORECASE)
_MIME_BY_FORMAT = {"PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp"}


def _safe_handle(label: str) -> str:
    """Nom de fichier sûr dérivé de l'étiquette (« TEST-pot — image 1/5 »
    contient un « / » qui serait pris pour un sous-dossier)."""
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", label).strip("_") or "image"


def _describe(data: bytes) -> tuple[str, int, int]:
    """(mime, largeur, hauteur) — lève ValueError si ce n'est pas une image."""
    with Image.open(io.BytesIO(data)) as im:
        mime = _MIME_BY_FORMAT.get(im.format or "")
        if not mime:
            raise ValueError(f"format d'image inattendu : {im.format}")
        return mime, im.width, im.height


class GeminiWebProvider(ImageProvider):
    name = "gemini-web"
    pause_between_images = (8, 20)
    retry_pause = (5, 12)

    def prepare(self) -> bool:
        return ensure_chrome_running()

    # ── Blocages ────────────────────────────────────────────────────────────

    def _raise_if_blocked(self, page) -> None:
        blocked = classify_page(page)
        if blocked:
            raise ProviderBlocked(*blocked)

    def check_ready(self) -> tuple[str, str] | None:
        if not ensure_chrome_running():
            # Chrome introuvable : ce n'est pas un blocage Gemini, le pipeline
            # le traitera comme un échec ordinaire de l'image suivante.
            return None
        with sync_playwright() as p:
            try:
                browser = p.chromium.connect_over_cdp(CDP_URL, timeout=30_000)
            except Exception as exc:  # noqa: BLE001
                logging.warning("check_ready : connexion Chrome impossible (%s)", _first_line(exc))
                return None
            page = browser.contexts[0].new_page()
            try:
                page.set_viewport_size({"width": 1280, "height": 900})
                page.goto(GEMINI_URL, wait_until="domcontentloaded", timeout=60_000)
                page.wait_for_timeout(4000)
                return classify_page(page)
            except Exception as exc:  # noqa: BLE001
                logging.warning("check_ready : %s", _first_line(exc))
                return None
            finally:
                page.close()

    # ── Génération ──────────────────────────────────────────────────────────

    def generate(self, photo: Path, prompt: str, label: str) -> GeneratedImage:
        with sync_playwright() as p:
            try:
                browser = p.chromium.connect_over_cdp(CDP_URL, timeout=60_000)
            except Exception as exc:  # noqa: BLE001
                raise GenerationFailed(f"connexion au Chrome du programme impossible ({_first_line(exc)})") from exc

            page = browser.contexts[0].new_page()
            try:
                return self._generate_in_page(page, photo, prompt, label)
            except ProviderBlocked:
                raise
            except AttemptFailed as exc:
                # Un délai ou un refus peut cacher un vrai blocage (quota...).
                self._reclassify(page, exc)
                raise GenerationFailed(str(exc)) from exc
            except Exception as exc:  # noqa: BLE001 — toute erreur Playwright devient une raison lisible
                self._reclassify(page, exc)
                raise GenerationFailed(_first_line(exc)) from exc
            finally:
                # Onglet toujours refermé : sinon ils s'accumulent et figent Chrome.
                try:
                    page.close()
                except Exception:  # noqa: BLE001
                    pass

    def _reclassify(self, page, original: Exception) -> None:
        try:
            blocked = classify_page(page)
        except Exception:  # noqa: BLE001 — la page peut être déjà fermée
            return
        if blocked:
            raise ProviderBlocked(*blocked) from original

    def _generate_in_page(self, page, photo: Path, prompt: str, label: str) -> GeneratedImage:
        page.set_viewport_size({"width": 1280, "height": 900})
        page.bring_to_front()
        # "networkidle" n'est jamais atteint sur Gemini : "domcontentloaded" suffit.
        page.goto(GEMINI_URL, wait_until="domcontentloaded", timeout=60_000)
        self._raise_if_blocked(page)
        _wait_page_ready(page)
        self._raise_if_blocked(page)
        human_pause(DELAY_BEFORE_UPLOAD, "avant upload")

        blobs_before = page.locator("img[src^='blob:']").count()
        with page.expect_file_chooser(timeout=15_000) as fc_info:
            click_upload_button(page).click()
        fc_info.value.set_files(str(photo))
        accept = page.get_by_role("button", name="Accepter")
        try:
            if accept.is_visible(timeout=2000):
                accept.click()
        except PWTimeoutError:
            pass
        _wait_for_thumbnail(page, blobs_before)

        baseline = page.locator("img[src^='blob:']").count()
        before_text = page.locator("body").inner_text()
        _send_prompt(page, prompt)
        logging.info("[%s] photo et prompt envoyés à Gemini (%s)", label, page.url)

        with tempfile.TemporaryDirectory(prefix="creative-") as tmp:
            files = _collect_images(page, baseline, before_text, _safe_handle(label), 1, Path(tmp))
            canvas_bytes = files[0].read_bytes()
            mime, width, height = _describe(canvas_bytes)

            if CREATIVES_FULLSIZE_DOWNLOAD:
                full = self._try_fullsize(page, baseline)
                if full is not None:
                    f_mime, f_w, f_h = full[1], full[2], full[3]
                    logging.info("[%s] export canvas %dx%d | téléchargement taille réelle %dx%d", label, width, height, f_w, f_h)
                    if f_w * f_h >= width * height:
                        return GeneratedImage(full[0], f_mime, f_w, f_h, source="download")
                else:
                    logging.info("[%s] téléchargement taille réelle indisponible : export canvas %dx%d", label, width, height)
            return GeneratedImage(canvas_bytes, mime, width, height, source="canvas")

    def _try_fullsize(self, page, index: int) -> tuple[bytes, str, int, int] | None:
        """Bouton "Télécharger l'image en taille réelle" de Gemini. Meilleur
        effort : toute erreur -> None et le repli canvas prend le relais.
        (Libellé à valider avec le compte connecté — voir README.)"""
        try:
            img = page.locator("img[src^='blob:']").nth(index)
            img.hover(timeout=3000)
            button = page.get_by_role("button", name=_FULLSIZE_BUTTON).first
            with page.expect_download(timeout=20_000) as dl:
                button.click(timeout=4000)
            data = Path(dl.value.path()).read_bytes()
            mime, width, height = _describe(data)
            return data, mime, width, height
        except Exception as exc:  # noqa: BLE001
            logging.info("téléchargement taille réelle : %s", _first_line(exc))
            return None
