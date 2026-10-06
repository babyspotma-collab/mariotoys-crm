"""Réglages du programme local (CRM Mario Toys) — lus dans worker/.env.

Un seul programme gère les deux files du CRM, un job à la fois, avec la même
session Gemini :
  - Création produits (product_jobs/, ton code existant, logique inchangée) ;
  - Créatives (creatives/, publicités marketing).

Les noms de constantes repris de l'ancien projet (ROOT, SHOPIFY_*, CDP_URL,
A_VALIDER_DIR, DELAY_*, SUSPICIOUS_PATTERNS...) restent identiques pour que
product_jobs/ fonctionne sans modification de sa logique.
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# La console Windows (cp1252) plante sur les accents dans print() ; sous
# pythonw.exe stdout/stderr valent None.
for _stream in (sys.stdout, sys.stderr):
    if _stream is not None and _stream.encoding and _stream.encoding.lower() != "utf-8":
        _stream.reconfigure(encoding="utf-8")

# Certificats : Python utilise le magasin de Windows (comme Chrome) au lieu de
# sa propre liste. Indispensable derrière un antivirus qui inspecte le HTTPS
# (Avast "Web/Mail Shield" sur ce PC) : son certificat racine est dans le
# magasin Windows mais pas dans celle de Python -> "unable to get local issuer
# certificate" vers Vercel/Blob sinon. Sans effet (et sans risque) ailleurs.
try:
    import truststore

    truststore.inject_into_ssl()
except Exception:  # noqa: BLE001 — paquet absent ou plateforme non prise en charge : on garde le défaut
    pass

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")


def _flag(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in ("1", "true", "yes", "oui", "on")


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, "").strip() or default)
    except ValueError:
        return default


# ─── CRM ────────────────────────────────────────────────────────────────────
# Pas d'URL par défaut : on veut toujours savoir explicitement quel CRM
# (production ou local) le programme interroge.
CRM_BASE_URL = (os.environ.get("CRM_BASE_URL") or "").rstrip("/")
WORKER_SECRET = os.environ.get("WORKER_SECRET")

# ─── Files de travail ───────────────────────────────────────────────────────
# Création produits désactivée par défaut : à activer seulement une fois le
# nouveau programme validé (l'ancien mariotoys-images-automation sert d'ici là).
ENABLE_PRODUCT_JOBS = _flag("ENABLE_PRODUCT_JOBS", False)
ENABLE_CREATIVES = _flag("ENABLE_CREATIVES", True)

# Fournisseur d'images pour les Créatives : "gemini-web" (navigateur) ou "mock".
PROVIDER = (os.environ.get("PROVIDER") or "gemini-web").strip().lower()

# Consommation de la base du CRM (Neon, plan gratuit : la base s'endort
# après ~5 min sans requête et le quota compte le temps d'éveil). Le
# programme ne sonde donc vite (POLL_INTERVAL_S) que pendant
# ACTIVE_WINDOW_S après son dernier travail — quelqu'un utilise le CRM — et
# retombe sinon à IDLE_POLL_INTERVAL_S. Le battement de cœur n'est envoyé
# qu'en activité ou en blocage ; au repos, un seul signe de vie par sondage.
POLL_INTERVAL_S = _int("POLL_INTERVAL_S", 10)  # sondage des files juste après un travail
IDLE_POLL_INTERVAL_S = _int("IDLE_POLL_INTERVAL_S", 600)  # sondage des files au repos
ACTIVE_WINDOW_S = _int("ACTIVE_WINDOW_S", 300)  # durée du sondage rapide après un travail
HEARTBEAT_INTERVAL_S = _int("HEARTBEAT_INTERVAL_S", 300)
PAUSE_RETRY_S = _int("PAUSE_RETRY_S", 60)  # en pause (session expirée, quota, captcha) : re-test toutes les 60 s
IMAGE_RETRIES = _int("IMAGE_RETRIES", 2)  # nouvelles tentatives par image (chacune dans un nouveau chat)
HTTP_TIMEOUT_S = 30
# Limite Vercel : 4,5 Mo par requête — au-delà, l'image est ré-encodée en JPEG.
MAX_UPLOAD_BYTES = 4_400_000

# Récupération pleine résolution via le bouton de téléchargement de Gemini,
# avec repli sur l'export canvas (voir providers/gemini_web.py). Désactivable.
CREATIVES_FULLSIZE_DOWNLOAD = _flag("CREATIVES_FULLSIZE_DOWNLOAD", True)

# Un seul programme à la fois sur ce PC (verrou sur un port local).
SINGLE_INSTANCE_PORT = _int("SINGLE_INSTANCE_PORT", 47219)

# ─── Chrome / Gemini ────────────────────────────────────────────────────────
CHROME_EXE = os.environ.get("CHROME_EXE") or r"C:\Program Files\Google\Chrome\Application\chrome.exe"
CHROME_PROFILE_DIR = ROOT / "chrome-profile"
CDP_PORT = _int("CDP_PORT", 9222)
CDP_URL = f"http://localhost:{CDP_PORT}"
CHROME_START_TIMEOUT_S = 20
GEMINI_URL = "https://gemini.google.com/app"

# ─── Dossiers ───────────────────────────────────────────────────────────────
LOGS_DIR = ROOT / "logs"
QUEUE_TMP_DIR = ROOT / "queue_tmp"  # photos téléchargées depuis le CRM
A_VALIDER_DIR = ROOT / "a_valider"  # sorties de product_pipeline (visuels produit)
PRODUCT_INPUT_FILE = ROOT / "product-input.json"  # CLI de create_shopify_product uniquement

# ─── Shopify (file Création produits) ───────────────────────────────────────
SHOPIFY_STORE = os.environ.get("SHOPIFY_STORE")
SHOPIFY_CLIENT_ID = os.environ.get("SHOPIFY_CLIENT_ID")
SHOPIFY_CLIENT_SECRET = os.environ.get("SHOPIFY_CLIENT_SECRET")
SHOPIFY_API_VERSION = os.environ.get("SHOPIFY_API_VERSION", "2026-07")

# ─── Pauses "usage humain" (secondes) ───────────────────────────────────────
DELAY_BEFORE_UPLOAD = (2, 5)
DELAY_AFTER_UPLOAD = (2, 4)
DELAY_AFTER_PROMPT_SUBMIT = (3, 6)
DELAY_BETWEEN_PRODUCTS = (15, 45)

# Détection LARGE de problème sur la page (file Création produits : inchangé
# par rapport à l'ancien programme). La classification précise des Créatives
# (session expirée / quota / captcha) est dans gemini_session.classify_page.
SUSPICIOUS_PATTERNS = [
    "recaptcha",
    "captcha",
    "n'êtes pas un robot",
    "not a robot",
    "vérification supplémentaire",
    "unusual traffic",
    "trafic inhabituel",
    "quota",
    "limite atteinte",
    "vous avez atteint votre limite",
    "you've reached your limit",
    "try again later",
    "réessayez plus tard",
]
