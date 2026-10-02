"""Briques communes de la session Gemini web (vrai Chrome piloté en CDP).

Partagé par les deux files :
  - product_jobs/product_pipeline.py (Création produits) importe d'ici ses
    petites fonctions (human_pause, check_for_trouble, click_upload_button,
    save_blob_image, constantes) — reprises à l'identique de l'ancien
    generate.py / worker.py, SANS changement de comportement ;
  - providers/gemini_web.py (Créatives) s'en sert aussi, plus la
    classification précise des blocages (classify_page).

Pourquoi le vrai Chrome en CDP et pas le Chromium de Playwright : Google
bloque la connexion ("navigateur non sécurisé") sur ce dernier. Le profil
(chrome-profile/) garde la session du compte Google secondaire.
"""

import base64
import logging
import random
import re
import subprocess
import time
from pathlib import Path

import requests
from playwright.sync_api import TimeoutError as PWTimeoutError

from config import (
    CDP_PORT,
    CDP_URL,
    CHROME_EXE,
    CHROME_PROFILE_DIR,
    CHROME_START_TIMEOUT_S,
    GEMINI_URL,
    ROOT,
    SUSPICIOUS_PATTERNS,
)

GENERATION_POLL_INTERVAL_S = 5
GENERATION_TIMEOUT_S = 120

# Problèmes qui bloquent le programme (pause puis reprise automatique).
SESSION_EXPIRED = "SESSION_EXPIRED"
QUOTA = "QUOTA"
CAPTCHA = "CAPTCHA"


# ─── Fonctions reprises à l'identique de l'ancien generate.py ───────────────


def human_pause(bounds: tuple[float, float], label: str) -> None:
    seconds = random.uniform(*bounds)
    logging.info("  … pause %.1fs (%s)", seconds, label)
    time.sleep(seconds)


def check_for_trouble(page) -> str | None:
    """Renvoie le motif détecté si la page contient un signe de CAPTCHA /
    vérification / quota — jamais de tentative de contournement, juste un
    signal pour tout arrêter et prévenir l'utilisateur. (Détection LARGE,
    utilisée telle quelle par la file Création produits.)"""
    try:
        text = page.locator("body").inner_text(timeout=3000).lower()
    except PWTimeoutError:
        return None
    for pattern in SUSPICIOUS_PATTERNS:
        if pattern.lower() in text:
            return pattern
    return None


def save_blob_image(img_locator, dest_path: Path) -> None:
    """Les images générées par Gemini sont servies en blob: dans le DOM.
    fetch(img.src) échoue systématiquement sur ces blob: (testé en
    pratique, cause exacte non identifiée, probablement une restriction
    CSP). On contourne en redessinant l'élément <img> déjà chargé sur un
    <canvas> et en l'exportant en PNG — fonctionne car ce blob: est
    same-origin (pas de canvas "tainted")."""
    b64 = img_locator.evaluate(
        """(img) => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            return canvas.toDataURL('image/png').split(',')[1];
        }"""
    )
    dest_path.write_bytes(base64.b64decode(b64))


def click_upload_button(page) -> None:
    """L'UI de Gemini est responsive : le bouton d'upload s'appelle
    "Fichiers" en vue étroite ou "Importer des fichiers" en vue large.
    On fixe le viewport en amont, mais on reste tolérant aux deux libellés."""
    page.get_by_role("button", name="Importation et outils").click()
    btn = page.get_by_role("button", name="Fichiers").or_(
        page.get_by_role("menuitem", name="Importer des fichiers")
    ).first
    btn.wait_for(state="visible", timeout=10_000)
    return btn


# ─── Classification précise des blocages (Créatives) ────────────────────────

_CAPTCHA_PATTERNS = [
    "recaptcha",
    "captcha",
    "n'êtes pas un robot",
    "not a robot",
    "vérification supplémentaire",
    "unusual traffic",
    "trafic inhabituel",
    "vérifier qu'il s'agit bien de vous",
    "verify it's you",
]
_QUOTA_PATTERNS = [
    "vous avez atteint votre limite",
    "vous avez atteint la limite",
    "you've reached your limit",
    "you have reached your limit",
    "limite quotidienne",
    "daily limit",
    "limite atteinte",
    "quota",
]
_SIGNIN_NAME = re.compile(r"^(Se connecter|Sign in)$", re.IGNORECASE)


def classify_page(page) -> tuple[str, str] | None:
    """(problème, détail lisible) si la page Gemini est bloquée, sinon None.

    Problèmes : SESSION_EXPIRED (déconnecté), CAPTCHA (vérification humaine),
    QUOTA (limite d'utilisation atteinte). Jamais de contournement : le
    programme se met en pause et reprend quand le problème a disparu.
    """
    url = (page.url or "").lower()
    if "google.com/sorry" in url:
        return CAPTCHA, "page de vérification Google (/sorry)"
    if "accounts.google.com" in url:
        return SESSION_EXPIRED, "redirigé vers la connexion Google"

    try:
        text = page.locator("body").inner_text(timeout=3000).lower()
    except PWTimeoutError:
        text = ""
    for pattern in _CAPTCHA_PATTERNS:
        if pattern in text:
            return CAPTCHA, f"Gemini demande une vérification ({pattern})"
    for pattern in _QUOTA_PATTERNS:
        if pattern in text:
            return QUOTA, f"limite d'utilisation Gemini atteinte ({pattern})"

    # Déconnecté : Gemini reste affichable mais propose "Se connecter".
    try:
        signin = page.get_by_role("link", name=_SIGNIN_NAME).or_(page.get_by_role("button", name=_SIGNIN_NAME)).first
        if signin.is_visible(timeout=1500):
            return SESSION_EXPIRED, "le compte Google n'est plus connecté (bouton « Se connecter »)"
    except PWTimeoutError:
        pass
    return None


# ─── Chrome (repris de l'ancien worker.py) ──────────────────────────────────


def is_chrome_alive() -> bool:
    try:
        return requests.get(f"{CDP_URL}/json/version", timeout=3).ok
    except requests.RequestException:
        return False


def launch_chrome_background() -> None:
    CHROME_PROFILE_DIR.mkdir(exist_ok=True)
    logging.info("Chrome absent — lancement en arrière-plan...")
    subprocess.Popen(
        [
            CHROME_EXE,
            f"--remote-debugging-port={CDP_PORT}",
            f"--user-data-dir={CHROME_PROFILE_DIR}",
            "--no-first-run",
            "--no-default-browser-check",
            # Empêche Chrome de suspendre le rendu d'un onglet en arrière-plan
            # (l'onglet n'est jamais au premier plan).
            "--disable-backgrounding-occluded-windows",
            "--disable-renderer-backgrounding",
            "--disable-background-timer-throttling",
            # Ne jamais voler le focus ni gêner l'utilisateur.
            "--start-minimized",
            "--window-position=-32000,-32000",
            GEMINI_URL,
        ],
        cwd=str(ROOT),
        creationflags=subprocess.CREATE_NO_WINDOW,
    )


def ensure_chrome_running() -> bool:
    """True si Chrome répond en CDP (le lance au besoin)."""
    if is_chrome_alive():
        return True
    launch_chrome_background()
    for _ in range(CHROME_START_TIMEOUT_S):
        time.sleep(1)
        if is_chrome_alive():
            logging.info("Chrome prêt (CDP répond sur %s).", CDP_URL)
            return True
    logging.error("Chrome ne répond toujours pas après %ss.", CHROME_START_TIMEOUT_S)
    return False
