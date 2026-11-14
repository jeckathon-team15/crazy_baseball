import csv
import json
import subprocess
import sys
import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path


SCRIPT = Path(__file__).with_name("train_mood_model.py")
FIELDS = [
    "user_id", "game_id", "team", "game_date", "game_ended_at", "as_of",
    "mood_recorded_at", "team_score", "opponent_score",
    "positive", "neutral", "negative", "mood",
]


class TrainingTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)
        self.rows = []
        for day in range(10):
            game_date = date(2026, 10, 1) + timedelta(days=day)
            mood_date = game_date + timedelta(days=1)
            for participant in range(2):
                won = (day + participant) % 2 == 0
                self.rows.append({
                    "user_id": f"user-{participant}",
                    "game_id": f"game-{day}-{participant}",
                    "team": "한화",
                    "game_date": game_date.isoformat(),
                    "game_ended_at": f"{game_date}T21:00:00+09:00",
                    "as_of": f"{game_date}T23:00:00+09:00",
                    "mood_recorded_at": f"{mood_date}T09:00:00+09:00",
                    "team_score": 5 if won else 1,
                    "opponent_score": 1 if won else 5,
                    "positive": 8 if won else 1,
                    "neutral": 1,
                    "negative": 1 if won else 8,
                    "mood": "맑음" if won else "비",
                })

    def run_training(self, source="sample"):
        data_path = self.directory / "feedback.csv"
        output_path = self.directory / "model.json"
        with data_path.open("w", encoding="utf-8", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=FIELDS)
            writer.writeheader()
            writer.writerows(self.rows)
        result = subprocess.run([
            sys.executable, str(SCRIPT), "--input", str(data_path), "--output", str(output_path),
            "--source", source, "--test-fraction", "0.2",
            "--iterations", "400", "--learning-rate", "0.1", "--l2", "0.01",
        ], capture_output=True, text=True)
        return result, output_path

    def test_live_model_requires_all_five_moods_in_training(self):
        result, path = self.run_training(source="live")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("5", result.stderr)
        self.assertFalse(path.exists())

    def test_live_model_exports_all_five_moods(self):
        labels = ["매우 안 좋음", "안 좋음", "보통", "좋음", "매우 좋음"]
        for index, row in enumerate(self.rows):
            row["mood"] = labels[index % len(labels)]
        result, path = self.run_training(source="live")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(path.read_text(encoding="utf-8"))["classes"], labels)

    def test_trains_with_a_chronological_holdout_and_omits_user_ids(self):
        result, path = self.run_training()
        self.assertEqual(result.returncode, 0, result.stderr)
        model = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(model["algorithm"], "softmax_logistic_regression")
        self.assertEqual(model["source"], "sample")
        self.assertEqual(model["trainedThrough"], "2026-10-08")
        self.assertEqual(model["evaluation"]["testStart"], "2026-10-09")
        self.assertEqual(model["evaluation"]["testCount"], 4)
        self.assertGreaterEqual(model["evaluation"]["accuracy"], 0.5)
        self.assertEqual(model["evaluation"]["testClassCounts"]["매우 좋음"], 2)
        self.assertEqual(set(model["evaluation"]["missingTrainClasses"]), {"매우 안 좋음", "보통", "좋음"})
        self.assertEqual(set(model["evaluation"]["missingTestClasses"]), {"매우 안 좋음", "보통", "좋음"})
        self.assertNotIn("user-0", path.read_text(encoding="utf-8"))
        self.assertNotIn("game-0-0", path.read_text(encoding="utf-8"))

    def test_accepts_old_and_new_mood_names_and_exports_only_new_names(self):
        old = ["천둥번개", "비", "흐림", "구름 조금", "맑음"]
        current = ["매우 안 좋음", "안 좋음", "보통", "좋음", "매우 좋음"]
        for index, row in enumerate(self.rows):
            row["mood"] = (old if index % 2 == 0 else current)[index % 5]
        result, path = self.run_training()
        self.assertEqual(result.returncode, 0, result.stderr)
        model = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(model["classes"], current)
        self.assertTrue(set(model["evaluation"]["classes"]).issubset(current))

    def test_rejects_unknown_mood_names(self):
        self.rows[0]["mood"] = "알 수 없음"
        result, path = self.run_training()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("기분", result.stderr)
        self.assertFalse(path.exists())

    def test_rejects_feedback_recorded_before_features_were_available(self):
        self.rows[0]["mood_recorded_at"] = "2026-10-01T20:00:00+09:00"
        result, path = self.run_training()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("시각", result.stderr)
        self.assertFalse(path.exists())

    def test_rejects_duplicate_feedback_instead_of_counting_it_twice(self):
        self.rows.append(dict(self.rows[0]))
        result, path = self.run_training()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("중복", result.stderr)
        self.assertFalse(path.exists())

    def test_rejects_one_game_id_with_conflicting_game_dates(self):
        self.rows[3]["game_id"] = self.rows[0]["game_id"]
        result, path = self.run_training()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("경기 날짜", result.stderr)
        self.assertFalse(path.exists())

    def test_excludes_training_labels_recorded_after_the_first_test_prediction_time(self):
        self.rows[14]["mood_recorded_at"] = "2026-10-09T23:30:00+09:00"
        result, path = self.run_training()
        self.assertEqual(result.returncode, 0, result.stderr)
        evaluation = json.loads(path.read_text(encoding="utf-8"))["evaluation"]
        self.assertEqual(evaluation["trainCount"], 15)
        self.assertEqual(evaluation["excludedLateLabels"], 1)

    def test_rejects_feedback_that_has_not_yet_been_recorded(self):
        future = datetime.now(timezone.utc).date() + timedelta(days=10)
        self.rows[0].update({
            "game_date": future.isoformat(),
            "game_ended_at": f"{future}T21:00:00+09:00",
            "as_of": f"{future}T23:00:00+09:00",
            "mood_recorded_at": f"{future + timedelta(days=1)}T09:00:00+09:00",
        })
        result, path = self.run_training()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("미래", result.stderr)
        self.assertFalse(path.exists())

    def test_rejects_conflicting_scores_for_the_same_team_and_game(self):
        self.rows[1]["game_id"] = self.rows[0]["game_id"]
        self.rows[1]["team"] = "한화 이글스"
        self.rows[1]["team_score"] = self.rows[0]["team_score"] + 1
        result, path = self.run_training()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("경기 기록", result.stderr)
        self.assertFalse(path.exists())


if __name__ == "__main__":
    unittest.main()
