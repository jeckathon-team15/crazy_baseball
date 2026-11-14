import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GET } from "../../app/api/daily-mood/route";
import { getYesterdayInSeoul } from "./daily-mood";

test("applies matched live community sentiment without a trained mood model", async () => {
  const directory = await mkdtemp(join(tmpdir(), "daily-community-test-"));
  const snapshotPath = join(directory, "snapshot.json");
  const date = getYesterdayInSeoul(new Date());
  const previous = {
    source: process.env.GAME_RESULTS_SOURCE,
    snapshot: process.env.MOOD_SNAPSHOT_PATH,
    model: process.env.MOOD_MODEL_PATH,
    fetch: globalThis.fetch,
  };
  process.env.GAME_RESULTS_SOURCE = "kbo";
  process.env.MOOD_SNAPSHOT_PATH = snapshotPath;
  process.env.MOOD_MODEL_PATH = join(directory, "missing-model.json");
  const gameId = `${date.replaceAll("-", "")}HHSS0`;
  globalThis.fetch = async () => Response.json({ code: 100, game: [{
    G_ID: gameId, G_DT: date.replaceAll("-", ""), G_TM: "18:00",
    HOME_NM: "한화", AWAY_NM: "삼성", B_SCORE_CN: "4", T_SCORE_CN: "2", GAME_STATE_SC: "3",
  }] });
  const snapshot = {
    version: 1, source: "live", asOf: new Date(Date.now() - 1000).toISOString(),
    teams: [{
      team: "한화 이글스", validUntil: new Date(Date.now() + 86_400_000).toISOString(),
      games: [{ gameId, date, opponent: "삼성 라이온즈", teamScore: 4, oppScore: 2,
        result: "W", startsAt: `${date}T18:00:00+09:00`, endsAt: `${date}T21:00:00+09:00` }],
      sentiment: { validCount: 10, positive: 0, neutral: 0, negative: 10, uncertain: 0, score: -100 },
    }],
  };
  try {
    await writeFile(snapshotPath, JSON.stringify(snapshot));
    const response = await GET(new Request("http://localhost/api/daily-mood?team=한화"));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.prediction.method, "rule_based");
    assert.equal(body.prediction.communityApplied, true);
    assert.equal(body.score, 38);
    assert.equal(body.mood, "좋음");

    snapshot.teams[0].games[0].gameId = "different-game";
    await writeFile(snapshotPath, JSON.stringify(snapshot));
    const mismatch = await GET(new Request("http://localhost/api/daily-mood?team=한화"));
    const mismatchBody = await mismatch.json();
    assert.equal(mismatchBody.prediction.communityApplied, false);
    assert.equal(mismatchBody.score, 73);

    snapshot.teams[0].games[0].gameId = gameId;
    snapshot.source = "sample";
    await writeFile(snapshotPath, JSON.stringify(snapshot));
    const sample = await GET(new Request("http://localhost/api/daily-mood?team=한화"));
    assert.equal((await sample.json()).prediction.communityApplied, false);

    snapshot.source = "live";
    snapshot.teams[0].sentiment.score = 100;
    await writeFile(snapshotPath, JSON.stringify(snapshot));
    const invalid = await GET(new Request("http://localhost/api/daily-mood?team=한화"));
    assert.equal((await invalid.json()).prediction.communityApplied, false);

    snapshot.teams[0].sentiment.score = -100;
    snapshot.asOf = new Date(Date.now() + 86_400_000).toISOString();
    await writeFile(snapshotPath, JSON.stringify(snapshot));
    const future = await GET(new Request("http://localhost/api/daily-mood?team=한화"));
    assert.equal((await future.json()).prediction.communityApplied, false);

    snapshot.asOf = new Date(Date.now() - 1000).toISOString();
    snapshot.teams[0].validUntil = new Date(Date.now() - 1000).toISOString();
    await writeFile(snapshotPath, JSON.stringify(snapshot));
    const stale = await GET(new Request("http://localhost/api/daily-mood?team=한화"));
    assert.equal((await stale.json()).prediction.communityApplied, false);
  } finally {
    globalThis.fetch = previous.fetch;
    for (const [key, value] of [["GAME_RESULTS_SOURCE", previous.source],
      ["MOOD_SNAPSHOT_PATH", previous.snapshot], ["MOOD_MODEL_PATH", previous.model]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
