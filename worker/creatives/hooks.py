"""Suggestions d'accroches pour le formulaire Créatives.

Le formulaire du CRM dépose une demande (photo + nom du produit). Ce module la
traite : Claude Code en mode non interactif (`claude -p`, sur l'abonnement de
l'utilisateur, aucune clé API) regarde la photo et propose 3 accroches courtes.

Ce ne sont que des PROPOSITIONS : le CRM les affiche, l'utilisateur en choisit
une (ou écrit la sienne) puis valide. Elles ne sont jamais utilisées toutes
seules dans une image. N'utilise pas Gemini : peut donc répondre même quand
Gemini est en pause (session expirée, quota, captcha).
"""

import json
import logging
import subprocess
from pathlib import Path
from urllib.parse import urlparse

import crm
from config import QUEUE_TMP_DIR
from product_jobs.claude_analysis import _extract_json, claude_executable
from state import Activity

CLAUDE_TIMEOUT_S = 180
CLAUDE_MAX_TURNS = "6"

PROMPT = """Tu aides à écrire la publicité Instagram/Facebook d'un produit pour enfants vendu au Maroc.
La photo du produit est le fichier « {photo} » du dossier courant : ouvre-la avec l'outil Read.
Nom du produit : « {name} ».

Propose exactement 3 accroches publicitaires en français, différentes les unes des autres :
- 6 mots maximum chacune, une seule idée, sans emoji, sans hashtag, sans guillemets ;
- pense au parent qui fait défiler son fil : une question, un problème résolu ou un bénéfice concret ;
- ne cite AUCUN prix, pourcentage, durée, promotion, livraison, garantie ni chiffre qui n'est pas visible sur la photo ;
- ne décris que ce que le produit est réellement d'après la photo et son nom, n'invente aucune caractéristique ;
- ne mentionne aucune marque ni aucun personnage sous licence.

Réponds UNIQUEMENT par un objet JSON, sans texte autour :
{{"hooks": ["...", "...", "..."]}}"""


class HookSuggestionError(RuntimeError):
    """Échec lisible, renvoyé tel quel à l'utilisateur dans le formulaire."""


def _run_claude(photo: Path, name: str) -> str:
    """Appelle Claude Code ; renvoie le texte de sa réponse."""
    prompt = PROMPT.format(photo=photo.name, name=name)
    try:
        res = subprocess.run(
            [
                claude_executable(), "-p", prompt,
                "--output-format", "json",
                "--allowedTools", "Read",
                "--disallowedTools", "Bash", "Edit", "Write", "WebSearch", "WebFetch",
                "--max-turns", CLAUDE_MAX_TURNS,
            ],
            cwd=str(photo.parent),
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=CLAUDE_TIMEOUT_S,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
    except subprocess.TimeoutExpired as exc:
        raise HookSuggestionError(f"Claude n'a pas répondu en {CLAUDE_TIMEOUT_S} secondes.") from exc
    except RuntimeError as exc:  # claude introuvable
        raise HookSuggestionError(str(exc)) from exc

    try:
        out = json.loads(res.stdout)
    except json.JSONDecodeError:
        raise HookSuggestionError(f"Claude a échoué (code {res.returncode}) : {(res.stderr or res.stdout)[-200:].strip()}")
    if out.get("is_error") or res.returncode != 0:
        raise HookSuggestionError(f"Claude a échoué : {str(out.get('result') or out.get('subtype'))[:200]}")
    return str(out.get("result") or "")


def suggest_hooks(photo: Path, name: str, runner=_run_claude) -> list[str]:
    """3 accroches (ou moins) proposées pour cette photo ; lève HookSuggestionError."""
    text = runner(photo, name)
    try:
        data = _extract_json(text)
    except ValueError as exc:
        raise HookSuggestionError("Réponse de Claude illisible (JSON attendu).") from exc
    hooks = data.get("hooks")
    if not isinstance(hooks, list):
        raise HookSuggestionError("Réponse de Claude sans liste d'accroches.")
    cleaned = [str(h).strip() for h in hooks if isinstance(h, str) and str(h).strip()]
    if not cleaned:
        raise HookSuggestionError("Claude n'a proposé aucune accroche.")
    return cleaned[:5]  # le CRM garde les 3 premières valides (6 mots max, sans doublon)


def process_hook_queue(activity: Activity, runner=_run_claude) -> bool:
    """Traite UNE demande de suggestion s'il y en a. True si une demande a été prise."""
    request = crm.next_hook_request()
    if not request:
        return False

    name = request["productName"]
    logging.info("Accroches : demande %s (%s).", request["id"], name)
    activity.creative(f"Créatives : accroches pour {name}")
    photo: Path | None = None
    try:
        QUEUE_TMP_DIR.mkdir(exist_ok=True)
        ext = Path(urlparse(request["photoUrl"]).path).suffix or ".jpg"
        photo = crm.download_to(request["photoUrl"], QUEUE_TMP_DIR / f"hooks-{request['id']}{ext}")
        hooks = suggest_hooks(photo, name, runner)
        crm.complete_hook(request["id"], hooks)
        logging.info("Accroches : %d proposition(s) envoyée(s).", len(hooks))
    except HookSuggestionError as exc:
        logging.warning("Accroches : %s", exc)
        crm.fail_hook(request["id"], str(exc))
    except Exception as exc:  # noqa: BLE001 — jamais bloquer le programme pour une suggestion
        logging.exception("Accroches : erreur inattendue")
        crm.fail_hook(request["id"], f"Erreur inattendue : {exc}")
    finally:
        activity.idle()
        if photo is not None:
            photo.unlink(missing_ok=True)
    return True
