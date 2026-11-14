import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as dailyRoute from "../../app/api/daily-mood/route";

const gameCsv = [
  "gameId,date,homeTeam,awayTeam,homeScore,awayScore,status,startsAt,endsAt",
  "20261107KTSS0,2026-11-07,삼성,KT,10,5,finished,2026-11-07T14:00:00+09:00,2026-11-07T17:17:00+09:00",
].join("\n");

function postsCsv(count: number, source = "community"): string {
  const rows = ["source,postId,gameId,team,teamTag,publishedAt,title,text,url"];
  for (let i = 0; i < count; i++) {
    rows.push(`${source},p${i},20261107KTSS0,삼성,삼성,2026-11-07T17:${String(18 + i).padStart(2, "0")}:00+09:00,실망 ${i},타격이 아쉽다 ${i},`);
  }
  return rows.join("\n");
}

function request(games: string, posts: string, labels?: string): Request {
  const form = new FormData();
  form.set("team", "삼성");
  form.set("date", "2026-11-07");
  form.set("games", new Blob([games], { type: "text/csv" }), "games.csv");
  form.set("posts", new Blob([posts], { type: "text/csv" }), "posts.csv");
  if (labels) form.set("labels", new Blob([labels], { type: "text/csv" }), "labels.csv");
  return new Request("http://localhost/api/daily-mood", { method: "POST", body: form });
}

test("combines a matching game's provided post sentiment with the game result", async () => {
  const post = Reflect.get(dailyRoute, "POST") as ((request: Request) => Promise<Response>) | undefined;
  assert.equal(typeof post, "function", "community uploads should be accepted by the daily mood API");
  const originalFetch = globalThis.fetch;
  const originalSource = process.env.GAME_RESULTS_SOURCE;
  const originalModel = process.env.MOOD_MODEL_PATH;
  const originalNow = Date.now;
  process.env.GAME_RESULTS_SOURCE = "kbo";
  process.env.MOOD_MODEL_PATH = "/tmp/nonexistent-yachinja-model.json";
  Date.now = () => Date.parse("2026-11-14T06:00:00Z");
  globalThis.fetch = async () => Response.json({ code: "100", game: [{
    G_ID: "20261107KTSS0", G_DT: "20261107", G_TM: "14:00", HOME_NM: "삼성", AWAY_NM: "KT",
    B_SCORE_CN: "10", T_SCORE_CN: "5", GAME_STATE_SC: "3", CANCEL_SC_NM: "정상경기",
  }] });
  try {
    const posts = [postsCsv(10),
      "community,early,20261107KTSS0,삼성,삼성,2026-11-07T17:16:00+09:00,최고,승리 최고,",
      "community,late,20261107KTSS0,삼성,삼성,2026-11-08T05:18:00+09:00,최고,늦은 승리 최고,",
      "community,other,20261107KTSS0,삼성,한화,2026-11-07T17:29:00+09:00,최고,다른 팀 최고,",
    ].join("\n");
    const response = await post!(request(gameCsv, posts));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.status, "ready");
    assert.equal(body.games[0].teamScore, 10);
    assert.equal(body.games[0].oppScore, 5);
    assert.equal(body.community.applied, true);
    assert.equal(body.community.sentiment.validCount, 10);
    assert.equal(body.community.sentiment.negative, 10);
    assert.equal(body.community.sentiment.score, -100);
    assert.equal(body.prediction.method, "rule_based");
    assert.equal(body.score, 48);
    assert.doesNotMatch(JSON.stringify(body), /타격이 아쉽다 0/);

    const insufficient = await post!(request(gameCsv, postsCsv(5)));
    const insufficientBody = await insufficient.json();
    assert.equal(insufficient.status, 200);
    assert.equal(insufficientBody.community.applied, false);
    assert.equal(insufficientBody.community.sentiment.validCount, 5);
    assert.equal(insufficientBody.score, 85);

    const sample = await post!(request(gameCsv, postsCsv(10, "sample")));
    const sampleBody = await sample.json();
    assert.equal(sampleBody.community.sample, true);
    assert.equal(sampleBody.community.applied, true);

    const labels = ["source,postId,relevant,sentiment,topic", ...Array.from(
      { length: 10 }, (_, i) => `community,p${i},true,positive,타격`,
    )].join("\n");
    const labeled = await post!(request(gameCsv, postsCsv(10), labels));
    const labeledBody = await labeled.json();
    assert.equal(labeled.status, 200);
    assert.equal(labeledBody.community.sentiment.positive, 10);
    assert.equal(labeledBody.score, 88);

    const mismatch = await post!(request(gameCsv.replace(",10,5,", ",11,5,"), postsCsv(10)));
    assert.equal(mismatch.status, 400);
    assert.match((await mismatch.json()).error, /일치하지 않습니다/);
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
    if (originalSource === undefined) delete process.env.GAME_RESULTS_SOURCE;
    else process.env.GAME_RESULTS_SOURCE = originalSource;
    if (originalModel === undefined) delete process.env.MOOD_MODEL_PATH;
    else process.env.MOOD_MODEL_PATH = originalModel;
  }
});

test("uses a compatible trained model for provided posts but not sample posts", async () => {
  const post = Reflect.get(dailyRoute, "POST") as (request: Request) => Promise<Response>;
  const directory = await mkdtemp(join(tmpdir(), "daily-upload-model-"));
  const model = join(directory, "model.json");
  const previous = { source: process.env.GAME_RESULTS_SOURCE, model: process.env.MOOD_MODEL_PATH, fetch: globalThis.fetch, now: Date.now };
  await writeFile(model, JSON.stringify({
    schemaVersion: 1, algorithm: "softmax_logistic_regression", source: "live",
    trainedAt: "2020-01-01T00:00:00Z", trainedThrough: "2020-01-01",
    features: ["game_result", "run_difference", "positive_ratio", "negative_ratio"],
    classes: ["매우 안 좋음", "안 좋음", "보통", "좋음", "매우 좋음"], means: [0, 0, 0, 0], scales: [1, 1, 1, 1],
    coefficients: Array.from({ length: 5 }, () => [0, 0, 0, 0]), intercepts: [-10, -2, -10, -10, 2],
  }));
  process.env.GAME_RESULTS_SOURCE = "kbo";
  process.env.MOOD_MODEL_PATH = model;
  Date.now = () => Date.parse("2026-11-14T06:00:00Z");
  globalThis.fetch = async () => Response.json({ code: "100", game: [{
    G_ID: "20261107KTSS0", G_DT: "20261107", G_TM: "14:00", HOME_NM: "삼성", AWAY_NM: "KT",
    B_SCORE_CN: "10", T_SCORE_CN: "5", GAME_STATE_SC: "3", CANCEL_SC_NM: "정상경기",
  }] });
  try {
    const real = await post(request(gameCsv, postsCsv(10)));
    assert.equal((await real.json()).prediction.method, "machine_learning");
    const sample = await post(request(gameCsv, postsCsv(10, "sample")));
    assert.equal((await sample.json()).prediction.method, "rule_based");
  } finally {
    globalThis.fetch = previous.fetch;
    Date.now = previous.now;
    if (previous.source === undefined) delete process.env.GAME_RESULTS_SOURCE;
    else process.env.GAME_RESULTS_SOURCE = previous.source;
    if (previous.model === undefined) delete process.env.MOOD_MODEL_PATH;
    else process.env.MOOD_MODEL_PATH = previous.model;
    await rm(directory, { recursive: true, force: true });
  }
});
