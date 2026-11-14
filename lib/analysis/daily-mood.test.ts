import assert from "node:assert/strict";
import { test } from "node:test";
import { getYesterdayInSeoul, createDailyMood, type DailyGameRecord } from "./daily-mood";
import { normalizeTeam } from "./game-results";

const game: DailyGameRecord = {
  gameId: "101", date: "2026-04-12", startsAt: "2026-04-12T18:00:00+09:00",
  homeTeam: "Hanwha Eagles", awayTeam: "Samsung Lions", homeScore: 2, awayScore: 4,
  status: "finished",
};

test("uses the previous calendar day in Seoul across midnight and year boundaries", () => {
  assert.equal(getYesterdayInSeoul(new Date("2026-04-12T14:59:59Z")), "2026-04-11");
  assert.equal(getYesterdayInSeoul(new Date("2026-04-12T15:00:00Z")), "2026-04-12");
  assert.equal(getYesterdayInSeoul(new Date("2025-12-31T15:00:00Z")), "2025-12-31");
  assert.equal(getYesterdayInSeoul(new Date("2024-03-01T00:00:00Z")), "2024-02-29");
});

test("recognizes the English names of all ten KBO teams", () => {
  const names = [
    "Hanwha Eagles", "Samsung Lions", "Kia Tigers", "LG Twins", "Doosan Bears",
    "Lotte Giants", "SSG Landers", "NC Dinos", "KT Wiz", "Kiwoom Heroes",
  ];
  assert.equal(names.filter((name) => normalizeTeam(name) !== null).length, 10);
});

test("scores the same game from each team's perspective", () => {
  const home = createDailyMood("한화", "2026-04-12", [game]);
  const away = createDailyMood("삼성", "2026-04-12", [game]);
  assert.equal(home.status, "ready");
  assert.equal(home.games[0].result, "L");
  assert.equal(home.games[0].teamScore, 2);
  assert.equal(home.mood, "매우 안 좋음");
  assert.equal(away.games[0].result, "W");
  assert.equal(away.games[0].teamScore, 4);
  assert.equal(away.mood, "매우 좋음");
});

test("handles a draw and a doubleheader without counting duplicate games", () => {
  const later: DailyGameRecord = {
    ...game, gameId: "102", startsAt: "2026-04-12T21:00:00+09:00", homeScore: 4, awayScore: 4,
  };
  const result = createDailyMood("한화", "2026-04-12", [game, later, game]);
  assert.deepEqual(result.games.map((item) => item.gameId), ["102", "101"]);
  assert.deepEqual(result.games.map((item) => item.result), ["D", "L"]);
});

test("uses a finished update when the same game also has a pending record", () => {
  const result = createDailyMood("한화", "2026-04-12", [{ ...game, status: "pending" }, game]);
  assert.equal(result.status, "ready");
  assert.equal(result.games.length, 1);
  assert.equal(result.games[0].result, "L");
});

test("does not produce a mood when yesterday's game is missing, cancelled, or unfinished", () => {
  assert.equal(createDailyMood("한화", "2026-04-12", []).status, "no_game");
  assert.equal(createDailyMood("한화", "2026-04-12", [{ ...game, status: "cancelled" }]).status, "no_game");
  const pending = createDailyMood("한화", "2026-04-12", [game, { ...game, gameId: "102", status: "pending" }]);
  assert.equal(pending.status, "pending");
  assert.equal(pending.mood, null);
});

test("does not treat an incomplete final score as a loss or draw", () => {
  assert.throws(() => createDailyMood("한화", "2026-04-12", [{ ...game, homeScore: null }]), /점수/);
});

test("does not report no game when the provider sends an unrecognized team name", () => {
  assert.throws(() => createDailyMood("한화", "2026-04-12", [{ ...game, homeTeam: "Unknown Team" }]), /팀/);
});
