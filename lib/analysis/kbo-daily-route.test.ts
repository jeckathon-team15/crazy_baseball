import assert from "node:assert/strict";
import { test } from "node:test";
import { GET } from "../../app/api/daily-mood/route";
import { getYesterdayInSeoul } from "./daily-mood";

test("defaults to KBO website results and shares them across teams", async () => {
  const previousSource = process.env.GAME_RESULTS_SOURCE;
  const previousKey = process.env.API_SPORTS_KEY;
  const previousFetch = globalThis.fetch;
  delete process.env.GAME_RESULTS_SOURCE;
  process.env.API_SPORTS_KEY = "unused-api-sports-key";
  const date = getYesterdayInSeoul(new Date());
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls += 1;
    assert.match(String(input), /koreabaseball\.com\/ws\/Main\.asmx\/GetKboGameList/);
    assert.equal(new URLSearchParams(String(init?.body)).get("date"), date.replaceAll("-", ""));
    return Response.json({ code: 100, game: [{
      G_ID: `${date.replaceAll("-", "")}HHLG0`, G_DT: date.replaceAll("-", ""), G_TM: "18:30",
      AWAY_NM: "한화", HOME_NM: "LG", T_SCORE_CN: "2", B_SCORE_CN: "4",
      GAME_STATE_SC: "3", GAME_RESULT_CK: 1, CANCEL_SC_NM: "정상경기",
    }] });
  };
  try {
    const home = await GET(new Request("http://localhost/api/daily-mood?team=LG"));
    const away = await GET(new Request("http://localhost/api/daily-mood?team=한화"));
    const homeData = await home.json();
    const awayData = await away.json();
    assert.equal(home.status, 200);
    assert.equal(homeData.date, date);
    assert.equal(homeData.source, "kbo");
    assert.equal(homeData.games[0].result, "W");
    assert.equal(awayData.games[0].result, "L");
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousSource === undefined) delete process.env.GAME_RESULTS_SOURCE;
    else process.env.GAME_RESULTS_SOURCE = previousSource;
    if (previousKey === undefined) delete process.env.API_SPORTS_KEY;
    else process.env.API_SPORTS_KEY = previousKey;
  }
});

test("returns the 2026 Korean Series game for both teams", async () => {
  const previousSource = process.env.GAME_RESULTS_SOURCE;
  const previousFetch = globalThis.fetch;
  process.env.GAME_RESULTS_SOURCE = "kbo";
  globalThis.fetch = async (_input, init) => {
    const params = new URLSearchParams(String(init?.body));
    const matchesDate = params.get("date") === "20261103";
    const includesKoreanSeries = params.get("srId")?.split(",").includes("7");
    return Response.json({ code: "100", game: matchesDate && includesKoreanSeries ? [{
      SR_ID: 7, G_ID: "20261103SSKT0", G_DT: "20261103", G_TM: "18:30",
      AWAY_NM: "삼성", HOME_NM: "KT", T_SCORE_CN: "7", B_SCORE_CN: "8",
      GAME_STATE_SC: "3", GAME_RESULT_CK: 1, CANCEL_SC_NM: "정상경기",
    }] : [] });
  };
  try {
    const samsung = await GET(new Request("http://localhost/api/daily-mood?team=삼성&date=2026-11-03"));
    const samsungData = await samsung.json();
    assert.equal(samsung.status, 200);
    assert.equal(samsungData.status, "ready");
    assert.equal(samsungData.games[0].result, "L");
    assert.equal(samsungData.games[0].teamScore, 7);
    assert.equal(samsungData.games[0].oppScore, 8);

    const kt = await GET(new Request("http://localhost/api/daily-mood?team=KT&date=2026-11-03"));
    const ktData = await kt.json();
    assert.equal(ktData.status, "ready");
    assert.equal(ktData.games[0].result, "W");
    assert.equal(ktData.games[0].teamScore, 8);
    assert.equal(ktData.games[0].oppScore, 7);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousSource === undefined) delete process.env.GAME_RESULTS_SOURCE;
    else process.env.GAME_RESULTS_SOURCE = previousSource;
  }
});

test("logs a network failure for diagnosis while returning a generic error", async () => {
  const previousSource = process.env.GAME_RESULTS_SOURCE;
  const previousFetch = globalThis.fetch;
  const previousLog = console.error;
  const logs: unknown[][] = [];
  process.env.GAME_RESULTS_SOURCE = "kbo";
  globalThis.fetch = async () => {
    throw new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } });
  };
  console.error = (...args: unknown[]) => { logs.push(args); };
  try {
    const response = await GET(new Request("http://localhost/api/daily-mood?team=삼성&date=2026-11-07"));
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error, "경기 결과를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    assert.match(JSON.stringify(logs), /2026-11-07/);
    assert.match(JSON.stringify(logs), /ENOTFOUND/);
  } finally {
    globalThis.fetch = previousFetch;
    console.error = previousLog;
    if (previousSource === undefined) delete process.env.GAME_RESULTS_SOURCE;
    else process.env.GAME_RESULTS_SOURCE = previousSource;
  }
});
