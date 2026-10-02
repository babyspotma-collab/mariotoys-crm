"""
product_pipeline.py — génération du visuel produit par Gemini (interface
web, via le vrai Chrome en CDP) pour la file d'attente CRM (voir worker.py).

Gemini ne fait QU'UNE chose : recréer le produit sur fond blanc studio à
partir de la photo (la fiche est rédigée par Claude, claude_analysis.py).

Règles (décision du 29/09/2026) : 100 % Gemini, aucune solution de secours
avec la photo d'origine. Chaque tentative ouvre un NOUVEAU chat
(gemini.google.com/app dans un nouvel onglet) ; en cas d'échec, jusqu'à
2 nouvelles tentatives, puis VisualGenerationError avec la raison exacte :
le job passe en erreur et le produit Shopify n'est ni créé ni modifié.
"""

import logging
from pathlib import Path

from playwright.sync_api import TimeoutError as PWTimeoutError, sync_playwright

from config import (
    A_VALIDER_DIR,
    CDP_URL,
    DELAY_AFTER_PROMPT_SUBMIT,
    DELAY_BEFORE_UPLOAD,
    GEMINI_URL,
)
# Les petites fonctions Gemini vivent maintenant dans gemini_session.py (partagé
# avec les Créatives) — reprises à l'identique de l'ancien generate.py.
from gemini_session import (
    GENERATION_POLL_INTERVAL_S,
    GENERATION_TIMEOUT_S,
    check_for_trouble,
    click_upload_button,
    human_pause,
    save_blob_image,
)

# Prompt court et fixe (volontairement pas dans prompts.yaml : il ne doit
# jamais redemander de texte, prix ou référence).
VISUAL_PROMPT = (
    "Recrée ce produit (ou son emballage) en photo produit professionnelle sur fond blanc studio, "
    "fidèle à l'original : mêmes couleurs, formes et détails. N'ajoute aucun texte, prix, référence, "
    "étiquette ni logo de fournisseur. Cadrage centré, format carré."
)
MAX_VISUALS = 3
RETRIES = 2  # nouvelles tentatives après la première, chacune dans un nouveau chat
PAGE_READY_TIMEOUT_MS = 45_000
THUMBNAIL_TIMEOUT_MS = 30_000
SENT_TIMEOUT_MS = 30_000

# Refus de Gemini, détectés dès qu'ils apparaissent (pas en fin de délai).
REFUSAL_PATTERNS = [
    "ne peux pas générer",
    "ne peux pas créer cette image",
    "je ne suis pas en mesure de créer",
    "je ne suis pas en mesure de vous aider",
    "je ne suis qu'un modèle de langage",
    "je ne peux pas produire",
    "cannot generate",
    "unable to create this image",
    "i can't help with that",
    "contenu protégé",
    "droits d'auteur",
    "propriété intellectuelle",
    "personnage sous licence",
]


class VisualGenerationError(RuntimeError):
    """Aucun visuel Gemini après toutes les tentatives (raison exacte en message)."""


class AttemptFailed(RuntimeError):
    """Échec d'une tentative (raison lisible, une ligne)."""


def _first_line(exc: Exception) -> str:
    return (str(exc).strip().splitlines() or [exc.__class__.__name__])[0][:200]


def _raise_if_trouble(page, when: str) -> None:
    trouble = check_for_trouble(page)
    if trouble:
        # Pas de input() : le worker tourne sans console (pythonw).
        raise AttemptFailed(f"Gemini demande une vérification ({trouble}) {when} : ouvrir le Chrome du worker")


def _wait_page_ready(page) -> None:
    """Nouveau chat chargé : zone de saisie visible et utilisable."""
    try:
        page.get_by_role("textbox").first.wait_for(state="visible", timeout=PAGE_READY_TIMEOUT_MS)
    except PWTimeoutError as exc:
        raise AttemptFailed("la page Gemini ne s'est pas chargée (zone de saisie absente)") from exc


def _wait_for_thumbnail(page, blobs_before: int) -> None:
    """Attend que la miniature de la photo envoyée soit réellement chargée.
    Vérifiée depuis Python : page.wait_for_function est bloquée par la
    politique "Trusted Types" de Gemini (cause des visuels manquants du
    29/09/2026 : la photo était jointe mais jamais envoyée)."""
    thumbs = page.locator("img[src^='blob:']")
    waited = 0
    while waited < THUMBNAIL_TIMEOUT_MS:
        count = thumbs.count()
        if count > blobs_before and all(
            thumbs.nth(i).evaluate("img => img.complete && img.naturalWidth > 0") for i in range(blobs_before, count)
        ):
            return
        page.wait_for_timeout(500)
        waited += 500
    raise AttemptFailed(f"la miniature de la photo ne s'est pas chargée en {THUMBNAIL_TIMEOUT_MS // 1000} s")


