import assert from "node:assert/strict";
import { test } from "node:test";
import { predictMood } from "./mood-model";
import type { GameResult } from "@/types/forecast";
import type { SentimentSummary } from "./fan-posts";

const game: GameResult = {
  date: "2026-11-13", opponent: "삼성 라이온즈", teamScore: 4, oppScore: 1, result: "W",
};
const sentiment: SentimentSummary = {
  validCount: 10, positive: 7, neutral: 2, negative: 1, uncertain: 0,
  score: 60, topTopic: "타격", negativeTopTopic: "수비",
};
const model = {
  schemaVersion: 1,
  algorithm: "softmax_logistic_regression",
  source: "sample",
  trainedAt: "2026-11-14T00:00:00Z",
  trainedThrough: "2026-10-31",
  features: ["game_result", "run_difference", "positive_ratio", "negative_ratio"],
  classes: ["비", "맑음"],
  means: [0, 0, 0, 0],
  scales: [1, 1, 1, 1],
  coefficients: [[0, 0, 0, 0], [2, 0, 0, 0]],
  intercepts: [0, 0],
};

test("converts legacy model classes to mood labels without changing probabilities", () => {
  const result = predictMood(model, game, sentiment, "sample", Date.parse("2026-11-14T12:00:00Z"));
  assert.ok(result);
  assert.equal(result.mood, "매우 좋음");
  assert.deepEqual(result.probabilities.map((item) => item.mood), ["안 좋음", "매우 좋음"]);
  assert.ok(Math.abs(result.confidence - 0.8807970779) < 0.000001);
  assert.equal(result.moodScore, 80);
  assert.ok(Math.abs(result.probabilities.reduce((sum, item) => sum + item.probability, 0) - 1) < 0.000001);
});

test("accepts new model classes and rejects aliases that describe the same class", () => {
  const now = Date.parse("2026-11-14T12:00:00Z");
  const current = predictMood({ ...model, classes: ["안 좋음", "매우 좋음"] }, game, sentiment, "sample", now);
  assert.equal(current?.mood, "매우 좋음");
  assert.equal(predictMood({ ...model, classes: ["비", "안 좋음"] }, game, sentiment, "sample", now), null);
});

test("live predictions require all five distinct mood classes", () => {
  const now = Date.parse("2026-11-14T12:00:00Z");
  assert.equal(predictMood({ ...model, source: "live" }, game, sentiment, "live", now), null);
  const classes = ["매우 안 좋음", "안 좋음", "보통", "좋음", "매우 좋음"];
  const complete = { ...model, source: "live", classes,
    coefficients: classes.map(() => [0, 0, 0, 0]), intercepts: [0, 0, 0, 0, 1] };
  const result = predictMood(complete, game, sentiment, "live", now);
  assert.equal(result?.mood, "매우 좋음");
  assert.deepEqual(result?.probabilities.map((item) => item.mood), classes);
});

test("maps every legacy class to its matching mood and score", () => {
  const now = Date.parse("2026-11-14T12:00:00Z");
  const labels = ["매우 안 좋음", "안 좋음", "보통", "좋음", "매우 좋음"];
  const scores = [-80, -40, 0, 40, 80];
  const allClasses = {
    ...model,
    classes: ["천둥번개", "비", "흐림", "구름 조금", "맑음"],
    coefficients: Array.from({ length: 5 }, () => [0, 0, 0, 0]),
  };
  for (let index = 0; index < labels.length; index++) {
    const intercepts = labels.map((_, i) => i === index ? 1 : 0);
    const result = predictMood({ ...allClasses, intercepts }, game, sentiment, "sample", now);
    assert.equal(result?.mood, labels[index]);
    assert.equal(result?.moodScore, scores[index]);
    assert.deepEqual(result?.probabilities.map((item) => item.mood), labels);
  }
});

test("does not apply models to different sources, unseen data, or invalid parameters", () => {
  const now = Date.parse("2026-11-14T12:00:00Z");
  assert.equal(predictMood(model, game, sentiment, "live", now), null);
  assert.equal(predictMood({ ...model, trainedThrough: game.date }, game, sentiment, "sample", now), null);
  assert.equal(predictMood({ ...model, trainedAt: "2027-01-01T00:00:00Z" }, game, sentiment, "sample", now), null);
  assert.equal(predictMood({ ...model, trainedThrough: "2026-02-30" }, game, sentiment, "sample", now), null);
  assert.equal(predictMood({ ...model, scales: [1, 1, 0, 1] }, game, sentiment, "sample", now), null);
  assert.equal(predictMood(model, game, { ...sentiment, validCount: 0, score: null }, "sample", now), null);
  assert.equal(predictMood({ ...model, coefficients: [[0], [1]] }, game, sentiment, "sample", now), null);
});
