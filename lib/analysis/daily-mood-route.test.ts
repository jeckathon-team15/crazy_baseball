import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { GET } from "../../app/api/daily-mood/route";
import { getYesterdayInSeoul } from "./daily-mood";

let originalSource: string | undefined;
beforeEach(() => {
  originalSource = process.env.GAME_RESULTS_SOURCE;
  process.env.GAME_RESULTS_SOURCE = "api-sports";
});
afterEach(() => {
  if (originalSource === undefined) delete process.env.GAME_RESULTS_SOURCE;
  else process.env.GAME_RESULTS_SOURCE = originalSource;
});

test("rejects an unknown team before requesting the provider", async () => {
  const result = await GET(new Request("http://localhost/api/daily-mood?team=unknown"));
  assert.equal(result.status, 400);
});

test("reports missing API configuration without showing a sample as real data", async () => {
  const previousKey = process.env.API_SPORTS_KEY;
  const previousSource = process.env.GAME_RESULTS_SOURCE;
  delete process.env.API_SPORTS_KEY;
  process.env.GAME_RESULTS_SOURCE = "api-sports";
  try {
    const result = await GET(new Request("http://localhost/api/daily-mood?team=한화"));
    assert.equal(result.status, 503);
    assert.match((await result.json()).error, /API/);
  } finally {
    if (previousKey === undefined) delete process.env.API_SPORTS_KEY;
    else process.env.API_SPORTS_KEY = previousKey;
    if (previousSource === undefined) delete process.env.GAME_RESULTS_SOURCE;
    else process.env.GAME_RESULTS_SOURCE = previousSource;
  }
});

test("fetches yesterday's results once and returns team-specific moods", async () => {
  const previousKey = process.env.API_SPORTS_KEY;
  const previousFetch = globalThis.fetch;
  process.env.API_SPORTS_KEY = "daily-route-test-key";
  const date = getYesterdayInSeoul(new Date());
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url.toString());
    if (url.pathname === "/leagues") return Response.json({ errors: [], response: [{ id: 6, name: "KBO" }] });
    return Response.json({ errors: [], response: [{
      id: 123, date: `${date}T18:00:00+09:00`, status: { short: "FT" },
      teams: { home: { name: "Hanwha Eagles" }, away: { name: "Samsung Lions" } },
      scores: { home: { total: 2 }, away: { total: 4 } },
    }] });
  };
  try {
    const home = await GET(new Request("http://localhost/api/daily-mood?team=한화"));
    const away = await GET(new Request("http://localhost/api/daily-mood?team=삼성"));
    const homeData = await home.json();
    const awayData = await away.json();
    assert.equal(home.status, 200);
    assert.equal(homeData.date, date);
    assert.equal(homeData.games[0].result, "L");
    assert.equal(awayData.games[0].result, "W");
    assert.equal(calls.length, 2);
    assert.equal(new URL(calls[1]).searchParams.get("date"), date);
    assert.doesNotMatch(JSON.stringify(homeData), /daily-route-test-key/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.API_SPORTS_KEY;
    else process.env.API_SPORTS_KEY = previousKey;
  }
});

test("reports provider errors instead of saying that no game was played", async () => {
  const previousKey = process.env.API_SPORTS_KEY;
  const previousFetch = globalThis.fetch;
  process.env.API_SPORTS_KEY = "failing-route-test-key";
  globalThis.fetch = async () => Response.json({ errors: { plan: "unavailable" }, response: [] });
  try {
    const result = await GET(new Request("http://localhost/api/daily-mood?team=한화"));
    assert.equal(result.status, 502);
    assert.equal(typeof (await result.json()).error, "string");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.API_SPORTS_KEY;
    else process.env.API_SPORTS_KEY = previousKey;
  }
});

test("retries after a temporary provider failure", async () => {
  const previousKey = process.env.API_SPORTS_KEY;
  const previousFetch = globalThis.fetch;
  process.env.API_SPORTS_KEY = "retry-route-test-key";
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) return Response.json({ errors: { temporary: "unavailable" }, response: [] });
    if (calls === 2) return Response.json({ errors: [], response: [{ id: 6, name: "KBO" }] });
    return Response.json({ errors: [], response: [] });
  };
  try {
    const first = await GET(new Request("http://localhost/api/daily-mood?team=한화"));
    const second = await GET(new Request("http://localhost/api/daily-mood?team=한화"));
    assert.equal(first.status, 502);
    assert.equal(second.status, 200);
    assert.equal((await second.json()).status, "no_game");
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.API_SPORTS_KEY;
    else process.env.API_SPORTS_KEY = previousKey;
  }
});
