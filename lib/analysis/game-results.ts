import type { GameResult } from "@/types/forecast";

export type GameRecord = {
  gameId: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  status: "finished" | "scheduled" | "cancelled";
  startsAt: string;
  endsAt: string | null;
};

export type TeamGame = GameResult & {
  gameId: string;
  startsAt: string;
  endsAt: string;
};

const teamNames: ReadonlyArray<{ name: string; aliases: string[] }> = [
  { name: "한화 이글스", aliases: ["한화", "이글스", "한화이글스", "hanwha", "hanwhaeagles"] },
  { name: "삼성 라이온즈", aliases: ["삼성", "라이온즈", "삼성라이온즈", "samsung", "samsunglions"] },
  { name: "KIA 타이거즈", aliases: ["kia", "기아", "타이거즈", "기아타이거즈", "kiatigers"] },
  { name: "LG 트윈스", aliases: ["lg", "엘지", "트윈스", "엘지트윈스", "lgtwins"] },
  { name: "두산 베어스", aliases: ["두산", "베어스", "두산베어스", "doosan", "doosanbears"] },
  { name: "롯데 자이언츠", aliases: ["롯데", "자이언츠", "롯데자이언츠", "lotte", "lottegiants"] },
  { name: "SSG 랜더스", aliases: ["ssg", "쓱", "랜더스", "ssg랜더스", "ssglanders"] },
  { name: "NC 다이노스", aliases: ["nc", "엔씨", "다이노스", "nc다이노스", "ncdinos"] },
  { name: "KT 위즈", aliases: ["kt", "케이티", "위즈", "kt위즈", "ktwiz"] },
  { name: "키움 히어로즈", aliases: ["키움", "히어로즈", "키움히어로즈", "kiwoom", "kiwoomheroes"] },
];

export function normalizeTeam(value: string): string | null {
  const key = value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
  return teamNames.find(({ name, aliases }) =>
    name.replace(/\s+/g, "").toLowerCase() === key || aliases.includes(key),
  )?.name ?? null;
}

export function getTeamAliases(value: string): string[] {
  const name = normalizeTeam(value);
  const team = teamNames.find((item) => item.name === name);
  return team ? [...new Set([...team.name.toLowerCase().split(/\s+/), ...team.aliases])] : [];
}

export function timestamp(value: string): number | null {
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i);
  if (!parts) return null;
  const [, year, month, day, hour, minute, second = "0"] = parts;
  const calendar = new Date(0);
  calendar.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
  calendar.setUTCHours(Number(hour), Number(minute), Number(second), 0);
  if (
    calendar.getUTCFullYear() !== Number(year) || calendar.getUTCMonth() + 1 !== Number(month) ||
    calendar.getUTCDate() !== Number(day) || calendar.getUTCHours() !== Number(hour) ||
    calendar.getUTCMinutes() !== Number(minute) || calendar.getUTCSeconds() !== Number(second)
  ) return null;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

export function getRecentTeamGames(
  games: GameRecord[],
  team: string,
  asOf: string,
  limit: number,
): TeamGame[] {
  const normalizedTeam = normalizeTeam(team);
  const cutoff = timestamp(asOf);
  if (!normalizedTeam || cutoff === null || !Number.isInteger(limit) || limit < 1) {
    return [];
  }

  const seen = new Set<string>();
  const result: TeamGame[] = [];
  for (const game of games) {
    const home = normalizeTeam(game.homeTeam);
    const away = normalizeTeam(game.awayTeam);
    const start = timestamp(game.startsAt);
    const end = game.endsAt ? timestamp(game.endsAt) : null;
    if (
      game.status !== "finished" || !game.gameId || seen.has(game.gameId) ||
      !home || !away || home === away || ![home, away].includes(normalizedTeam) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(game.date) || start === null || end === null ||
      end < start || end > cutoff || !Number.isInteger(game.homeScore) ||
      !Number.isInteger(game.awayScore) || game.homeScore! < 0 || game.awayScore! < 0
    ) {
      continue;
    }

    seen.add(game.gameId);
    const isHome = normalizedTeam === home;
    const teamScore = (isHome ? game.homeScore : game.awayScore)!;
    const oppScore = (isHome ? game.awayScore : game.homeScore)!;
    result.push({
      gameId: game.gameId,
      date: game.date,
      opponent: isHome ? away : home,
      teamScore,
      oppScore,
      result: teamScore > oppScore ? "W" : teamScore < oppScore ? "L" : "D",
      startsAt: game.startsAt,
      endsAt: game.endsAt!,
    });
  }

  return result
    .sort((a, b) => Date.parse(b.endsAt) - Date.parse(a.endsAt) || b.gameId.localeCompare(a.gameId))
    .slice(0, limit);
}
