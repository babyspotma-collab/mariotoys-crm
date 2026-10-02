"""Tests du programme local sans réseau ni Gemini : CRM simulé + fournisseur mock.

  venv\\Scripts\\python.exe -m unittest discover -s tests -v
"""

import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

# Configuration factice AVANT d'importer le programme (config.py lit l'environnement).
os.environ.update(CRM_BASE_URL="http://crm.test", WORKER_SECRET="secret-de-test", PROVIDER="mock", IMAGE_RETRIES="2")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import crm  # noqa: E402
from creatives import pipeline  # noqa: E402
from providers import get_provider  # noqa: E402
from providers.base import GeneratedImage, GenerationFailed, ProviderBlocked  # noqa: E402
from providers.mock import MockProvider, make_png  # noqa: E402
from state import Activity  # noqa: E402


def request_with(n: int = 3) -> dict:
    return {
        "id": "req1",
        "productName": "TEST-Produit",
        "sourcePhotoUrl": "https://x.public.blob.vercel-storage.com/creatives/uploads/p.png",
        "images": [{"id": f"img{i}", "position": i, "angleKey": f"a{i}", "prompt": f"prompt {i}"} for i in range(1, n + 1)],
    }


class FakeCrm:
    """Enregistre les appels au CRM ; remplace les fonctions de crm.py."""

    def __init__(self, already_taken=()):
        self.calls: list[tuple] = []
        self.already_taken = set(already_taken)

    def start_image(self, image_id):
        self.calls.append(("start", image_id))
        return image_id not in self.already_taken

    def upload_image(self, image_id, data, mime):
        self.calls.append(("upload", image_id, mime, len(data)))
        return f"https://blob/{image_id}.png"

    def fail_image(self, image_id, message):
        self.calls.append(("fail", image_id, message))

    def release_image(self, image_id):
        self.calls.append(("release", image_id))

    def download_to(self, url, dest):
        Path(dest).write_bytes(b"photo")
        return Path(dest)

    def kinds(self):
        return [c[0] for c in self.calls]


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.fake = FakeCrm()
        self.tmp = tempfile.TemporaryDirectory()
        patches = [
            mock.patch.object(crm, "start_image", lambda i: self.fake.start_image(i)),
            mock.patch.object(crm, "upload_image", lambda i, d, m: self.fake.upload_image(i, d, m)),
            mock.patch.object(crm, "fail_image", lambda i, m: self.fake.fail_image(i, m)),
            mock.patch.object(crm, "release_image", lambda i: self.fake.release_image(i)),
            mock.patch.object(crm, "download_to", lambda u, d: self.fake.download_to(u, d)),
            mock.patch.object(crm, "heartbeat", lambda payload: None),
            mock.patch.object(pipeline, "QUEUE_TMP_DIR", Path(self.tmp.name)),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        self.addCleanup(self.tmp.cleanup)
        self.activity = Activity()

    def test_nominal_toutes_les_images_envoyees(self):
        done = pipeline.process_request(request_with(3), MockProvider(), self.activity)
        self.assertEqual(done, 3)
        self.assertEqual(self.fake.kinds(), ["start", "upload"] * 3)
        self.assertEqual(self.activity.payload()["activity"], None)  # redevenu libre

    def test_image_deja_prise_est_ignoree(self):
        self.fake.already_taken = {"img2"}
        done = pipeline.process_request(request_with(3), MockProvider(), self.activity)
        self.assertEqual(done, 2)
        self.assertNotIn(("upload", "img2", "image/png", mock.ANY), self.fake.calls)

    def test_reessais_puis_succes(self):
        # 2 échecs puis réussite : 2 nouvelles tentatives autorisées -> l'image est envoyée.
        with tempfile.TemporaryDirectory() as d:
            control = Path(d) / "c.json"
            control.write_text(json.dumps({"fail": 2}))
            with mock.patch.dict(os.environ, {"MOCK_CONTROL_FILE": str(control)}):
                done = pipeline.process_request(request_with(1), MockProvider(), self.activity)
        self.assertEqual(done, 1)
        self.assertEqual(self.fake.kinds(), ["start", "upload"])

    def test_echec_apres_trois_tentatives_message_explicite(self):
        with tempfile.TemporaryDirectory() as d:
            control = Path(d) / "c.json"
            control.write_text(json.dumps({"fail": 3}))
            with mock.patch.dict(os.environ, {"MOCK_CONTROL_FILE": str(control)}):
                done = pipeline.process_request(request_with(1), MockProvider(), self.activity)
        self.assertEqual(done, 0)
        self.assertEqual(self.fake.kinds(), ["start", "fail"])
        message = self.fake.calls[1][2]
        for n in ("tentative 1/3", "tentative 2/3", "tentative 3/3"):
            self.assertIn(n, message)

    def test_echec_d_une_image_ne_bloque_pas_les_suivantes(self):
        with tempfile.TemporaryDirectory() as d:
            control = Path(d) / "c.json"
            control.write_text(json.dumps({"fail": 3}))  # la 1re image échoue, les autres passent
            with mock.patch.dict(os.environ, {"MOCK_CONTROL_FILE": str(control)}):
                done = pipeline.process_request(request_with(3), MockProvider(), self.activity)
        self.assertEqual(done, 2)
        self.assertEqual(self.fake.kinds(), ["start", "fail", "start", "upload", "start", "upload"])

    def test_blocage_remet_l_image_en_attente_et_leve_paused(self):
        for issue in ("SESSION_EXPIRED", "QUOTA", "CAPTCHA"):
            self.fake.calls.clear()
            with tempfile.TemporaryDirectory() as d:
                control = Path(d) / "c.json"
                control.write_text(json.dumps({"issue": issue}))
                with mock.patch.dict(os.environ, {"MOCK_CONTROL_FILE": str(control)}):
                    with self.assertRaises(pipeline.Paused) as ctx:
                        pipeline.process_request(request_with(3), MockProvider(), self.activity)
            self.assertEqual(ctx.exception.issue, issue)
            # image 1 démarrée puis relâchée (pas d'échec), les images 2 et 3 jamais touchées.
            self.assertEqual(self.fake.kinds(), ["start", "release"], issue)

    def test_pas_de_nouvelle_tentative_sur_blocage(self):
        class Blocked(MockProvider):
            calls = 0

            def generate(self, photo, prompt, label):
                Blocked.calls += 1
                raise ProviderBlocked("QUOTA", "limite")

        with self.assertRaises(pipeline.Paused):
            pipeline.process_request(request_with(1), Blocked(), self.activity)
        self.assertEqual(Blocked.calls, 1)  # un blocage n'est jamais "réessayé" en boucle

    def test_envoi_refuse_par_le_crm_marque_l_image_en_echec(self):
        with mock.patch.object(crm, "upload_image", side_effect=crm.CrmError("HTTP 413", 413)):
            done = pipeline.process_request(request_with(1), MockProvider(), self.activity)
        self.assertEqual(done, 0)
        self.assertEqual(self.fake.kinds(), ["start", "fail"])
        self.assertIn("Envoi de l'image au CRM impossible", self.fake.calls[1][2])

    def test_photo_temporaire_supprimee(self):
        pipeline.process_request(request_with(1), MockProvider(), self.activity)
        self.assertEqual(list(Path(self.tmp.name).iterdir()), [])


class UploadSizeTests(unittest.TestCase):
    def test_petite_image_inchangee(self):
        data = make_png(50, 50, (1, 2, 3))
        out, mime, ext = crm.fit_for_upload(data, "image/png")
        self.assertEqual((out, mime, ext), (data, "image/png", "png"))

    def test_grosse_image_reencodee_sous_la_limite(self):
        data = make_png(1600, 1000, (0, 0, 0), noisy=True)
        self.assertGreater(len(data), crm.MAX_UPLOAD_BYTES)
        out, mime, ext = crm.fit_for_upload(data, "image/png")
        self.assertLessEqual(len(out), crm.MAX_UPLOAD_BYTES)
        self.assertEqual((mime, ext), ("image/jpeg", "jpg"))
        from PIL import Image

        with Image.open(io.BytesIO(out)) as im:
            self.assertEqual(im.format, "JPEG")


class StateTests(unittest.TestCase):
    def setUp(self):
        self.sent: list[dict] = []
        p = mock.patch.object(crm, "heartbeat", lambda payload: self.sent.append(payload))
        p.start()
        self.addCleanup(p.stop)
        self.a = Activity()

    def test_job_produit_utilise_les_colonnes_de_l_ancien_format(self):
        self.a.product({"id": "j1", "originalFilename": "photo.jpg"}, "READING")
        self.assertEqual(
            {k: self.sent[-1][k] for k in ("state", "jobId", "filename", "step", "activity")},
            {"state": "busy", "jobId": "j1", "filename": "photo.jpg", "step": "READING", "activity": None},
        )

    def test_job_creatives_reste_idle_cote_produit(self):
        self.a.creative("Créatives : X — image 1/5")
        p = self.sent[-1]
        self.assertEqual((p["state"], p["jobId"], p["activity"]), ("idle", None, "Créatives : X — image 1/5"))

    def test_blocage_persiste_jusqu_a_clear(self):
        self.a.issue("QUOTA", "limite")
        self.a.idle()
        self.assertEqual(self.sent[-1]["issue"], "QUOTA")  # un changement d'activité n'efface pas le blocage
        self.a.clear_issue()
        self.assertIsNone(self.sent[-1]["issue"])


class ProviderRegistryTests(unittest.TestCase):
    def test_mock_et_inconnu(self):
        self.assertEqual(get_provider("mock").name, "mock")
        with self.assertRaises(ValueError):
            get_provider("n-importe-quoi")

    def test_mock_check_ready_suit_le_fichier_de_controle(self):
        with tempfile.TemporaryDirectory() as d:
            control = Path(d) / "c.json"
            with mock.patch.dict(os.environ, {"MOCK_CONTROL_FILE": str(control)}):
                p = MockProvider()
                self.assertIsNone(p.check_ready())
                control.write_text(json.dumps({"issue": "CAPTCHA"}))
                self.assertEqual(p.check_ready()[0], "CAPTCHA")


if __name__ == "__main__":
    unittest.main()
