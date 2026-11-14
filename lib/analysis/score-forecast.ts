import { PLAYER_RATING_RANGE, SCORE_RANGE, SCORE_WEIGHTS } from "@/lib/config";
import type { GameResult, PlayerGame } from "@/types/forecast";

export type ScoreRules = {
  recentGames: number;
  winPoints: number;
  runDifferencePoints: number;
  streakPoints: number;
  runDifferenceLimit: number;
  streakLimit: number;
  fanWeight: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function scorePlayerGames(games: PlayerGame[]): number | null {
  const ratings = games.map((game) => game.rating).filter((rating) =>
    Number.isFinite(rating) &&
    rating >= PLAYER_RATING_RANGE.min && rating <= PLAYER_RATING_RANGE.max,
  );
  if (ratings.length === 0) return null;
  return ratings.reduce((total, rating) => total + rating, 0) /
    ratings.length / PLAYER_RATING_RANGE.max * SCORE_RANGE.max;
}

export function scoreForecast(
  games: GameResult[],
  fanScore: number | null,
  playerScore: number | null,
  rules: ScoreRules,
): { gameScore: number; teamScore: number; moodScore: number; streak: number } {
  if (games.length === 0) throw new Error("점수를 계산할 종료 경기가 없습니다.");
  if (
    Object.values(rules).some((value) => !Number.isFinite(value)) ||
    rules.fanWeight < 0 || rules.fanWeight > 1 ||
    !Number.isInteger(rules.recentGames) || rules.recentGames < games.length ||
    rules.winPoints < 0 || rules.runDifferencePoints < 0 || rules.streakPoints < 0 ||
    rules.runDifferenceLimit < 0 || rules.streakLimit < 0
  ) {
    throw new Error("분석 점수 설정이 올바르지 않습니다.");
  }
  if (
    (fanScore !== null && (!Number.isFinite(fanScore) || Math.abs(fanScore) > SCORE_RANGE.max)) ||
    (playerScore !== null && (!Number.isFinite(playerScore) || Math.abs(playerScore) > SCORE_RANGE.max))
  ) {
    throw new Error("팬 반응 또는 선수 점수가 올바르지 않습니다.");
  }

  let weightedResults = 0;
  let totalWeight = 0;
  let streak = 0;
  for (const [index, game] of games.entries()) {
    const weight = rules.recentGames - index;
    const result = game.result === "W" ? 1 : game.result === "L" ? -1 : 0;
    weightedResults += result * weight;
    totalWeight += weight;
    if (index === Math.abs(streak) && result !== 0 && (streak === 0 || Math.sign(streak) === result)) {
      streak += result;
    }
  }

  const difference = clamp(
    games[0].teamScore - games[0].oppScore,
    -rules.runDifferenceLimit,
    rules.runDifferenceLimit,
  );
  const gameScore = clamp(
    weightedResults / totalWeight * rules.winPoints +
      difference * rules.runDifferencePoints +
      clamp(streak, -rules.streakLimit, rules.streakLimit) * rules.streakPoints,
    SCORE_RANGE.min,
    SCORE_RANGE.max,
  );
  const teamScore = fanScore === null
    ? gameScore
    : clamp(gameScore * (1 - rules.fanWeight) + fanScore * rules.fanWeight, SCORE_RANGE.min, SCORE_RANGE.max);
  const moodScore = playerScore === null
    ? teamScore
    : teamScore * SCORE_WEIGHTS.team + playerScore * SCORE_WEIGHTS.player;
  return {
    gameScore,
    teamScore,
    moodScore: Math.round(clamp(moodScore, SCORE_RANGE.min, SCORE_RANGE.max)),
    streak,
  };
}
