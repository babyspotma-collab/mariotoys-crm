"""Sondage adaptatif et battement de cœur économes (voir config.py).

Lancement :
  venv\\Scripts\\python.exe -m unittest discover -s tests -v
"""

import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config  # noqa: E402
import main  # noqa: E402
import state  # noqa: E402
from state import Activity  # noqa: E402


class PollIntervalTest(unittest.TestCase):
    def test_idle_before_any_work(self):
        self.assertEqual(main.poll_interval(1000.0, None), config.IDLE_POLL_INTERVAL_S)

    def test_fast_right_after_work_then_idle_again(self):
        self.assertEqual(main.poll_interval(1000.0, 990.0), config.POLL_INTERVAL_S)
        after_window = 990.0 + config.ACTIVE_WINDOW_S + 1
        self.assertEqual(main.poll_interval(after_window, 990.0), config.IDLE_POLL_INTERVAL_S)

    def test_idle_interval_lets_the_database_sleep(self):
        # Neon s'endort après ~5 min sans requête : le sondage au repos doit être plus long.
        self.assertGreater(config.IDLE_POLL_INTERVAL_S, 300)


class HeartbeatLoopTest(unittest.TestCase):
    def _run_loop(self, activity: Activity, turns: int) -> int:
        """Fait tourner la boucle `turns` fois et renvoie le nombre de battements."""
        sleeps = {"n": 0}

        def fake_sleep(_seconds):
            sleeps["n"] += 1
            if sleeps["n"] > turns:
                raise StopIteration

        with mock.patch.object(state.crm, "heartbeat") as hb, mock.patch.object(state.time, "sleep", fake_sleep):
            try:
                activity.loop()
            except StopIteration:
                pass
            return hb.call_count

    def test_no_heartbeat_at_rest(self):
        self.assertEqual(self._run_loop(Activity(), 3), 0)

    def test_heartbeat_while_working_or_blocked(self):
        with mock.patch.object(state.crm, "heartbeat"):
            working = Activity()
            working.creative("Créatives : image 1/5")
            blocked = Activity()
            blocked.issue("QUOTA", "limite atteinte")
        self.assertEqual(self._run_loop(working, 3), 3)
        self.assertEqual(self._run_loop(blocked, 2), 2)


if __name__ == "__main__":
    unittest.main()
