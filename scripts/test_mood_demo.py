import csv
import json
import math
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class DemoTrainingPipelineTests(unittest.TestCase):
    def test_synthetic_inputs_train_a_sample_model_end_to_end(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            inputs = folder / "demo"
            labels = folder / "labels.csv"
            training = folder / "training.csv"
            model = folder / "model.json"
            snapshot = folder / "snapshot.json"

            def run(*args):
                result = subprocess.run(args, cwd=ROOT, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                return result

            run(sys.executable, "scripts/generate_mood_demo.py", "--output-dir", str(inputs))
            run(sys.executable, "scripts/analyze_team_posts.py", "--input", str(inputs / "posts.csv"),
                "--labels-csv", str(labels), "--minimum-posts", "10")
            run("node", "--conditions=react-server", "--import", "tsx", "scripts/build-mood-training.ts",
                "--games", str(inputs / "games.csv"), "--posts", str(inputs / "posts.csv"),
                "--labels", str(labels), "--feedback", str(inputs / "feedback.csv"), "--output", str(training),
                "--window-hours", "12", "--max-posts", "50", "--minimum-posts", "10")
            with training.open(encoding="utf-8", newline="") as file:
                rows = list(csv.DictReader(file))
            self.assertEqual(len(rows), 30)
            self.assertEqual({row["mood"] for row in rows}, {"매우 안 좋음", "안 좋음", "보통", "좋음", "매우 좋음"})
            run(sys.executable, "scripts/train_mood_model.py", "--input", str(training), "--output", str(model),
                "--source", "sample", "--test-fraction", "0.2", "--iterations", "400",
                "--learning-rate", "0.1", "--l2", "0.01")
            artifact = json.loads(model.read_text(encoding="utf-8"))
            self.assertEqual(artifact["source"], "sample")
            self.assertEqual(len(artifact["classes"]), 5)
            self.assertEqual(artifact["features"], ["game_result", "run_difference", "positive_ratio", "negative_ratio"])
            self.assertEqual(artifact["evaluation"]["testCount"], 6)
            self.assertNotIn("sample-fan", model.read_text(encoding="utf-8"))

            run("node", "--conditions=react-server", "--import", "tsx", "scripts/build-forecast-snapshot.ts",
                "--games", str(inputs / "games.csv"), "--posts", str(inputs / "posts.csv"),
                "--labels", str(labels), "--teams", "한화", "--source", "sample",
                "--as-of", "2026-10-16T08:00:00+09:00", "--output", str(snapshot),
                "--recent-games", "5", "--window-hours", "12", "--max-posts", "50", "--minimum-posts", "10",
                "--max-age-days", "7", "--win-points", "60", "--run-difference-points", "4",
                "--streak-points", "5", "--run-difference-limit", "5", "--streak-limit", "4", "--fan-weight", "0.2")
            verify = """
import { POST } from './app/api/forecast/route.ts';
process.env.MOOD_MODEL_PATH = process.argv[1];
process.env.MOOD_SNAPSHOT_PATH = process.argv[2];
const response = await POST(new Request('http://localhost/api/forecast', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({bossTitle:'팀장님', team:'한화', player:'선수', favoriteMenus:['국밥']})
}));
const body = await response.json();
if (!response.ok) throw new Error(JSON.stringify(body));
console.log(JSON.stringify(body.prediction));
"""
            inference = run("node", "--conditions=react-server", "--import", "tsx", "--input-type=module",
                            "--eval", verify, str(model), str(snapshot))
            prediction = json.loads(inference.stdout)
            self.assertEqual(prediction["method"], "machine_learning")
            self.assertEqual(len(prediction["probabilities"]), 5)
            team = json.loads(snapshot.read_text(encoding="utf-8"))["teams"][0]
            game, reaction = team["games"][0], team["sentiment"]
            difference = game["teamScore"] - game["oppScore"]
            features = [int(difference > 0) - int(difference < 0), difference,
                        reaction["positive"] / reaction["validCount"],
                        reaction["negative"] / reaction["validCount"]]
            scaled = [(value - mean) / scale for value, mean, scale
                      in zip(features, artifact["means"], artifact["scales"])]
            logits = [sum(weight * value for weight, value in zip(row, scaled)) + intercept
                      for row, intercept in zip(artifact["coefficients"], artifact["intercepts"])]
            weights = [math.exp(value - max(logits)) for value in logits]
            for actual, weight, label in zip(prediction["probabilities"], weights, artifact["classes"]):
                self.assertEqual(actual["mood"], label)
                self.assertAlmostEqual(actual["probability"], weight / sum(weights), places=12)

            before = (inputs / "games.csv").read_bytes()
            repeated = subprocess.run([sys.executable, "scripts/generate_mood_demo.py", "--output-dir", str(inputs)],
                                      cwd=ROOT, capture_output=True, text=True)
            self.assertNotEqual(repeated.returncode, 0)
            self.assertEqual((inputs / "games.csv").read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
