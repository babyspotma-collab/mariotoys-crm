"""Interface des fournisseurs d'images des Créatives.

Pour passer un jour de Gemini web à l'API Gemini : écrire un nouveau module
dans providers/ qui implémente ImageProvider, puis le déclarer dans
providers/__init__.py (PROVIDERS) et mettre PROVIDER=... dans .env. Rien
d'autre à changer : le pipeline (creatives/pipeline.py) ne connaît que cette
interface.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path


@dataclass
class GeneratedImage:
    data: bytes
    mime: str  # "image/png", "image/jpeg" ou "image/webp"
    width: int | None = None
    height: int | None = None
    source: str = ""  # d'où vient l'image (ex : "download" / "canvas"), pour les logs


class GenerationFailed(Exception):
    """Échec ordinaire d'une tentative (refus de Gemini, délai dépassé...).
    Le pipeline réessaie, puis déclare l'image en échec avec cette raison."""


class ProviderBlocked(Exception):
    """Le fournisseur est bloqué : le programme doit se mettre en pause,
    signaler `issue` au CRM et reprendre tout seul quand `check_ready()`
    ne renvoie plus de problème. Jamais un échec d'image.

    issue : "SESSION_EXPIRED" | "QUOTA" | "CAPTCHA"
    """

    def __init__(self, issue: str, message: str):
        super().__init__(message)
        self.issue = issue
        self.message = message


class ImageProvider(ABC):
    name: str = ""
    # Pauses (secondes, min/max) : entre deux images d'une même demande, et
    # avant une nouvelle tentative. Gemini web les veut "humaines" ; le mock
    # et une future API n'en ont pas besoin.
    pause_between_images: tuple[float, float] = (0, 0)
    retry_pause: tuple[float, float] = (0, 0)

    def prepare(self) -> bool:
        """Prépare le fournisseur (ex : lancer Chrome). False si impossible."""
        return True

    @abstractmethod
    def check_ready(self) -> tuple[str, str] | None:
        """None si le fournisseur est prêt, sinon (problème, détail) — mêmes
        valeurs de problème que ProviderBlocked.issue. Appelé toutes les
        60 s pendant une pause."""

    @abstractmethod
    def generate(self, photo: Path, prompt: str, label: str) -> GeneratedImage:
        """Génère UNE image à partir de la photo et du prompt, dans une
        conversation neuve. Lève GenerationFailed ou ProviderBlocked."""
