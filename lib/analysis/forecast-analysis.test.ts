import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getRecentTeamGames,
  type GameRecord,
} from "./game-results";
import {
  selectGamePosts,
  summarizeSentiment,
  type FanPost,
  type PostClassification,
} from "./fan-posts";
import { scoreForecast } from "./score-forecast";

const games: GameRecord[] = [
  { gameId: "g5", date: "2026-10-05", homeTeam: "한화 이글스", awayTeam: "삼성 라이온즈", homeScore: 1, awayScore: 3, status: "finished", startsAt: "2026-10-05T18:30:00+09:00", endsAt: "2026-10-05T21:30:00+09:00" },
  { gameId: "g4", date: "2026-10-04", homeTeam: "한화", awayTeam: "삼성", homeScore: 2, awayScore: 4, status: "finished", startsAt: "2026-10-04T18:30:00+09:00", endsAt: "2026-10-04T21:30:00+09:00" },
  { gameId: "g3", date: "2026-10-03", homeTeam: "삼성", awayTeam: "한화", homeScore: 3, awayScore: 1, status: "finished", startsAt: "2026-10-03T18:30:00+09:00", endsAt: "2026-10-03T21:30:00+09:00" },
  { gameId: "g2", date: "2026-10-02", homeTeam: "한화", awayTeam: "삼성", homeScore: 4, awayScore: 1, status: "finished", startsAt: "2026-10-02T18:30:00+09:00", endsAt: "2026-10-02T21:30:00+09:00" },
  { gameId: "g1", date: "2026-10-01", homeTeam: "한화", awayTeam: "삼성", homeScore: 2, awayScore: 0, status: "finished", startsAt: "2026-10-01T18:30:00+09:00", endsAt: "2026-10-01T21:30:00+09:00" },
];
const nextGame: GameRecord = {
  gameId: "next", date: "2026-10-06", homeTeam: "한화", awayTeam: "LG",
  homeScore: null, awayScore: null, status: "scheduled",
  startsAt: "2026-10-06T00:30:00+09:00", endsAt: null,
};
const basePost: FanPost = {
  source: "mlbpark", postId: "1", team: "한화", teamTag: "한화", gameId: "g5",
  publishedAt: "2026-10-05T21:45:00+09:00", title: "오늘 경기", text: "불펜이 아쉽다",
  url: "https://mlbpark.donga.com/mp/b.php?b=kbotown&id=1",
};

test("selects completed games for the requested team in descending order", () => {
  const result = getRecentTeamGames(
    [games[3], games[0], games[1], games[2], games[4], games[0], nextGame],
    "한화",
    "2026-10-06T08:00:00+09:00",
    5,
  );
  assert.deepEqual(result.map((game) => game.gameId), ["g5", "g4", "g3", "g2", "g1"]);
  assert.deepEqual(result.map((game) => game.result), ["L", "L", "L", "W", "W"]);
  assert.equal(result[2].opponent, "삼성 라이온즈");
});

test("selects posts for the correct game, team, and time without duplicates", () => {
  const posts: FanPost[] = [
    basePost,
    { ...basePost, postId: "2", publishedAt: "2026-10-06T00:29:00+09:00", text: "막판 수비가 아쉽다" },
    { ...basePost, postId: "3", publishedAt: "2026-10-06T00:30:00+09:00", text: "다음 경기 시작" },
    { ...basePost, postId: "4", team: "삼성", teamTag: "삼성", text: "상대팀 반응" },
    { ...basePost, postId: "5", gameId: "g4", text: "다른 경기" },
    { ...basePost, postId: "6", publishedAt: "2026-10-05T21:29:00+09:00", text: "경기 전" },
    { ...basePost },
    { ...basePost, postId: "7" },
  ];
  const selected = selectGamePosts(posts, games[0], [...games, nextGame], "한화", "2026-10-06T08:00:00+09:00", {
    windowHours: 12,
    maxPosts: 50,
  });
  assert.deepEqual(selected.map((post) => post.postId), ["1", "2"]);
});

test("samples posts across time windows so a burst cannot hide later reactions", () => {
  const early = Array.from({ length: 20 }, (_, index) => ({
    ...basePost, postId: `early-${index}`, text: `early text ${index}`,
  }));
  const late = Array.from({ length: 4 }, (_, index) => ({
    ...basePost, postId: `late-${index}`, text: `late text ${index}`,
    publishedAt: "2026-10-06T06:45:00+09:00",
  }));
  const selected = selectGamePosts([...early, ...late], games[0], games, "한화", "2026-10-06T08:00:00+09:00", {
    windowHours: 12, maxPosts: 10,
  });
  assert.equal(selected.length, 10);
  assert.equal(selected.filter((post) => post.postId.startsWith("late-")).length, 4);
});

test("ignores unrelated or uncertain classifications and requires enough posts", () => {
  const posts = Array.from({ length: 11 }, (_, i) => ({
    ...basePost, postId: String(i + 1), text: `반응 ${i + 1}`,
  }));
  const labels: PostClassification[] = posts.map((post, i) => ({
    source: post.source,
    postId: post.postId,
    relevant: i !== 10,
    sentiment: i < 2 ? "positive" : i < 4 ? "neutral" : "negative",
    topic: "불펜",
  }));
  const summary = summarizeSentiment(posts, labels, 10);
  assert.equal(summary.score, -40);
  assert.equal(summary.validCount, 10);
  assert.equal(summary.negative, 6);
  assert.equal(summary.topTopic, "불펜");
  assert.equal(summarizeSentiment(posts, labels, 11).score, null);
});

test("combines game, fan, and player scores while preserving the existing team weights", () => {
  const recentGames = getRecentTeamGames(games, "한화", "2026-10-06T08:00:00+09:00", 5);
  const result = scoreForecast(recentGames, -70, -60, {
    recentGames: 5,
    winPoints: 60,
    runDifferencePoints: 4,
    streakPoints: 5,
    runDifferenceLimit: 5,
    streakLimit: 4,
    fanWeight: 0.2,
  });
  assert.equal(result.gameScore, -59);
  assert.equal(result.teamScore, -61.2);
  assert.equal(result.moodScore, -61);
  assert.equal(result.streak, -3);

  const missingFanAndPlayer = scoreForecast(recentGames, null, null, {
    recentGames: 5,
    winPoints: 60,
    runDifferencePoints: 4,
    streakPoints: 5,
    runDifferenceLimit: 5,
    streakLimit: 4,
    fanWeight: 0.2,
  });
  assert.equal(missingFanAndPlayer.teamScore, -59);
  assert.equal(missingFanAndPlayer.moodScore, -59);
});

test("uses the same recency weights when fewer than five games are available", () => {
  const partial = getRecentTeamGames([games[1], games[0]], "삼성", "2026-10-06T08:00:00+09:00", 5);
  partial[1] = { ...partial[1], teamScore: 1, oppScore: 4, result: "L" };
  const result = scoreForecast(partial, null, null, {
    recentGames: 5, winPoints: 60, runDifferencePoints: 4, streakPoints: 5,
    runDifferenceLimit: 5, streakLimit: 4, fanWeight: 0.2,
  });
  assert.ok(Math.abs(result.gameScore - (60 / 9 + 8 + 5)) < 0.00001);
});
