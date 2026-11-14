import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCsv } from "./csv";
import { parseClassifications } from "./classifications";
import { buildAnalysisSnapshot, createForecastResponse, getTeamSnapshotStatus } from "./forecast-snapshot";
import type { GameRecord } from "./game-results";
import type { FanPost } from "./fan-posts";

const game: GameRecord = {
  gameId: "test-game", date: "2026-10-01", homeTeam: "한화", awayTeam: "삼성",
  homeScore: 2, awayScore: 3, status: "finished",
  startsAt: "2026-10-01T18:30:00+09:00", endsAt: "2026-10-01T21:30:00+09:00",
};
const posts: FanPost[] = Array.from({ length: 10 }, (_, index) => ({
  source: "mlbpark", postId: String(index), gameId: "test-game",
  team: "한화", teamTag: "한화", publishedAt: "2026-10-01T22:00:00+09:00",
  title: `의견 ${index}`, text: `시연 반응 ${index}`, url: "",
}));
const rules = {
  recentGames: 5, windowHours: 12, maxPosts: 50, minimumPosts: 10, maxAgeDays: 7,
  winPoints: 60, runDifferencePoints: 4, streakPoints: 5,
  runDifferenceLimit: 5, streakLimit: 4, fanWeight: 0.2,
};

test("parses quoted multiline CSV and rejects malformed records", () => {
  assert.deepEqual(parseCsv('\uFEFFid,text\r\n1,"불펜, 아쉽다"\r\n2,"첫 줄\n둘째 줄"\r\n'), [
    { id: "1", text: "불펜, 아쉽다" }, { id: "2", text: "첫 줄\n둘째 줄" },
  ]);
  assert.throws(() => parseCsv('id,text\n1,"끝나지 않은 글'), /CSV/);
  assert.throws(() => parseCsv("id,text\n1"), /CSV/);
});

test("holds missing, duplicated, or malformed AI labels instead of guessing", () => {
  const payload: unknown = {
    posts: [
      { source: "mlbpark", postId: "0", relevant: true, sentiment: "negative", topic: "불펜" },
      { source: "mlbpark", postId: "1", relevant: true, sentiment: "negative", topic: "불펜" },
      { source: "mlbpark", postId: "1", relevant: true, sentiment: "positive", topic: "수비" },
      { source: "mlbpark", postId: "2", relevant: "yes", sentiment: "negative", topic: "불펜" },
    ],
  };
  const labels = parseClassifications(payload, posts.slice(0, 4));
  assert.equal(labels[0].sentiment, "negative");
  assert.deepEqual(labels.slice(1).map((label) => label.sentiment), ["uncertain", "uncertain", "uncertain"]);
});

test("builds a team-specific forecast without exposing raw posts or inventing player results", () => {
  const labels = posts.map((post) => ({
    source: post.source, postId: post.postId, relevant: true,
    sentiment: "negative" as const, topic: "불펜" as const,
  }));
  const snapshot = buildAnalysisSnapshot({
    games: [game], posts, classifications: labels, players: [],
    teams: ["한화", "삼성"], asOf: "2026-10-02T08:00:00+09:00", source: "sample",
  }, rules);
  const input = { bossTitle: "과장님", team: "한화", player: "선수", favoriteMenus: ["국밥"] };
  const response = createForecastResponse(input, snapshot);
  assert.ok(response);
  assert.deepEqual(response.input, input);
  assert.equal(response.performance.team, "한화 이글스");
  assert.equal(response.performance.source, "sample");
  assert.equal(response.performance.teamGames[0].result, "L");
  assert.equal(response.performance.playerGames.length, 0);
  assert.equal(response.forecast.fallback, true);
  assert.equal(response.forecast.lunch.menu, "국밥");
  assert.match(response.forecast.reason, /엠팍.*10건/);
  assert.doesNotMatch(JSON.stringify(snapshot), /시연 반응/);
  assert.equal(createForecastResponse({ ...input, team: "두산" }, snapshot), null);
  const storedSnapshot = JSON.parse(JSON.stringify(snapshot));
  assert.doesNotThrow(() => createForecastResponse({ ...input, player: "constructor" }, storedSnapshot));
});

test("marks live data stale seven days after the latest game while retaining sample data", () => {
  const data = {
    games: [game], posts: [], classifications: [], players: [], teams: ["한화"],
    asOf: "2026-10-02T08:00:00+09:00",
  };
  const live = buildAnalysisSnapshot({ ...data, source: "live" }, rules);
  const sample = buildAnalysisSnapshot({ ...data, source: "sample" }, rules);
  assert.equal(getTeamSnapshotStatus(live, "한화", Date.parse("2026-10-08T21:29:59+09:00")), "ready");
  assert.equal(getTeamSnapshotStatus(live, "한화", Date.parse("2026-10-08T21:30:01+09:00")), "stale");
  assert.equal(getTeamSnapshotStatus(sample, "한화", Date.parse("2027-01-01T00:00:00+09:00")), "ready");
  assert.equal(getTeamSnapshotStatus(live, "두산", Date.now()), "missing");
  assert.equal(getTeamSnapshotStatus(live, "한화", Date.parse("2026-10-01T21:31:00+09:00")), "future");
});

test("uses the valid completed game when a pending duplicate precedes it", () => {
  const pending: GameRecord = { ...game, status: "scheduled", homeScore: null, awayScore: null, endsAt: null };
  const labels = posts.map((post) => ({
    source: post.source, postId: post.postId, relevant: true,
    sentiment: "negative" as const, topic: "불펜" as const,
  }));
  const snapshot = buildAnalysisSnapshot({
    games: [pending, game], posts, classifications: labels, players: [],
    teams: ["한화"], asOf: "2026-10-02T08:00:00+09:00", source: "sample",
  }, rules);
  assert.equal(snapshot.teams[0].sentiment.validCount, 10);
  assert.equal(snapshot.teams[0].sentiment.score, -100);
});

test("only uses player records from the team's selected recent games", () => {
  const snapshot = buildAnalysisSnapshot({
    games: [game], posts: [], classifications: [],
    players: [{ team: "한화", player: "선수", date: "2020-01-01", role: "hitter", summary: "3안타", rating: 2 }],
    teams: ["한화"], asOf: "2026-10-02T08:00:00+09:00", source: "sample",
  }, rules);
  const response = createForecastResponse({
    bossTitle: "과장님", team: "한화", player: "선수", favoriteMenus: ["국밥"],
  }, snapshot);
  assert.ok(response);
  assert.equal(response.performance.playerGames.length, 0);
  assert.equal(response.forecast.moodScore, -69);
});

test("exposes the most frequent topic for positive community reactions", () => {
  const labels = posts.map((post) => ({
    source: post.source, postId: post.postId, relevant: true,
    sentiment: "positive" as const, topic: "선발" as const,
  }));
  const snapshot = buildAnalysisSnapshot({
    games: [game], posts, classifications: labels, players: [],
    teams: ["한화"], asOf: "2026-10-02T08:00:00+09:00", source: "sample",
  }, rules);
  const response = createForecastResponse({
    bossTitle: "과장님", team: "한화", player: "선수", favoriteMenus: ["국밥"],
  }, snapshot);
  assert.ok(response?.performance.highlights.some((highlight) => highlight.includes("선발")));
});
