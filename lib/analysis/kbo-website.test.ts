import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchKboWebsiteGames } from "../sports/kbo-website";

const completedGame = {
  G_ID: "20260805SSLG0", G_DT: "20260805", G_TM: "18:30",
  AWAY_NM: "삼성", HOME_NM: "LG", T_SCORE_CN: "0", B_SCORE_CN: "3",
  GAME_STATE_SC: "3", GAME_RESULT_CK: 1, CANCEL_SC_NM: "정상경기",
};

test("requests one KBO game day and preserves the home, away, and zero scores", async () => {
  const fetcher: typeof fetch = async (input, init) => {
    assert.equal(String(input), "https://www.koreabaseball.com/ws/Main.asmx/GetKboGameList");
    assert.equal(init?.method, "POST");
    const params = new URLSearchParams(String(init?.body));
    assert.equal(params.get("date"), "20260805");
    assert.equal(params.get("leId"), "1");
    assert.equal(params.get("srId"), "0,1,3,4,5,6,7");
    return Response.json({ code: "100", game: [completedGame] });
  };
  const games = await fetchKboWebsiteGames("2026-08-05", fetcher);
  assert.equal(games.length, 1);
  assert.equal(games[0].gameId, "20260805SSLG0");
  assert.equal(games[0].date, "2026-08-05");
  assert.equal(games[0].startsAt, "2026-08-05T18:30:00+09:00");
  assert.equal(games[0].homeTeam, "LG");
  assert.equal(games[0].awayTeam, "삼성");
  assert.equal(games[0].homeScore, 3);
  assert.equal(games[0].awayScore, 0);
  assert.equal(games[0].status, "finished");
});

test("keeps cancelled and unfinished games separate from completed games", async () => {
  const fetcher: typeof fetch = async () => Response.json({ code: 100, game: [
    { ...completedGame, G_ID: "cancel", GAME_STATE_SC: "4", CANCEL_SC_NM: "우천취소", T_SCORE_CN: " ", B_SCORE_CN: "" },
    { ...completedGame, G_ID: "pending", GAME_STATE_SC: "2", GAME_RESULT_CK: 0, T_SCORE_CN: "1", B_SCORE_CN: "0" },
  ] });
  const games = await fetchKboWebsiteGames("2026-08-05", fetcher);
  assert.deepEqual(games.map((game) => game.status), ["cancelled", "pending"]);
  assert.equal(games[0].homeScore, null);
  assert.equal(games[1].homeScore, 0);
});

test("returns an empty list when KBO returns a successful day without games", async () => {
  const fetcher: typeof fetch = async () => Response.json({ code: "100", game: [] });
  assert.deepEqual(await fetchKboWebsiteGames("2026-08-05", fetcher), []);
});

test("reads a valid game response even if KBO appends an HTML error page", async () => {
  const data = JSON.stringify({ code: "100", game: [completedGame], note: "<html is part of this JSON string" });
  const fetcher: typeof fetch = async () => new Response(`${data}\n<!DOCTYPE html><html><body>error</body></html>`);
  const games = await fetchKboWebsiteGames("2026-08-05", fetcher);
  assert.equal(games.length, 1);
  assert.equal(games[0].status, "finished");
  assert.equal(games[0].homeScore, 3);
  assert.equal(games[0].awayScore, 0);
});

test("does not treat an HTML-only error response as an empty game day", async () => {
  const fetcher: typeof fetch = async () => new Response("<!DOCTYPE html><html><body>error</body></html>");
  await assert.rejects(fetchKboWebsiteGames("2026-08-05", fetcher));
});

test("rejects failed and malformed responses instead of assuming there was no game", async () => {
  const responses = [
    { code: "500", game: [] },
    { code: "100" },
    { code: "100", game: [{ ...completedGame, G_DT: "20260804" }] },
    { code: "100", game: [{ ...completedGame, B_SCORE_CN: "" }] },
  ];
  for (const payload of responses) {
    const fetcher: typeof fetch = async () => Response.json(payload);
    await assert.rejects(fetchKboWebsiteGames("2026-08-05", fetcher));
  }
});
