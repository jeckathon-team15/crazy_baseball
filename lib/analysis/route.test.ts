import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { POST } from "../../app/api/forecast/route";

function request(body: unknown): Request {
  return new Request("http://localhost/api/forecast", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("forecast API uses the submitted input and marks sample data", async () => {
  const input = { bossTitle: "부장님", team: "한화", player: "테스트 선수", favoriteMenus: ["국밥"] };
  const response = await POST(request(input));
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(data.input, input);
  assert.equal(data.performance.team, "한화 이글스");
  assert.equal(data.performance.source, "sample");
  assert.equal(data.forecast.fallback, true);
  assert.equal(data.forecast.lunch.menu, "국밥");
  assert.match(data.forecast.headline, /기분/);
  assert.doesNotMatch(data.forecast.headline, /날씨/);
});

test("forecast API reports unavailable teams without returning another team's sample", async () => {
  const response = await POST(request({
    bossTitle: "팀장님", team: "두산", player: "선수", favoriteMenus: ["국밥"],
  }));
  assert.equal(response.status, 404);
  const data = await response.json();
  assert.equal(typeof data.error, "string");
});

test("forecast API rejects an invalid request", async () => {
  const response = await POST(request({
    bossTitle: "", team: "한화", player: "선수", favoriteMenus: ["국밥"],
  }));
  assert.equal(response.status, 400);
});

test("uses a matching trained model and reports its prediction", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mood-model-test-"));
  const modelPath = join(directory, "model.json");
  const previous = process.env.MOOD_MODEL_PATH;
  process.env.MOOD_MODEL_PATH = modelPath;
  await writeFile(modelPath, JSON.stringify({
    schemaVersion: 1, algorithm: "softmax_logistic_regression", source: "sample",
    trainedAt: "2026-01-01T00:00:00Z", trainedThrough: "2026-10-31",
    features: ["game_result", "run_difference", "positive_ratio", "negative_ratio"],
    classes: ["비", "맑음"], means: [0, 0, 0, 0], scales: [1, 1, 1, 1],
    coefficients: [[0, 0, 0, 0], [0, 0, 0, 0]], intercepts: [-2, 2],
  }));
  try {
    const response = await POST(request({
      bossTitle: "팀장님", team: "한화", player: "선수", favoriteMenus: ["국밥"],
    }));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.prediction.method, "machine_learning");
    assert.equal(body.forecast.mood, "매우 좋음");
    assert.equal(body.prediction.mood, "매우 좋음");
    assert.match(body.forecast.headline, /매우 좋음/);
    assert.equal(body.forecast.moodScore, 80);
    assert.match(body.forecast.reason, /기분 기록/);
  } finally {
    if (previous === undefined) delete process.env.MOOD_MODEL_PATH;
    else process.env.MOOD_MODEL_PATH = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
