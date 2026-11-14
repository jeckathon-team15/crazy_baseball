import type { DailyGameRecord } from "@/lib/analysis/daily-mood";

type KboGame = {
  G_ID?: unknown;
  G_DT?: unknown;
  G_TM?: unknown;
  HOME_NM?: unknown;
  AWAY_NM?: unknown;
  B_SCORE_CN?: unknown;
  T_SCORE_CN?: unknown;
  GAME_STATE_SC?: unknown;
  CANCEL_SC_NM?: unknown;
};

type KboResponse = { code?: unknown; game?: unknown };

function parseResponse(text: string): KboResponse {
  try {
    return JSON.parse(text) as KboResponse;
  } catch {
    // KBO can append an HTML error page after an otherwise complete JSON response.
    for (const match of text.matchAll(/<!doctype\b|<html\b/gi)) {
      try {
        return JSON.parse(text.slice(0, match.index)) as KboResponse;
      } catch {
        // The marker may be inside a JSON string, so try the next one.
      }
    }
    throw new Error("KBO 경기 결과 응답을 확인할 수 없습니다.");
  }
}

function parseScore(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return null;
    if (/^\d+$/.test(text)) value = Number(text);
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("KBO 경기 점수 형식을 확인할 수 없습니다.");
  }
  return value;
}

export async function fetchKboWebsiteGames(date: string, fetcher: typeof fetch = fetch): Promise<DailyGameRecord[]> {
  const parsedDate = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== date) {
    throw new Error("KBO 경기 날짜가 올바르지 않습니다.");
  }
  const compactDate = date.replaceAll("-", "");
  const response = await fetcher("https://www.koreabaseball.com/ws/Main.asmx/GetKboGameList", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: "https://www.koreabaseball.com/Schedule/GameCenter/Main.aspx",
    },
    body: new URLSearchParams({ leId: "1", srId: "0,1,3,4,5,6,7", date: compactDate }).toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`KBO 경기 결과 요청에 실패했습니다. (HTTP ${response.status})`);
  const payload = parseResponse(await response.text());
  if (!payload || (payload.code !== undefined && String(payload.code) !== "100") || !Array.isArray(payload.game)) {
    throw new Error("KBO 경기 결과 응답을 확인할 수 없습니다.");
  }

  return (payload.game as KboGame[]).map((game) => {
    const time = typeof game?.G_TM === "string" ? game.G_TM.trim() : "";
    const startsAt = `${date}T${time}:00+09:00`;
    if (typeof game?.G_ID !== "string" || !game.G_ID.trim() || String(game.G_DT) !== compactDate ||
        !/^\d{2}:\d{2}$/.test(time) || !Number.isFinite(Date.parse(startsAt)) ||
        typeof game.HOME_NM !== "string" || !game.HOME_NM.trim() ||
        typeof game.AWAY_NM !== "string" || !game.AWAY_NM.trim() || game.GAME_STATE_SC == null) {
      throw new Error("KBO 경기 결과의 형식을 확인할 수 없습니다.");
    }
    const homeScore = parseScore(game.B_SCORE_CN);
    const awayScore = parseScore(game.T_SCORE_CN);
    const cancelled = String(game.GAME_STATE_SC) === "4" || /취소|연기/.test(String(game.CANCEL_SC_NM ?? ""));
    const status = cancelled ? "cancelled" : String(game.GAME_STATE_SC) === "3" ? "finished" : "pending";
    if (status === "finished" && (homeScore === null || awayScore === null)) {
      throw new Error("KBO 종료 경기의 점수를 확인할 수 없습니다.");
    }
    return {
      gameId: game.G_ID.trim(), date, startsAt,
      homeTeam: game.HOME_NM.trim(), awayTeam: game.AWAY_NM.trim(),
      homeScore, awayScore, status,
    };
  });
}
