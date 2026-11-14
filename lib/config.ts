import type { Mood } from "@/types/forecast";

// 숫자 기준은 모두 이 파일에 모읍니다. (총괄 관리)

/** moodScore 하한선 → 기분. 위에서부터 순서대로 검사합니다. */
export const MOOD_THRESHOLDS: ReadonlyArray<{ min: number; mood: Mood }> = [
  { min: 60, mood: "매우 좋음" },
  { min: 20, mood: "좋음" },
  { min: -20, mood: "보통" },
  { min: -60, mood: "안 좋음" },
  { min: -Infinity, mood: "매우 안 좋음" },
];

/** moodScore(-100~100)를 기분 단계로 변환 */
export function moodFromScore(score: number): Mood {
  return MOOD_THRESHOLDS.find((t) => score >= t.min)!.mood;
}

/** moodScore = teamScore * team + playerScore * player */
export const SCORE_WEIGHTS = {
  team: 0.6,
  player: 0.4,
} as const;

export const SCORE_RANGE = { min: -100, max: 100 } as const;
export const PLAYER_RATING_RANGE = { min: -2, max: 2 } as const;
export const MAX_RECENT_GAMES = 10;
export const FAVORITE_MENUS_RANGE = { min: 1, max: 5 } as const;

export const AI_TIMEOUT_MS = 10000;

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-sonnet-5-5";
