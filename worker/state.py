"""État partagé envoyé au CRM par le battement de cœur (toutes les 20 s et à
chaque changement). Une seule ligne côté CRM (WorkerStatus) pour les deux
files :

  - job produit en cours : state "busy" + jobId + filename (+ step), comme
    l'ancien worker (la page Création produits les lit à l'identique) ;
  - job Créatives ou attente : state "idle" + `activity` (texte libre) ;
  - Gemini bloque le programme : `issue` (SESSION_EXPIRED / QUOTA / CAPTCHA)
    + `issueMessage`, effacé dès la reprise.
"""

import threading
import time

import crm
from config import HEARTBEAT_INTERVAL_S


class Activity:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._data: dict = self._idle()

    @staticmethod
    def _idle() -> dict:
        return {"state": "idle", "jobId": None, "filename": None, "step": None, "activity": None, "issue": None, "issueMessage": None}

    def _update(self, **changes) -> None:
        with self._lock:
            self._data.update(changes)
        self.send()

    # Les blocages survivent aux changements d'activité : seule clear_issue() les efface.
    def _keep_issue(self) -> dict:
        with self._lock:
            return {"issue": self._data["issue"], "issueMessage": self._data["issueMessage"]}

    def idle(self) -> None:
        self._update(state="idle", jobId=None, filename=None, step=None, activity=None)

    def product(self, job: dict, step: str | None) -> None:
        self._update(state="busy", jobId=job["id"], filename=job.get("originalFilename"), step=step, activity=None)

    def creative(self, text: str) -> None:
        self._update(state="idle", jobId=None, filename=None, step=None, activity=text)

    def issue(self, issue: str, message: str) -> None:
        self._update(state="idle", jobId=None, filename=None, step=None, activity=None, issue=issue, issueMessage=message)

    def clear_issue(self) -> None:
        self._update(issue=None, issueMessage=None)

    def payload(self) -> dict:
        with self._lock:
            return dict(self._data)

    def send(self) -> None:
        crm.heartbeat(self.payload())

    def loop(self) -> None:
        """Fil d'arrière-plan : un battement toutes les HEARTBEAT_INTERVAL_S."""
        while True:
            self.send()
            time.sleep(HEARTBEAT_INTERVAL_S)
