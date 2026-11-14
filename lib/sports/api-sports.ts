import type { DailyGameRecord } from "@/lib/analysis/daily-mood";

type ApiResponse = { errors?: unknown; response?: unknown };
type ApiLeague = { id?: unknown; name?: unknown };
type ApiGame = {
  id?: unknown;
  date?: unknown;
  status?: { short?: unknown };
  teams?: { home?: { name?: unknown }; away?: { name?: unknown } };
  scores?: { home?: { total?: unknown }; away?: { total?: unknown } };
};

async function requestApi(path: string, params: URLSearchParams, key: string, fetcher: typeof fetch): Promise<unknown[]> {
  const url = new URL(`https://v1.baseball.api-sports.io/${path}`);
  url.search = params.toString();
  const response = await fetcher(url, {
    headers: { "x-apisports-key": key },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("경기 데이터 API 요청에 실패했습니다.");
  const payload = await response.json() as ApiResponse;
  if (!payload || (payload.errors && Object.keys(payload.errors).length > 0) || !Array.isArray(payload.response)) {
    throw new Error("경기 데이터 API에서 결과를 제공하지 않았습니다.");
  }
  return payload.response;
}

export async function fetchKboGames(date: string, key: string, fetcher: typeof fetch = fetch): Promise<DailyGameRecord[]> {
  const leagues = await requestApi("leagues", new URLSearchParams({ search: "KBO" }), key, fetcher) as ApiLeague[];
  const league = leagues.find((item) => typeof item.name === "string" && item.name.trim().toUpperCase() === "KBO");
  if (!league || !Number.isInteger(league.id)) throw new Error("경기 데이터 API에서 KBO 리그를 찾지 못했습니다.");

  const params = new URLSearchParams({ league: String(league.id), season: date.slice(0, 4), date, timezone: "Asia/Seoul" });
  const games = await requestApi("games", params, key, fetcher) as ApiGame[];
  return games.map((game) => {
    const home = game?.teams?.home?.name;
    const away = game?.teams?.away?.name;
    const status = game?.status?.short;
    const homeScore = game?.scores?.home?.total ?? null;
    const awayScore = game?.scores?.away?.total ?? null;
    if ((typeof game?.id !== "number" && typeof game?.id !== "string") ||
        typeof game.date !== "string" || !Number.isFinite(Date.parse(game.date)) ||
        typeof home !== "string" || typeof away !== "string" || typeof status !== "string" ||
        (homeScore !== null && typeof homeScore !== "number") ||
        (awayScore !== null && typeof awayScore !== "number")) {
      throw new Error("경기 데이터 API의 경기 형식을 확인할 수 없습니다.");
    }
    return {
      gameId: String(game.id), date, startsAt: game.date,
      homeTeam: home, awayTeam: away, homeScore, awayScore,
      status: status === "FT" ? "finished" : ["POST", "CANC", "ABD"].includes(status) ? "cancelled" : "pending",
    };
  });
}
