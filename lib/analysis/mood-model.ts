import { MOOD_THRESHOLDS, SCORE_RANGE } from "@/lib/config";
import type { GameResult, Mood } from "@/types/forecast";
import type { SentimentSummary } from "./fan-posts";
import { timestamp } from "./game-results";

export const MOOD_FEATURES = [
  "game_result", "run_difference", "positive_ratio", "negative_ratio",
] as const;

type MoodModel = {
  schemaVersion: 1;
  algorithm: "softmax_logistic_regression";
  source: "sample" | "live";
  trainedAt: string;
  trainedThrough: string;
  features: string[];
  classes: string[];
  means: number[];
  scales: number[];
  coefficients: number[][];
  intercepts: number[];
};

export type MoodPrediction = {
  method: "machine_learning";
  mood: Mood;
  moodScore: number;
  confidence: number;
  probabilities: Array<{ mood: Mood; probability: number }>;
  trainedThrough: string;
};

function numericVector(value: unknown, length: number): value is number[] {
  return Array.isArray(value) && value.length === length &&
    value.every((item) => typeof item === "number" && Number.isFinite(item));
}

function normalizeModelMood(value: unknown): Mood | null {
  if (typeof value !== "string") return null;
  const legacy: Record<string, Mood> = {
    "천둥번개": "매우 안 좋음",
    "비": "안 좋음",
    "흐림": "보통",
    "구름 조금": "좋음",
    "맑음": "매우 좋음",
  };
  const name = value.trim();
  if (Object.hasOwn(legacy, name)) return legacy[name];
  return MOOD_THRESHOLDS.find((threshold) => threshold.mood === name)?.mood ?? null;
}

function isMoodModel(value: unknown): value is MoodModel {
  if (!value || typeof value !== "object") return false;
  const model = value as Record<string, unknown>;
  const normalizedClasses = Array.isArray(model.classes) ? model.classes.map(normalizeModelMood) : [];
  if (
    model.schemaVersion !== 1 || model.algorithm !== "softmax_logistic_regression" ||
    (model.source !== "sample" && model.source !== "live") ||
    typeof model.trainedAt !== "string" || timestamp(model.trainedAt) === null ||
    typeof model.trainedThrough !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(model.trainedThrough) ||
    timestamp(`${model.trainedThrough}T00:00:00Z`) === null ||
    !Array.isArray(model.features) || model.features.length !== MOOD_FEATURES.length ||
    model.features.some((name, index) => name !== MOOD_FEATURES[index]) ||
    !Array.isArray(model.classes) || model.classes.length < 2 ||
    (model.source === "live" && normalizedClasses.length !== MOOD_THRESHOLDS.length) ||
    normalizedClasses.some((name) => name === null) ||
    new Set(normalizedClasses).size !== model.classes.length ||
    !numericVector(model.means, MOOD_FEATURES.length) ||
    !numericVector(model.scales, MOOD_FEATURES.length) || model.scales.some((scale) => scale <= 0) ||
    !numericVector(model.intercepts, model.classes.length) ||
    !Array.isArray(model.coefficients) || model.coefficients.length !== model.classes.length ||
    model.coefficients.some((row) => !numericVector(row, MOOD_FEATURES.length))
  ) return false;
  return true;
}

function scoreForMood(mood: Mood): number {
  const index = MOOD_THRESHOLDS.findIndex((threshold) => threshold.mood === mood);
  const minimum = Math.max(SCORE_RANGE.min, MOOD_THRESHOLDS[index].min);
  const maximum = index === 0 ? SCORE_RANGE.max : MOOD_THRESHOLDS[index - 1].min;
  return Math.round((minimum + maximum) / 2);
}

export function predictMood(
  candidate: unknown,
  game: GameResult,
  sentiment: SentimentSummary,
  source: "sample" | "live",
  now: number,
): MoodPrediction | null {
  if (!isMoodModel(candidate) || candidate.source !== source ||
      candidate.trainedThrough >= game.date || Date.parse(candidate.trainedAt) > now ||
      !Number.isFinite(now) || sentiment.score === null ||
      !Number.isInteger(sentiment.validCount) || sentiment.validCount < 1 ||
      ![sentiment.positive, sentiment.neutral, sentiment.negative]
        .every((count) => Number.isInteger(count) && count >= 0) ||
      sentiment.positive + sentiment.neutral + sentiment.negative !== sentiment.validCount ||
      !Number.isInteger(game.teamScore) || game.teamScore < 0 ||
      !Number.isInteger(game.oppScore) || game.oppScore < 0) {
    return null;
  }

  const difference = game.teamScore - game.oppScore;
  const expectedResult = difference > 0 ? "W" : difference < 0 ? "L" : "D";
  if (game.result !== expectedResult) return null;
  const raw = [
    Math.sign(difference),
    difference,
    sentiment.positive / sentiment.validCount,
    sentiment.negative / sentiment.validCount,
  ];
  const features = raw.map((value, index) => (value - candidate.means[index]) / candidate.scales[index]);
  const logits = candidate.coefficients.map((row, index) =>
    row.reduce((sum, weight, feature) => sum + weight * features[feature], candidate.intercepts[index]),
  );
  if (logits.some((value) => !Number.isFinite(value))) return null;
  const maximum = Math.max(...logits);
  const weights = logits.map((logit) => Math.exp(logit - maximum));
  const total = weights.reduce((sum, value) => sum + value, 0);
  const probabilities = candidate.classes.map((mood, index) => ({
    mood: normalizeModelMood(mood)!, probability: weights[index] / total,
  }));
  const prediction = probabilities.reduce((best, item) => item.probability > best.probability ? item : best);
  return {
    method: "machine_learning",
    mood: prediction.mood,
    moodScore: scoreForMood(prediction.mood),
    confidence: prediction.probability,
    probabilities,
    trainedThrough: candidate.trainedThrough,
  };
}
