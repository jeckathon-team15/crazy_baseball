import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GET } from "../../app/api/daily-mood/route";
import { getYesterdayInSeoul } from "./daily-mood";

test("uses a trained live model only when community data match the provider's game", async () => {
  const directory = await mkdtemp(join(tmpdir(), "daily-ml-test-"));
  const modelPath = join(directory, "model.json");
  const snapshotPath = join(directory, "snapshot.json");
  const date = getYesterdayInSeoul(new Date());
  const previous = {
    key: process.env.API_SPORTS_KEY,
    source: process.env.GAME_RESULTS_SOURCE,
    model: process.env.MOOD_MODEL_PATH,
    snapshot: process.env.MOOD_SNAPSHOT_PATH,
    fetch: globalThis.fetch,
  };
  process.env.API_SPORTS_KEY = "daily-ml-test-key";
  process.env.GAME_RESULTS_SOURCE = "api-sports";
  process.env.MOOD_MODEL_PATH = modelPath;
  process.env.MOOD_SNAPSHOT_PATH = snapshotPath;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/leagues") return Response.json({ errors: [], response: [{ id: 6, name: "KBO" }] });
    return Response.json({ errors: [], response: [{
      id: 123, date: `${date}T18:00:00+09:00`, status: { short: "FT" },
      teams: { home: { name: "Hanwha Eagles" }, away: { name: "Samsung Lions" } },
      scores: { home: { total: 2 }, away: { total: 4 } },
    }] });
  };
  await writeFile(modelPath, JSON.stringify({
    schemaVersion: 1, algorithm: "softmax_logistic_regression", source: "live",
    trainedAt: "2020-01-01T00:00:00Z", trainedThrough: "2020-01-01",
    features: ["game_result", "run_difference", "positive_ratio", "negative_ratio"],
    classes: ["매우 안 좋음", "안 좋음", "보통", "좋음", "매우 좋음"], means: [0, 0, 0, 0], scales: [1, 1, 1, 1],
    coefficients: Array.from({ length: 5 }, () => [0, 0, 0, 0]), intercepts: [-10, -2, -10, -10, 2],
  }));
  const snapshot = {
    version: 1, source: "live", asOf: new Date(Date.now() - 1000).toISOString(),
    teams: [{
      team: "한화 이글스", validUntil: new Date(Date.now() + 86_400_000).toISOString(),
      games: [{
        gameId: "123", date, opponent: "삼성 라이온즈", teamScore: 2, oppScore: 4,
        result: "L", startsAt: `${date}T18:00:00+09:00`, endsAt: `${date}T21:00:00+09:00`,
      }],
      sentiment: { validCount: 10, positive: 1, neutral: 1, negative: 8, uncertain: 0, score: -70 },
    }],
  };
  await writeFile(snapshotPath, JSON.stringify(snapshot));
  try {
    const result = await GET(new Request("http://localhost/api/daily-mood?team=한화"));
    const body = await result.json();
    assert.equal(result.status, 200);
    assert.equal(body.games[0].result, "L");
    assert.equal(body.prediction.method, "machine_learning");
    assert.equal(body.mood, "매우 좋음");
    assert.equal(body.prediction.mood, "매우 좋음");
    assert.equal(body.prediction.probabilities.length, 5);

    snapshot.teams[0].games[0].gameId = "different-game";
    await writeFile(snapshotPath, JSON.stringify(snapshot));
    const fallback = await GET(new Request("http://localhost/api/daily-mood?team=한화"));
    const fallbackBody = await fallback.json();
    assert.equal(fallbackBody.prediction.method, "rule_based");
    assert.equal(fallbackBody.mood, "매우 안 좋음");

    const kboId = `${date.replaceAll("-", "")}HHSS0`;
    snapshot.teams[0].games[0].gameId = kboId;
    await writeFile(snapshotPath, JSON.stringify(snapshot));
    process.env.GAME_RESULTS_SOURCE = "kbo";
    globalThis.fetch = async () => Response.json({ code: 100, game: [{
      G_ID: kboId, G_DT: date.replaceAll("-", ""), G_TM: "18:00",
      HOME_NM: "한화", AWAY_NM: "삼성", B_SCORE_CN: "2", T_SCORE_CN: "4", GAME_STATE_SC: "3",
    }] });
    const kboResult = await GET(new Request("http://localhost/api/daily-mood?team=한화"));
    const kboBody = await kboResult.json();
    assert.equal(kboBody.source, "kbo");
    assert.equal(kboBody.prediction.method, "machine_learning");
    assert.equal(kboBody.mood, "매우 좋음");
  } finally {
    globalThis.fetch = previous.fetch;
    for (const [name, value] of [
      ["API_SPORTS_KEY", previous.key], ["GAME_RESULTS_SOURCE", previous.source], ["MOOD_MODEL_PATH", previous.model],
      ["MOOD_SNAPSHOT_PATH", previous.snapshot],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
