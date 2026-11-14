import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMoodTrainingRows, trainingRowsCsv } from "./mood-training";
import type { GameRecord } from "./game-results";
import type { FanPost, PostClassification } from "./fan-posts";

const game: GameRecord = {
  gameId: "g1", date: "2026-10-01", homeTeam: "한화", awayTeam: "삼성",
  homeScore: 4, awayScore: 2, status: "finished",
  startsAt: "2026-10-01T18:30:00+09:00", endsAt: "2026-10-01T21:30:00+09:00",
};
const base: FanPost = {
  source: "sample", postId: "1", gameId: "g1", team: "한화", teamTag: "한화",
  publishedAt: "2026-10-01T21:40:00+09:00", title: "불펜", text: "잘했다", url: "",
};
const posts: FanPost[] = [
  base,
  { ...base, postId: "2", publishedAt: "2026-10-01T22:00:00+09:00", text: "아쉽다" },
  { ...base, postId: "3", publishedAt: "2026-10-01T23:01:00+09:00", text: "잘한 다음 경기" },
  { ...base, postId: "4", teamTag: "삼성", text: "상대팀 글" },
];
const classifications: PostClassification[] = [
  { source: "sample", postId: "1", relevant: true, sentiment: "positive", topic: "불펜" },
  { source: "sample", postId: "2", relevant: true, sentiment: "negative", topic: "불펜" },
  { source: "sample", postId: "3", relevant: true, sentiment: "positive", topic: "타격" },
  { source: "sample", postId: "4", relevant: true, sentiment: "positive", topic: "기타" },
];
const feedback = {
  user_id: "anon-1", game_id: "g1", team: "한화", as_of: "2026-10-01T23:00:00+09:00",
  mood_recorded_at: "2026-10-02T09:00:00+09:00", mood: "좋음",
};
const rules = { windowHours: 12, maxPosts: 50, minimumPosts: 2 };
const now = Date.parse("2026-11-14T00:00:00Z");

test("joins game results and post labels using only the information available at prediction time", () => {
  const result = buildMoodTrainingRows({ games: [game], posts, classifications, feedback: [feedback], rules, now });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].team_score, 4);
  assert.equal(result.rows[0].opponent_score, 2);
  assert.equal(result.rows[0].positive, 1);
  assert.equal(result.rows[0].negative, 1);
  assert.equal(result.rows[0].neutral, 0);
  assert.equal(result.rows[0].mood, "좋음");
  assert.doesNotMatch(trainingRowsCsv(result.rows), /불펜|아쉽다/);
});

test("skips examples without enough valid fan reactions and reports the count", () => {
  const result = buildMoodTrainingRows({
    games: [game], posts, classifications, feedback: [feedback], rules: { ...rules, minimumPosts: 3 }, now,
  });
  assert.equal(result.rows.length, 0);
  assert.equal(result.skippedInsufficientPosts, 1);
});

test("rejects duplicate feedback and mood labels recorded before prediction", () => {
  assert.throws(() => buildMoodTrainingRows({
    games: [game], posts, classifications, feedback: [feedback, { ...feedback, team: "한화 이글스" }], rules, now,
  }), /중복/);
  assert.throws(() => buildMoodTrainingRows({
    games: [game], posts, classifications,
    feedback: [{ ...feedback, mood_recorded_at: "2026-10-01T22:00:00+09:00" }], rules, now,
  }), /시각/);
});

test("does not assign a game or mood to a different team and requires a next-day label", () => {
  assert.throws(() => buildMoodTrainingRows({
    games: [game], posts, classifications, feedback: [{ ...feedback, team: "LG" }], rules, now,
  }), /경기/);
  assert.throws(() => buildMoodTrainingRows({
    games: [game], posts, classifications,
    feedback: [{ ...feedback, mood_recorded_at: "2026-10-03T09:00:00+09:00" }], rules, now,
  }), /다음 날/);
});

test("reads scores from the selected team's point of view", () => {
  const awayPosts = posts.slice(0, 2).map((post) => ({ ...post, team: "삼성", teamTag: "삼성" }));
  const result = buildMoodTrainingRows({
    games: [game], posts: awayPosts, classifications,
    feedback: [{ ...feedback, team: "삼성", mood: "안 좋음" }], rules, now,
  });
  assert.equal(result.rows[0].team_score, 2);
  assert.equal(result.rows[0].opponent_score, 4);
});

test("excludes posts at and after the next game starts", () => {
  const next: GameRecord = {
    ...game, gameId: "g2", status: "scheduled", homeScore: null, awayScore: null,
    startsAt: "2026-10-01T22:00:00+09:00", endsAt: null,
  };
  const result = buildMoodTrainingRows({
    games: [game, next], posts, classifications, feedback: [feedback],
    rules: { ...rules, minimumPosts: 1 }, now,
  });
  assert.equal(result.rows[0].positive, 1);
  assert.equal(result.rows[0].negative, 0);
});

test("rejects conflicting completed records for the same game ID", () => {
  assert.throws(() => buildMoodTrainingRows({
    games: [game, { ...game, homeScore: 9 }], posts, classifications, feedback: [feedback], rules, now,
  }), /서로 다른/);
});
