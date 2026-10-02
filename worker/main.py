"""Programme local du CRM Mario Toys — une seule boucle, deux files.

Chaque tour (toutes les POLL_INTERVAL_S secondes quand il est libre) :
  1. Création produits (si ENABLE_PRODUCT_JOBS) — traitée en premier ;
  2. sinon Créatives (si ENABLE_CREATIVES).
UN job à la fois, une seule session Gemini (le Chrome de chrome-profile/).

Blocage Gemini (session expirée, limite atteinte, captcha) : le programme
signale le problème au CRM par son battement de cœur, ne réclame plus aucun
job, re-teste toutes les PAUSE_RETRY_S secondes et reprend tout seul.

Lancement : start-worker.bat (à la main) ou la tâche planifiée créée par
install-autostart.ps1 (non activée tant que tu ne l'as pas décidé).
"""

import atexit
import faulthandler
import logging
import logging.handlers
import socket
import sys
import threading
import time
import traceback

import crm
import gemini_session
from config import (
    ENABLE_CREATIVES,
    ENABLE_PRODUCT_JOBS,
    LOGS_DIR,
    PAUSE_RETRY_S,
    POLL_INTERVAL_S,
    PROVIDER,
    SINGLE_INSTANCE_PORT,
)
from creatives.pipeline import Paused, process_request
from providers import get_provider
from state import Activity


def setup_logging() -> None:
    LOGS_DIR.mkdir(exist_ok=True)
    handlers: list[logging.Handler] = [
        # Fichier tournant : 2 Mo x 5, lisible avec n'importe quel éditeur.
        logging.handlers.RotatingFileHandler(LOGS_DIR / "worker.log", maxBytes=2_000_000, backupCount=5, encoding="utf-8")
    ]
    if sys.stdout is not None:  # absent sous pythonw.exe
        handlers.append(logging.StreamHandler(sys.stdout))
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", handlers=handlers)
    # Plantages sans trace : exceptions non rattrapées, crash de l'interpréteur, arrêt.
    sys.excepthook = lambda t, v, tb: logging.critical(
        "Exception non rattrapée :\n%s", "".join(traceback.format_exception(t, v, tb))
    )
    threading.excepthook = lambda a: logging.critical(
        "Exception dans un fil :\n%s", "".join(traceback.format_exception(a.exc_type, a.exc_value, a.exc_traceback))
    )
    faulthandler.enable(open(LOGS_DIR / "crash.log", "a", encoding="utf-8"))
    atexit.register(lambda: logging.info("=== Programme arrêté ==="))


def acquire_single_instance_lock() -> socket.socket | None:
    """Socket gardé ouvert tant que le programme vit, ou None si un autre tourne déjà."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind(("127.0.0.1", SINGLE_INSTANCE_PORT))
        sock.listen(1)
        return sock
    except OSError:
        sock.close()
        return None


def main() -> int:
    setup_logging()

    problem = crm.configured()
    if problem:
        logging.error("Configuration incomplète : %s", problem)
        return 2
    if not (ENABLE_PRODUCT_JOBS or ENABLE_CREATIVES):
        logging.error("Aucune file activée (ENABLE_PRODUCT_JOBS / ENABLE_CREATIVES) : rien à faire.")
        return 2

    lock = acquire_single_instance_lock()
    if lock is None:
        # Un programme tourne déjà (tâche planifiée qui relance, double clic...).
        logging.info("Un autre programme tourne déjà sur ce PC (port %d) : arrêt.", SINGLE_INSTANCE_PORT)
        return 0

    provider = get_provider(PROVIDER)
    # Le vrai Chrome est nécessaire pour Gemini web et pour la file produit.
    needs_chrome = ENABLE_PRODUCT_JOBS or provider.name == "gemini-web"

    logging.info("=== Programme démarré — CRM %s | Créatives=%s (fournisseur %s) | Produits=%s ===",
                 crm.CRM_BASE_URL, ENABLE_CREATIVES, provider.name, ENABLE_PRODUCT_JOBS)

    activity = Activity()
    threading.Thread(target=activity.loop, name="heartbeat", daemon=True).start()

    # Si pas None : (problème, détail) — le programme est en pause.
    blocked: tuple[str, str] | None = None
    last_check = 0.0

    while True:
        worked = False
        try:
            if needs_chrome:
                gemini_session.ensure_chrome_running()

            if blocked is not None:
                if time.monotonic() - last_check >= PAUSE_RETRY_S:
                    last_check = time.monotonic()
                    still = provider.check_ready()
                    if still is None:
                        logging.info("Gemini de nouveau utilisable (%s résolu) : reprise.", blocked[0])
                        blocked = None
                        activity.clear_issue()
                    else:
                        blocked = still
                        logging.warning("Toujours bloqué : %s — %s", still[0], still[1])
                        activity.issue(*still)
            else:
                if ENABLE_PRODUCT_JOBS:
                    from product_jobs.process import process_product_queue

                    worked = process_product_queue(activity)
                if not worked and ENABLE_CREATIVES:
                    request = crm.next_creative_request()
                    if request:
                        process_request(request, provider, activity)
                        worked = True
        except Paused as paused:
            blocked = (paused.issue, paused.message)
            last_check = time.monotonic()
            activity.issue(paused.issue, paused.message)
            logging.warning("PAUSE : %s — %s. Nouveau test dans %d s.", paused.issue, paused.message, PAUSE_RETRY_S)
        except Exception:  # noqa: BLE001 — la boucle ne doit jamais s'arrêter
            logging.error("Erreur dans la boucle :\n%s", traceback.format_exc())

        # Enchaîne sans attendre tant qu'il y a du travail ; sinon sondage normal.
        if not worked:
            time.sleep(POLL_INTERVAL_S if blocked is None else 5)


if __name__ == "__main__":
    sys.exit(main())
