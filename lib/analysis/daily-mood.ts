import { moodFromScore } from "@/lib/config";
import { getTodayInSeoul } from "@/lib/dates";
import type { GameResult, Mood } from "@/types/forecast";
import { normalizeTeam } from "./game-results";
import { scoreForecast } from "./score-forecast";

export type DailyGameRecord = {
  gameId: string;
  date: string;
  startsAt: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  status: "finished" | "pending" | "cancelled";
};

export type DailyMood = {
  team: string;
  date: string;
  status: "ready" | "pending" | "no_game";
  games: Array<GameResult & { gameId: string; startsAt: string }>;
  score: number | null;
  mood: Mood | null;
};

const scoreRules = {
  recentGames: 5,
  winPoints: 60,
  runDifferencePoints: 4,
  streakPoints: 5,
  runDifferenceLimit: 5,
  streakLimit: 4,
  fanWeight: 0.2,
};

export function getYesterdayInSeoul(now: Date): string {
  const today = getTodayInSeoul(now);
  const [year, month, day] = today.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

export function createDailyMood(
  teamName: string, date: string, records: DailyGameRecord[], fanScore: number | null = null,
): DailyMood {
  const team = normalizeTeam(teamName);
  if (!team) throw new Error("응원팀을 확인할 수 없습니다.");

  const matching = records.filter((game) =>
    game.date === date && [normalizeTeam(game.homeTeam), normalizeTeam(game.awayTeam)].includes(team),
  );
  if (matching.length === 0 && records.some((game) =>
    game.date === date && (!normalizeTeam(game.homeTeam) || !normalizeTeam(game.awayTeam)),
  )) {
    throw new Error("경기 데이터의 팀 이름을 확인할 수 없습니다.");
  }
  const empty = { team, date, games: [], score: null, mood: null };
  const unique = new Map<string, DailyGameRecord>();
  for (const game of matching) {
    if (unique.get(game.gameId)?.status !== "finished") unique.set(game.gameId, game);
  }
  const gamesForTeam = [...unique.values()];
  if (gamesForTeam.some((game) => game.status === "pending")) return { ...empty, status: "pending" };

  const completed = gamesForTeam.filter((game) => game.status === "finished").sort((a, b) =>
    Date.parse(b.startsAt) - Date.parse(a.startsAt) || b.gameId.localeCompare(a.gameId),
  );
  if (completed.length === 0) return { ...empty, status: "no_game" };

  const games = completed.map((game) => {
    const home = normalizeTeam(game.homeTeam);
    const away = normalizeTeam(game.awayTeam);
    if (!home || !away || home === away || !Number.isInteger(game.homeScore) ||
        !Number.isInteger(game.awayScore) || game.homeScore! < 0 || game.awayScore! < 0) {
      throw new Error("종료 경기의 팀 또는 점수를 확인할 수 없습니다.");
    }
    const isHome = home === team;
    const teamScore = (isHome ? game.homeScore : game.awayScore)!;
    const oppScore = (isHome ? game.awayScore : game.homeScore)!;
    return {
      gameId: game.gameId, date: game.date, startsAt: game.startsAt,
      opponent: (isHome ? away : home), teamScore, oppScore,
      result: teamScore > oppScore ? "W" as const : teamScore < oppScore ? "L" as const : "D" as const,
    };
  });
  const { moodScore } = scoreForecast(games, fanScore, null, scoreRules);
  return { team, date, status: "ready", games, score: moodScore, mood: moodFromScore(moodScore) };
}
