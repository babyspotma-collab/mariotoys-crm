"""Suggestions d'accroches : sans réseau ni Claude (CRM et exécuteur simulés).

  venv\\Scripts\\python.exe -m unittest discover -s tests -v
"""

import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

os.environ.update(CRM_BASE_URL="http://crm.test", WORKER_SECRET="secret-de-test", PROVIDER="mock")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import crm  # noqa: E402
from creatives import hooks  # noqa: E402
from creatives.hooks import HookSuggestionError, PROMPT, process_hook_queue, suggest_hooks  # noqa: E402
from state import Activity  # noqa: E402

PHOTO = Path("photo.png")


class SuggestHooksTests(unittest.TestCase):
    def test_json_simple(self):
        out = suggest_hooks(PHOTO, "Pot", lambda p, n: '{"hooks": ["Fini les couches ?", "Le pot qui fait sourire", "Cadeau idéal"]}')
        self.assertEqual(out, ["Fini les couches ?", "Le pot qui fait sourire", "Cadeau idéal"])

    def test_json_entoure_de_texte_et_de_balises(self):
        text = 'Voici :\n```json\n{"hooks": ["A b", "C d"]}\n```\nBonne chance'
        self.assertEqual(suggest_hooks(PHOTO, "Pot", lambda p, n: text), ["A b", "C d"])

    def test_au_plus_cinq_candidates_et_elements_non_textes_ignores(self):
        out = suggest_hooks(PHOTO, "Pot", lambda p, n: '{"hooks": ["a", 3, null, "", "b", "c", "d", "e", "f", "g"]}')
        self.assertEqual(out, ["a", "b", "c", "d", "e"])

    def test_reponse_illisible(self):
        with self.assertRaises(HookSuggestionError):
            suggest_hooks(PHOTO, "Pot", lambda p, n: "désolé, je ne peux pas")

    def test_sans_liste(self):
        with self.assertRaises(HookSuggestionError):
            suggest_hooks(PHOTO, "Pot", lambda p, n: '{"autre": 1}')

    def test_liste_vide(self):
        with self.assertRaises(HookSuggestionError):
            suggest_hooks(PHOTO, "Pot", lambda p, n: '{"hooks": []}')

    def test_prompt_interdit_prix_et_inventions(self):
        text = PROMPT.format(photo="photo.png", name="Pot Faon")
        self.assertIn("photo.png", text)
        self.assertIn("Pot Faon", text)
        for rule in ("6 mots maximum", "AUCUN prix", "n'invente aucune caractéristique", "UNIQUEMENT par un objet JSON"):
            self.assertIn(rule, text)


class ProcessHookQueueTests(unittest.TestCase):
    def setUp(self):
        self.calls: list[tuple] = []
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        request = {"id": "h1", "photoUrl": "https://x.public.blob.vercel-storage.com/creatives/uploads/p.png", "productName": "Pot Faon"}
        self.request = request

        def download(url, dest):
            Path(dest).write_bytes(b"photo")
            self.calls.append(("download", Path(dest).name))
            return Path(dest)

        for p in (
            mock.patch.object(crm, "next_hook_request", lambda: self.request),
            mock.patch.object(crm, "download_to", download),
            mock.patch.object(crm, "complete_hook", lambda i, h: self.calls.append(("complete", i, h))),
            mock.patch.object(crm, "fail_hook", lambda i, m: self.calls.append(("fail", i, m))),
            mock.patch.object(crm, "heartbeat", lambda payload: None),
            mock.patch.object(hooks, "QUEUE_TMP_DIR", Path(self.tmp.name)),
        ):
            p.start()
            self.addCleanup(p.stop)
        self.activity = Activity()

    def test_aucune_demande(self):
        self.request = None
        self.assertFalse(process_hook_queue(self.activity, runner=lambda p, n: "{}"))
        self.assertEqual(self.calls, [])

    def test_succes_envoie_les_accroches_et_supprime_la_photo(self):
        seen = {}

        def runner(photo, name):
            seen["name"], seen["exists"] = name, photo.exists()
            return '{"hooks": ["Fini les couches ?", "Un pot, un sourire"]}'

        self.assertTrue(process_hook_queue(self.activity, runner=runner))
        self.assertEqual(seen, {"name": "Pot Faon", "exists": True})
        self.assertEqual(self.calls[-1], ("complete", "h1", ["Fini les couches ?", "Un pot, un sourire"]))
        self.assertEqual(list(Path(self.tmp.name).iterdir()), [])
        self.assertIsNone(self.activity.payload()["activity"])

    def test_echec_lisible_renvoye_au_crm(self):
        def runner(photo, name):
            raise HookSuggestionError("Claude n'a pas répondu en 180 secondes.")

        self.assertTrue(process_hook_queue(self.activity, runner=runner))
        self.assertEqual(self.calls[-1], ("fail", "h1", "Claude n'a pas répondu en 180 secondes."))
        self.assertEqual(list(Path(self.tmp.name).iterdir()), [])

    def test_erreur_inattendue_ne_plante_pas_le_programme(self):
        def runner(photo, name):
            raise ValueError("boum")

        self.assertTrue(process_hook_queue(self.activity, runner=runner))
        self.assertEqual(self.calls[-1][0], "fail")
        self.assertIn("boum", self.calls[-1][2])

    def test_un_blocage_gemini_en_cours_n_est_pas_efface(self):
        self.activity.issue("QUOTA", "limite")
        process_hook_queue(self.activity, runner=lambda p, n: '{"hooks": ["a b"]}')
        self.assertEqual(self.activity.payload()["issue"], "QUOTA")


if __name__ == "__main__":
    unittest.main()
