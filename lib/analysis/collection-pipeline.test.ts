import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { GET } from "../../app/api/daily-mood/route";
import { getYesterdayInSeoul } from "./daily-mood";

test("collected team posts flow through Python sentiment into a five-class daily prediction", async () => {
  const directory = await mkdtemp(join(tmpdir(), "collection-pipeline-"));
  const date = getYesterdayInSeoul(new Date());
  const gameId = `${date.replaceAll("-", "")}HHSS0`;
  const gamesPath = join(directory, "games.csv");
  const htmlPath = join(directory, "board.html");
  const postsPath = join(directory, "posts.csv");
  const labelsPath = join(directory, "labels.csv");
  const summaryPath = join(directory, "summary.json");
  const snapshotPath = join(directory, "snapshot.json");
  const modelPath = join(directory, "model.json");
  const old = { source: process.env.GAME_RESULTS_SOURCE, model: process.env.MOOD_MODEL_PATH,
    snapshot: process.env.MOOD_SNAPSHOT_PATH, fetch: globalThis.fetch };
  const asOf = new Date().toISOString();
  await writeFile(gamesPath, `gameId,date,homeTeam,awayTeam,homeScore,awayScore,status,startsAt,endsAt\n${gameId},${date},한화,삼성,5,2,finished,${date}T18:00:00+09:00,${date}T21:00:00+09:00\n`);
  await writeFile(modelPath, JSON.stringify({
    schemaVersion: 1, algorithm: "softmax_logistic_regression", source: "live",
    trainedAt: "2020-01-01T00:00:00Z", trainedThrough: "2020-01-01",
    features: ["game_result", "run_difference", "positive_ratio", "negative_ratio"],
    classes: ["매우 안 좋음", "안 좋음", "보통", "좋음", "매우 좋음"],
    means: [0, 0, 0, 0], scales: [1, 1, 1, 1],
    coefficients: [[-1, 0, -2, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [1, 0, 2, -2]],
    intercepts: [0, -10, -10, -10, 0],
  }));
  process.env.GAME_RESULTS_SOURCE = "kbo";
  process.env.MOOD_MODEL_PATH = modelPath;
  process.env.MOOD_SNAPSHOT_PATH = snapshotPath;
  globalThis.fetch = async () => Response.json({ code: 100, game: [{
    G_ID: gameId, G_DT: date.replaceAll("-", ""), G_TM: "18:00", HOME_NM: "한화", AWAY_NM: "삼성",
    B_SCORE_CN: "5", T_SCORE_CN: "2", GAME_STATE_SC: "3",
  }] });
  const python = [
    "import sys",
    "from pathlib import Path",
    "from scripts.collect_community import collect, load_games, parse_time, save_csv",
    "html = Path(sys.argv[2]).read_text(encoding='utf-8')",
    "def fetch(url): return 'User-agent: *\\nAllow: /\\n' if url.endswith('/robots.txt') else html",
    "rows = collect('https://example.org/board', load_games(sys.argv[1]), parse_time(sys.argv[4]), 'community', 1, 0, 12, fetch=fetch)",
    "save_csv(sys.argv[3], rows)",
  ].join("\n");
  try {
    for (const [word, expected] of [["최고", "매우 좋음"], ["아쉽다", "매우 안 좋음"]]) {
      const html = Array.from({ length: 10 }, (_, i) =>
        `<tr><td><span class="word">한화</span></td><td><a class="txt" href="/post?id=${i + 1}">오늘 타격 ${word} ${i}</a></td><td><time datetime="${date}T21:${String(i + 1).padStart(2, "0")}:00+09:00"></time></td></tr>`,
      ).join("");
      await writeFile(htmlPath, `<table>${html}</table>`);
      execFileSync("python3", ["-c", python, gamesPath, htmlPath, postsPath, asOf]);
      execFileSync("python3", ["scripts/analyze_team_posts.py", "--input", postsPath,
        "--labels-csv", labelsPath, "--output", summaryPath, "--minimum-posts", "10"]);
      execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/build-forecast-snapshot.ts",
        "--games", gamesPath, "--posts", postsPath, "--labels", labelsPath, "--output", snapshotPath,
        "--teams", "한화", "--source", "live", "--as-of", asOf,
        "--recent-games", "5", "--window-hours", "12", "--max-posts", "50", "--minimum-posts", "10", "--max-age-days", "7",
        "--win-points", "60", "--run-difference-points", "4", "--streak-points", "5",
        "--run-difference-limit", "5", "--streak-limit", "4", "--fan-weight", "0.2"]);
      const saved = await readFile(snapshotPath, "utf8");
      assert.doesNotMatch(saved, /오늘 타격|example\.org\/post/);
      const response = await GET(new Request(`http://localhost/api/daily-mood?team=한화&date=${date}`));
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(body.community.applied, true);
      assert.equal(body.community.sentiment.validCount, 10);
      assert.equal(body.prediction.method, "machine_learning");
      assert.equal(body.prediction.probabilities.length, 5);
      assert.equal(body.mood, expected);
    }
  } finally {
    globalThis.fetch = old.fetch;
    for (const [key, value] of [["GAME_RESULTS_SOURCE", old.source], ["MOOD_MODEL_PATH", old.model],
      ["MOOD_SNAPSHOT_PATH", old.snapshot]] as const) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
