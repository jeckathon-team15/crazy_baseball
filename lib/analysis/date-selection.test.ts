import assert from "node:assert/strict";
import { test } from "node:test";
import { GET } from "../../app/api/daily-mood/route";
import { getTodayInSeoul } from "../dates";

test("uses the current calendar date in Seoul on both sides of midnight", () => {
  assert.equal(getTodayInSeoul(new Date("2026-04-12T14:59:59Z")), "2026-04-12");
  assert.equal(getTodayInSeoul(new Date("2026-04-12T15:00:00Z")), "2026-04-13");
});

test("looks up the selected game date and returns its team result", async () => {
  const previousSource = process.env.GAME_RESULTS_SOURCE;
  const previousFetch = globalThis.fetch;
  process.env.GAME_RESULTS_SOURCE = "kbo";
  const datesRequested: string[] = [];
  globalThis.fetch = async (_input, init) => {
    const date = new URLSearchParams(String(init?.body)).get("date") ?? "";
    datesRequested.push(date);
    return Response.json({ code: 100, game: [{
      G_ID: `${date}HHLG0`, G_DT: date, G_TM: "18:30",
      AWAY_NM: "한화", HOME_NM: "LG", T_SCORE_CN: "2", B_SCORE_CN: "4",
      GAME_STATE_SC: "3", GAME_RESULT_CK: 1, CANCEL_SC_NM: "정상경기",
    }] });
  };
  try {
    const first = await GET(new Request("http://localhost/api/daily-mood?team=한화&date=2026-04-12"));
    const firstData = await first.json();
    assert.equal(first.status, 200);
    assert.equal(firstData.date, "2026-04-12");
    assert.equal(firstData.games[0].result, "L");
    assert.equal(firstData.games[0].teamScore, 2);

    const second = await GET(new Request("http://localhost/api/daily-mood?team=LG&date=2026-04-13"));
    const secondData = await second.json();
    assert.equal(second.status, 200);
    assert.equal(secondData.date, "2026-04-13");
    assert.equal(secondData.games[0].result, "W");
    assert.deepEqual(datesRequested, ["20260412", "20260413"]);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousSource === undefined) delete process.env.GAME_RESULTS_SOURCE;
    else process.env.GAME_RESULTS_SOURCE = previousSource;
  }
});

test("rejects empty, malformed, and impossible dates before calling the provider", async () => {
  const previousSource = process.env.GAME_RESULTS_SOURCE;
  const previousFetch = globalThis.fetch;
  process.env.GAME_RESULTS_SOURCE = "kbo";
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ code: 100, game: [] });
  };
  try {
    for (const date of ["", "2026-4-12", "2026-02-30"]) {
      const response = await GET(new Request(`http://localhost/api/daily-mood?team=한화&date=${date}`));
      assert.equal(response.status, 400);
    }
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousSource === undefined) delete process.env.GAME_RESULTS_SOURCE;
    else process.env.GAME_RESULTS_SOURCE = previousSource;
  }
});
