import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchKboGames } from "../sports/api-sports";

test("finds the KBO league and requests the date in Korean time", async () => {
  const calls: Array<{ url: URL; key: string | null }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, key: new Headers(init?.headers).get("x-apisports-key") });
    if (url.pathname === "/leagues") {
      return Response.json({ errors: [], response: [
        { id: 10, name: "KBO Futures League", country: { name: "South-Korea" } },
        { id: 6, name: "KBO", country: { name: "South-Korea" } },
      ] });
    }
    return Response.json({ errors: [], response: [{
      id: 123, date: "2026-04-12T18:00:00+09:00", status: { short: "FT" },
      teams: { home: { name: "Hanwha Eagles" }, away: { name: "Samsung Lions" } },
      scores: { home: { total: 2 }, away: { total: 4 } },
    }] });
  };
  const games = await fetchKboGames("2026-04-12", "test-key", fetcher);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.searchParams.get("search"), "KBO");
  assert.equal(calls[1].url.searchParams.get("league"), "6");
  assert.equal(calls[1].url.searchParams.get("season"), "2026");
  assert.equal(calls[1].url.searchParams.get("date"), "2026-04-12");
  assert.equal(calls[1].url.searchParams.get("timezone"), "Asia/Seoul");
  assert.ok(calls.every((call) => call.key === "test-key"));
  assert.equal(games[0].gameId, "123");
  assert.equal(games[0].status, "finished");
  assert.equal(games[0].homeScore, 2);
});

test("reports API-level errors even when the HTTP response is successful", async () => {
  const fetcher: typeof fetch = async () => Response.json({ errors: { plan: "unavailable" }, response: [] });
  await assert.rejects(fetchKboGames("2026-04-12", "test-key", fetcher), /API/);
});

test("preserves cancelled and pending games without inventing scores", async () => {
  let call = 0;
  const fetcher: typeof fetch = async () => {
    call += 1;
    if (call === 1) return Response.json({ errors: [], response: [{ id: 6, name: "KBO" }] });
    return Response.json({ errors: [], response: ["POST", "NS"].map((status, index) => ({
      id: index + 1, date: "2026-04-12T18:00:00+09:00", status: { short: status },
      teams: { home: { name: "Hanwha Eagles" }, away: { name: "Samsung Lions" } },
      scores: { home: { total: null }, away: { total: null } },
    })) });
  };
  const games = await fetchKboGames("2026-04-12", "test-key", fetcher);
  assert.deepEqual(games.map((game) => game.status), ["cancelled", "pending"]);
  assert.equal(games[0].homeScore, null);
});
