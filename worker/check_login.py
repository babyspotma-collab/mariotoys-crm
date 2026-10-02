"""Vérifie que la session Gemini du Chrome du programme est utilisable.

  venv\\Scripts\\python.exe check_login.py

Lance le Chrome du programme au besoin (profil chrome-profile/), ouvre Gemini
dans un onglet temporaire et dit si le compte est connecté, ou quel blocage
est détecté (session expirée / limite atteinte / captcha). Ne modifie rien.
"""

import sys

from config import GEMINI_URL
from providers import get_provider

MESSAGES = {
    "SESSION_EXPIRED": "Session Google expirée ou jamais connectée : lance start_chrome.ps1 et connecte-toi au compte secondaire.",
    "QUOTA": "Limite d'utilisation Gemini atteinte : réessaie plus tard.",
    "CAPTCHA": "Gemini demande une vérification : ouvre le Chrome du programme (start_chrome.ps1) et résous-la.",
}


def main() -> int:
    provider = get_provider("gemini-web")
    if not provider.prepare():
        print("Chrome ne démarre pas. Vérifie CHROME_EXE dans .env.")
        return 2
    print(f"Test de {GEMINI_URL} ...")
    problem = provider.check_ready()
    if problem is None:
        print("OK : Gemini est utilisable avec ce Chrome.")
        return 0
    issue, detail = problem
    print(f"BLOQUÉ [{issue}] {detail}")
    print(MESSAGES.get(issue, ""))
    return 1


if __name__ == "__main__":
    sys.exit(main())
