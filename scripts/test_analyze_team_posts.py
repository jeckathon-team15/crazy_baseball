import csv
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from scripts.analyze_team_posts import analyze_rows, classify_post, normalize_team_tag, parse_time


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "analyze_team_posts.py"


def post(post_id, tag, text, **extra):
    return {"source": "example", "postId": post_id, "teamTag": tag, "title": text, "text": "", **extra}


class TeamPostAnalysisTests(unittest.TestCase):
    def test_normalizes_ten_team_tags_and_does_not_guess_unknown_tags(self):
        tags = ["[한화]", "삼성", "기아", "LG", "두산", "롯데", "SSG", "NC", "KT", "키움"]
        self.assertEqual(len({normalize_team_tag(tag) for tag in tags}), 10)
        self.assertEqual(normalize_team_tag("ＫＩＡ"), "KIA 타이거즈")
        self.assertIsNone(normalize_team_tag("KBO"))
        self.assertIsNone(normalize_team_tag(""))

    def test_groups_records_for_all_ten_clubs(self):
        tags = ["한화", "삼성", "KIA", "LG", "두산", "롯데", "SSG", "NC", "KT", "키움"]
        rows = [post(str(index), tag, f"오늘 경기 승리 {index}") for index, tag in enumerate(tags)]
        report, _ = analyze_rows(rows, minimum_posts=1)
        self.assertEqual(len(report["teams"]), 10)
        self.assertTrue(all(item["positive"] == 1 for item in report["teams"].values()))

    def test_groups_by_tag_not_by_team_mentioned_in_title(self):
        rows = [
            post("1", "한화", "삼성 선발 정말 잘했다"),
            post("2", "삼성", "우리 수비 실책이 아쉽다"),
            post("3", "한화", "선발이 잘 던졌다"),
            post("4", "야구", "삼성 승리 축하"),
        ]
        report, labels = analyze_rows(rows, minimum_posts=1)
        self.assertEqual(report["teams"]["한화 이글스"]["total"], 2)
        self.assertEqual(report["teams"]["한화 이글스"]["uncertain"], 1)
        self.assertEqual(report["teams"]["한화 이글스"]["positive"], 1)
        self.assertEqual(report["teams"]["삼성 라이온즈"]["negative"], 1)
        self.assertEqual(report["skippedUnknownTag"], 1)
        self.assertEqual(len(labels), 3)

    def test_rules_handle_negation_mixed_text_and_irrelevant_posts(self):
        team = "한화 이글스"
        self.assertEqual(classify_post("타격이 안 좋았다", "", team)["sentiment"], "negative")
        self.assertEqual(classify_post("선발이 나쁘지 않았다", "", team)["sentiment"], "positive")
        self.assertEqual(classify_post("선발이 잘 던졌다", "", team)["sentiment"], "positive")
        self.assertEqual(classify_post("잘했지만 아쉽다", "", team)["sentiment"], "uncertain")
        self.assertEqual(classify_post("경기 결과 4대 2", "", team)["sentiment"], "neutral")
        self.assertFalse(classify_post("경기 티켓 양도합니다", "", team)["relevant"])
        self.assertEqual(classify_post("한화 불펜 좋다", "", "한화")["sentiment"], "positive")

    def test_excludes_duplicates_and_holds_score_when_too_few_valid_posts(self):
        rows = [post("1", "한화", "불펜이 아쉽다"), post("1", "한화", "불펜이 아쉽다"),
                post("2", "한화", "불펜이 아쉽다"), post("3", "한화", "글쎄요")]
        report, labels = analyze_rows(rows, minimum_posts=2)
        team = report["teams"]["한화 이글스"]
        self.assertEqual(report["skippedDuplicate"], 2)
        self.assertEqual(team["total"], 2)
        self.assertEqual(team["validCount"], 1)
        self.assertIsNone(team["score"])
        self.assertEqual({label["postId"] for label in labels}, {"1", "2", "3"})

    def test_same_wording_in_different_games_keeps_each_game_label(self):
        rows = [post("1", "한화", "오늘은 승리", gameId="g1"),
                post("2", "한화", "오늘은 승리", gameId="g2")]
        report, labels = analyze_rows(rows, minimum_posts=1)
        self.assertEqual(report["teams"]["한화 이글스"]["total"], 2)
        self.assertEqual(len(labels), 2)

    def test_labels_keep_identical_posts_for_later_game_window_filtering(self):
        rows = [
            post("1", "한화", "불펜 좋다", gameId="g1", publishedAt="2026-10-01T20:00:00+09:00"),
            post("2", "한화", "불펜 좋다", gameId="g1", publishedAt="2026-10-01T22:00:00+09:00"),
        ]
        report, labels = analyze_rows(rows, minimum_posts=1)
        self.assertEqual(report["teams"]["한화 이글스"]["total"], 1)
        self.assertEqual({label["postId"] for label in labels}, {"1", "2"})

    def test_filters_game_and_timezone_aware_publication_window(self):
        rows = [
            post("1", "한화", "불펜이 좋았다", gameId="g1", publishedAt="2026-10-01T21:30:00+09:00"),
            post("2", "한화", "타격이 아쉽다", gameId="g1", publishedAt="2026-10-02T03:00:00+09:00"),
            post("3", "한화", "경기 승리", gameId="g2", publishedAt="2026-10-01T22:00:00+09:00"),
        ]
        report, _ = analyze_rows(rows, minimum_posts=1, game_id="g1",
                                 since=parse_time("2026-10-01T21:30:00+09:00"),
                                 until=parse_time("2026-10-02T03:00:00+09:00"))
        self.assertEqual(report["teams"]["한화 이글스"]["total"], 1)
        self.assertEqual(report["teams"]["한화 이글스"]["score"], 100)
        with self.assertRaises(ValueError):
            parse_time("2026-10-01T21:30:00")
        with self.assertRaises(ValueError):
            analyze_rows([post("4", "한화", "좋았다")], since=parse_time("2026-10-01T21:30:00+09:00"))

    def test_cli_creates_labels_compatible_with_the_existing_analysis_pipeline(self):
        with tempfile.TemporaryDirectory() as directory:
            summary = Path(directory) / "teams.json"
            labels = Path(directory) / "labels.csv"
            snapshot = Path(directory) / "snapshot.json"
            result = subprocess.run([
                sys.executable, str(SCRIPT), "--input", "scripts/sample/posts.csv", "--minimum-posts", "5",
                "--output", str(summary), "--labels-csv", str(labels),
            ], cwd=ROOT, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            report = json.loads(summary.read_text(encoding="utf-8"))
            self.assertGreaterEqual(report["teams"]["한화 이글스"]["validCount"], 5)
            with labels.open(encoding="utf-8", newline="") as file:
                self.assertEqual(csv.DictReader(file).fieldnames, ["source", "postId", "relevant", "sentiment", "topic"])
            pipeline = subprocess.run([
                "node", "--conditions=react-server", "--import", "tsx", "scripts/build-forecast-snapshot.ts",
                "--games", "scripts/sample/games.csv", "--posts", "scripts/sample/posts.csv", "--labels", str(labels),
                "--teams", "한화,삼성", "--source", "sample", "--as-of", "2026-11-14T08:00:00+09:00",
                "--output", str(snapshot), "--recent-games", "5", "--window-hours", "12", "--max-posts", "50",
                "--minimum-posts", "5", "--max-age-days", "7", "--win-points", "60", "--run-difference-points", "4",
                "--streak-points", "5", "--run-difference-limit", "5", "--streak-limit", "4", "--fan-weight", "0.2",
            ], cwd=ROOT, capture_output=True, text=True)
            self.assertEqual(pipeline.returncode, 0, pipeline.stderr)
            data = json.loads(snapshot.read_text(encoding="utf-8"))
            self.assertGreaterEqual(data["teams"][0]["sentiment"]["validCount"], 5)

    def test_cli_rejects_output_that_would_overwrite_input(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "posts.csv"
            source.write_text("말머리,제목\n한화,오늘 승리\n", encoding="utf-8")
            result = subprocess.run([
                sys.executable, str(SCRIPT), "--input", str(source), "--output", str(source),
            ], cwd=ROOT, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(source.read_text(encoding="utf-8"), "말머리,제목\n한화,오늘 승리\n")

    def test_labels_output_requires_real_source_and_post_id(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "posts.csv"
            labels = Path(directory) / "labels.csv"
            source.write_text("말머리,제목\n한화,오늘 승리\n", encoding="utf-8")
            result = subprocess.run([
                sys.executable, str(SCRIPT), "--input", str(source), "--labels-csv", str(labels),
            ], cwd=ROOT, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("source와 postId", result.stderr)
            self.assertFalse(labels.exists())


if __name__ == "__main__":
    unittest.main()
