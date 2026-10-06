"""Fournisseur "mock" : aucune requête vers Gemini, images de couleur unie.

Sert aux tests du programme (et à valider la chaîne CRM -> programme -> CRM
sans toucher au compte Google). Pilotable par un fichier JSON facultatif
(variable MOCK_CONTROL_FILE) relu à chaque appel :

  {"issue": "SESSION_EXPIRED" | "QUOTA" | "CAPTCHA" | null,   // blocage simulé
   "fail": 2,                                                   // les N prochaines générations échouent
   "delay": 1.5,                                                // secondes par image
   "big": true}                                                 // image > 4,4 Mo (test du ré-encodage)
"""

import json
import os
import random
import struct
import time
import zlib
from pathlib import Path

from providers.base import GeneratedImage, GenerationFailed, ImageProvider, ProviderBlocked


def _chunk(kind: bytes, data: bytes) -> bytes:
    body = kind + data
    return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)


def make_png(width: int, height: int, rgb: tuple[int, int, int], noisy: bool = False) -> bytes:
    """PNG minimal. noisy=True : pixels aléatoires, donc incompressible (gros fichier)."""
    rows = []
    for _ in range(height):
        if noisy:
            rows.append(b"\x00" + os.urandom(width * 3))
        else:
            rows.append(b"\x00" + bytes(rgb) * width)
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", ihdr)
        + _chunk(b"IDAT", zlib.compress(b"".join(rows), 1))
        + _chunk(b"IEND", b"")
    )


class MockProvider(ImageProvider):
    name = "mock"

    def __init__(self) -> None:
        raw = os.environ.get("MOCK_CONTROL_FILE")
        self._control_file = Path(raw) if raw else None

    def _control(self) -> dict:
        if not self._control_file or not self._control_file.exists():
            return {}
        try:
            # utf-8-sig : tolère le BOM que PowerShell ajoute aux fichiers qu'il écrit.
            return json.loads(self._control_file.read_text(encoding="utf-8-sig"))
        except (OSError, ValueError):
            return {}

    def _write_control(self, data: dict) -> None:
        if self._control_file:
            self._control_file.write_text(json.dumps(data), encoding="utf-8")

    def check_ready(self) -> tuple[str, str] | None:
        issue = self._control().get("issue")
        return (issue, f"simulé par le fournisseur mock ({issue})") if issue else None

    def generate(self, photo: Path, prompt: str, label: str) -> GeneratedImage:
        control = self._control()
        if control.get("issue"):
            raise ProviderBlocked(control["issue"], f"simulé par le fournisseur mock ({control['issue']})")
        time.sleep(float(control.get("delay", 0.3)))
        if int(control.get("fail", 0)) > 0:
            control["fail"] = int(control["fail"]) - 1
            self._write_control(control)
            raise GenerationFailed("simulé : Gemini a refusé de générer cette image")
        # Couleur dérivée du prompt : deux angles différents donnent deux images différentes.
        rnd = random.Random(prompt)
        rgb = (rnd.randint(60, 230), rnd.randint(60, 230), rnd.randint(60, 230))
        big = bool(control.get("big"))
        width, height = (1600, 1000) if big else (240, 300)  # 1600x1000x3 aléatoire ≈ 4,8 Mo
        return GeneratedImage(make_png(width, height, rgb, noisy=big), "image/png", width, height, source="mock")
