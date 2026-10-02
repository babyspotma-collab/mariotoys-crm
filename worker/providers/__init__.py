"""Registre des fournisseurs d'images. Passer à un autre fournisseur =
ajouter un module ici et changer PROVIDER dans .env — rien d'autre."""

from providers.base import GeneratedImage, GenerationFailed, ImageProvider, ProviderBlocked

__all__ = ["GeneratedImage", "GenerationFailed", "ImageProvider", "ProviderBlocked", "get_provider"]


def get_provider(name: str) -> ImageProvider:
    # Imports paresseux : le fournisseur "mock" ne charge ni Playwright ni Pillow.
    if name == "gemini-web":
        from providers.gemini_web import GeminiWebProvider

        return GeminiWebProvider()
    if name == "mock":
        from providers.mock import MockProvider

        return MockProvider()
    raise ValueError(f"Fournisseur inconnu : {name!r} (valeurs possibles : gemini-web, mock)")
