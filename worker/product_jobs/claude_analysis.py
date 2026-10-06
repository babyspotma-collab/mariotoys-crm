"""
claude_analysis.py — analyse de la photo et rédaction de la fiche produit par
Claude Code en mode non interactif (`claude -p`), sur l'abonnement Claude de
l'utilisateur (aucune clé API). Remplace la lecture par Gemini (décision du
29/09/2026) : Gemini ne fait plus que le visuel (voir product_pipeline.py).

Claude n'a accès qu'à trois outils : lire l'image (Read), chercher sur le
web (WebSearch) et lire une page (WebFetch). Aucune commande système, aucune
écriture de fichier.

Vérifié le 29/09/2026 depuis pythonw (contexte de la tâche planifiée) :
authentification par l'abonnement OK, lecture d'image OK.
"""

import json
import re
import shutil
import subprocess
from pathlib import Path

from config import ROOT

CLAUDE_TIMEOUT_S = 900
CLAUDE_MAX_TURNS = "25"
RULES_FILE = Path(__file__).parent / "REGLES_PRODUIT.md"  # copié à côté de ce module
WINGET_CLAUDE = (
    Path.home()
    / "AppData/Local/Microsoft/WinGet/Packages/Anthropic.ClaudeCode_Microsoft.Winget.Source_8wekyb3d8bbwe/claude.exe"
)


def claude_executable() -> str:
    found = shutil.which("claude") or (str(WINGET_CLAUDE) if WINGET_CLAUDE.exists() else None)
    if not found:
        raise RuntimeError("Claude Code (claude) introuvable sur ce PC.")
    return found


def _rules_excerpt() -> str:
    """Sections "Format de la fiche produit" et "Balises" de REGLES_PRODUIT.md,
    qui reste la seule source des règles (pas de copie ici)."""
    text = RULES_FILE.read_text(encoding="utf-8")
    parts = []
    for start, end in (("## Format de la fiche produit", "## Process"), ("## Balises", "## Prix")):
        i, j = text.find(start), text.find(end)
        if i != -1:
            parts.append(text[i : j if j > i else None].strip())
    return "\n\n".join(parts)


PROMPT = """Tu prépares la fiche d'un produit pour la boutique Shopify Mario Toys (jouets, Maroc).
La photo du produit est le fichier « {photo} » du dossier courant : ouvre-la avec l'outil Read.

1. Étiquette de prix (photo prise en magasin fournisseur) :
   - "cost" = prix d'achat : le nombre suivi (ou précédé) de "DH"/"Dh". Ignore les mentions du type "12 pcs".
   - "sku" = la référence produit écrite sur l'étiquette (code article). N'utilise jamais un code-barres EAN.
   - Si l'un des deux est illisible ou absent : null. Ne devine jamais.
2. Identifie précisément le produit (marque, personnage, modèle) puis fais une recherche en ligne
   (WebSearch, WebFetch) pour confirmer et rédiger une fiche exacte.
3. Rédige la fiche en appliquant strictement ces règles :

{rules}

Tags déjà utilisés sur la boutique (réutilise-les en priorité) : {tags}
Collections existantes : {collections}
"category" = le nom EXACT d'une de ces collections si le produit y correspond clairement, sinon null.
"colors" = les couleurs/variantes proposées si plusieurs sont visibles sur la photo, sinon [].

Réponds UNIQUEMENT par un objet JSON, sans texte autour :
{{"title": "...", "about": "...", "features": ["...", "..."], "age": "...", "tags": ["..."], "category": null, "colors": [], "cost": 150, "sku": "..."}}"""


def _extract_json(text: str) -> dict:
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    candidate = fenced.group(1) if fenced else text[text.find("{") : text.rfind("}") + 1]
    try:
        return json.loads(candidate)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Réponse de Claude illisible (JSON attendu) : {text[:300]}") from exc


def _normalize(data: dict) -> dict:
    for key in ("title", "about", "age"):
        if not str(data.get(key) or "").strip():
            raise ValueError(f"Réponse de Claude incomplète : champ « {key} » vide.")
    cost = data.get("cost")
    try:
        cost = float(str(cost).replace(",", ".")) if cost not in (None, "") else None
    except ValueError:
        cost = None
    sku = str(data.get("sku") or "").strip() or None
    return {
        "title": str(data["title"]).strip(),
        "about": str(data["about"]).strip(),
        "features": [str(f).strip() for f in (data.get("features") or []) if str(f).strip()],
        "age": str(data["age"]).strip(),
        "tags": [str(t).strip() for t in (data.get("tags") or []) if str(t).strip()],
        "category": (str(data["category"]).strip() or None) if data.get("category") else None,
        "colors": [str(c).strip() for c in (data.get("colors") or []) if str(c).strip()],
        "cost": cost if cost and cost > 0 else None,
        "sku": sku,
    }


def analyze_photo(photo: Path, existing_tags: list[str], existing_collections: list[str]) -> dict:
    """Renvoie la fiche normalisée ; lève une exception claire en cas d'échec."""
    prompt = PROMPT.format(
        photo=photo.name,
        rules=_rules_excerpt(),
        tags=", ".join(existing_tags) or "(aucun)",
        collections=", ".join(existing_collections) or "(aucune)",
    )
    try:
        res = subprocess.run(
            [
                claude_executable(), "-p", prompt,
                "--output-format", "json",
                "--allowedTools", "Read", "WebSearch", "WebFetch",
                "--disallowedTools", "Bash", "Edit", "Write",
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
        raise RuntimeError(f"Claude n'a pas répondu en {CLAUDE_TIMEOUT_S // 60} minutes.") from exc

    try:
        out = json.loads(res.stdout)
    except json.JSONDecodeError:
        raise RuntimeError(f"Claude a échoué (code {res.returncode}) : {(res.stderr or res.stdout)[-400:]}")
    if out.get("is_error") or res.returncode != 0:
        raise RuntimeError(f"Claude a échoué : {str(out.get('result') or out.get('subtype'))[:400]}")
    return _normalize(_extract_json(str(out.get("result") or "")))