def _send_prompt(page, prompt: str = VISUAL_PROMPT) -> None:
    """Envoie le prompt et vérifie que le message est parti (Gemini ouvre
    alors une conversation : l'URL passe de /app à /app/<id>). Le paramètre
    `prompt` (défaut : VISUAL_PROMPT, donc comportement produit inchangé)
    permet aux Créatives de réutiliser cette fonction."""
    box = page.get_by_role("textbox").first
    box.click()
    box.fill(prompt)
    box.press("Enter")
    try:
        page.wait_for_url("**/app/*", timeout=SENT_TIMEOUT_MS)
    except PWTimeoutError as exc:
        raise AttemptFailed("le message n'est pas parti (aucune conversation créée)") from exc
    human_pause(DELAY_AFTER_PROMPT_SUBMIT, "après envoi du prompt")
    _raise_if_trouble(page, "après l'envoi")


def _collect_images(page, baseline: int, before_text: str, handle: str, attempt: int, out_dir: Path) -> list[Path]:
    elapsed = 0
    count = baseline
    while elapsed < GENERATION_TIMEOUT_S:
        page.bring_to_front()
        page.wait_for_timeout(GENERATION_POLL_INTERVAL_S * 1000)
        elapsed += GENERATION_POLL_INTERVAL_S
        count = page.locator("img[src^='blob:']").count()
        if count > baseline:
            break
        answer = page.locator("body").inner_text()[len(before_text):].strip()
        if any(p in answer.lower() for p in REFUSAL_PATTERNS):
            raise AttemptFailed(f"Gemini a refusé : « {' '.join(answer.split())[:160]} »")

    if count <= baseline:
        raise AttemptFailed(f"aucune image générée en {GENERATION_TIMEOUT_S} s")

    images = page.locator("img[src^='blob:']")
    saved: list[Path] = []
    for i in range(min(count - baseline, MAX_VISUALS)):
        dest = out_dir / f"{handle}_{attempt}_{i + 1}.png"
        save_blob_image(images.nth(baseline + i), dest)
        saved.append(dest)
    return saved


def _attempt(browser, handle: str, image_path: Path, attempt: int, out_dir: Path) -> list[Path]:
    # Nouvel onglet sur gemini.google.com/app = nouveau chat vierge.
    page = browser.contexts[0].new_page()
    try:
        page.set_viewport_size({"width": 1280, "height": 900})
        page.bring_to_front()
        page.goto(GEMINI_URL, wait_until="domcontentloaded", timeout=60_000)
        _wait_page_ready(page)
        _raise_if_trouble(page, "au chargement")
        human_pause(DELAY_BEFORE_UPLOAD, "avant upload")

        blobs_before = page.locator("img[src^='blob:']").count()
        with page.expect_file_chooser(timeout=15_000) as fc_info:
            click_upload_button(page).click()
        fc_info.value.set_files(str(image_path))
        accept = page.get_by_role("button", name="Accepter")
        try:
            if accept.is_visible(timeout=2000):
                accept.click()
        except PWTimeoutError:
            pass
        _wait_for_thumbnail(page, blobs_before)

        baseline = page.locator("img[src^='blob:']").count()
        before_text = page.locator("body").inner_text()
        _send_prompt(page)
        logging.info("[%s] Tentative %d : photo envoyée à Gemini (%s).", handle, attempt, page.url)
        return _collect_images(page, baseline, before_text, handle, attempt, out_dir)
    except AttemptFailed:
        raise
    except Exception as exc:  # noqa: BLE001 — toute erreur Playwright devient une raison lisible
        raise AttemptFailed(_first_line(exc)) from exc
    finally:
        # Onglet toujours refermé : sinon ils s'accumulent et figent Chrome.
        page.close()


def generate_visual(handle: str, image_path: Path) -> list[Path]:
    """Renvoie les visuels Gemini, ou lève VisualGenerationError avec la
    raison de chaque tentative. Jamais de repli sur la photo d'origine."""
    out_dir = A_VALIDER_DIR / "produit"
    out_dir.mkdir(parents=True, exist_ok=True)
    reasons: list[str] = []

    with sync_playwright() as p:
        try:
            browser = p.chromium.connect_over_cdp(CDP_URL, timeout=60_000)
        except Exception as exc:  # noqa: BLE001
            raise VisualGenerationError(f"connexion au Chrome du worker impossible ({_first_line(exc)})") from exc

        for attempt in range(1, RETRIES + 2):
            try:
                images = _attempt(browser, handle, image_path, attempt, out_dir)
                logging.info("[%s] Tentative %d : %d visuel(s) Gemini.", handle, attempt, len(images))
                return images
            except AttemptFailed as exc:
                reasons.append(f"tentative {attempt} : {exc}")
                logging.warning("[%s] Tentative %d échouée : %s", handle, attempt, exc)

    raise VisualGenerationError(" ; ".join(reasons))
