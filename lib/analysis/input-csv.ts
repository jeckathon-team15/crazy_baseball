import { PLAYER_RATING_RANGE } from "@/lib/config";
import { parseCsv } from "./csv";
import type { FanPost, PostClassification, Sentiment, Topic } from "./fan-posts";
import { normalizeTeam, timestamp, type GameRecord } from "./game-results";
import type { PlayerRecord } from "./forecast-snapshot";

function required(row: Record<string, string>, field: string, index: number): string {
  const value = row[field]?.trim();
  if (!value) throw new Error(`CSV ${index + 2}행에 ${field} 값이 필요합니다.`);
  return value;
}

function date(value: string, index: number): string {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) {
    throw new Error(`CSV ${index + 2}행의 날짜가 올바르지 않습니다.`);
  }
  return value;
}

function time(value: string, index: number): string {
  if (timestamp(value) === null) {
    throw new Error(`CSV ${index + 2}행의 시각에는 시간대가 필요합니다.`);
  }
  return value;
}

function team(value: string, index: number): string {
  const normalized = normalizeTeam(value);
  if (!normalized) throw new Error(`CSV ${index + 2}행의 구단을 인식할 수 없습니다: ${value}`);
  return normalized;
}

function score(value: string | undefined, index: number): number | null {
  if (!value?.trim()) return null;
  if (!/^\d+$/.test(value.trim())) throw new Error(`CSV ${index + 2}행의 점수가 올바르지 않습니다.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`CSV ${index + 2}행의 점수가 올바르지 않습니다.`);
  return parsed;
}

export function parseGameRecords(csv: string): GameRecord[] {
  return parseCsv(csv).map((row, index) => {
    const status = required(row, "status", index);
    if (status !== "finished" && status !== "scheduled" && status !== "cancelled") {
      throw new Error(`CSV ${index + 2}행의 경기 상태가 올바르지 않습니다.`);
    }
    const startsAt = time(required(row, "startsAt", index), index);
    const endsAt = row.endsAt?.trim() ? time(row.endsAt.trim(), index) : null;
    const homeScore = score(row.homeScore, index);
    const awayScore = score(row.awayScore, index);
    const homeTeam = team(required(row, "homeTeam", index), index);
    const awayTeam = team(required(row, "awayTeam", index), index);
    const gameDate = date(required(row, "date", index), index);
    const startDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date(startsAt));
    if (gameDate !== startDate) {
      throw new Error(`CSV ${index + 2}행의 경기 날짜와 시작 시각이 일치하지 않습니다.`);
    }
    if (homeTeam === awayTeam ||
        (status === "finished" && (homeScore === null || awayScore === null || endsAt === null)) ||
        (endsAt !== null && Date.parse(endsAt) < Date.parse(startsAt))) {
      throw new Error(`CSV ${index + 2}행의 경기 정보가 올바르지 않습니다.`);
    }
    return {
      gameId: required(row, "gameId", index),
      date: gameDate,
      homeTeam, awayTeam, homeScore, awayScore, status, startsAt, endsAt,
    };
  });
}

export function parseFanPosts(csv: string): FanPost[] {
  return parseCsv(csv).map((row, index) => {
    const title = row.title?.trim() ?? "";
    const text = row.text?.trim() ?? "";
    if (!title && !text) throw new Error(`CSV ${index + 2}행에 제목이나 본문이 필요합니다.`);
    return {
      source: required(row, "source", index),
      postId: required(row, "postId", index),
      gameId: required(row, "gameId", index),
      team: team(required(row, "team", index), index),
      teamTag: team(required(row, "teamTag", index).normalize("NFKC")
        .replace(/^[\s\[\]()【】<>]+|[\s\[\]()【】<>]+$/g, ""), index),
      publishedAt: time(required(row, "publishedAt", index), index),
      title, text, url: row.url?.trim() ?? "",
    };
  });
}

export function parsePlayerRecords(csv: string): PlayerRecord[] {
  return parseCsv(csv).map((row, index) => {
    const role = required(row, "role", index);
    if (role !== "hitter" && role !== "pitcher") throw new Error(`CSV ${index + 2}행의 role이 올바르지 않습니다.`);
    const rawRating = required(row, "rating", index);
    const rating = Number(rawRating);
    if (!Number.isFinite(rating) || rating < PLAYER_RATING_RANGE.min || rating > PLAYER_RATING_RANGE.max) {
      throw new Error(`CSV ${index + 2}행의 rating이 올바르지 않습니다.`);
    }
    return {
      team: team(required(row, "team", index), index),
      player: required(row, "player", index),
      date: date(required(row, "date", index), index),
      role,
      summary: required(row, "summary", index),
      rating,
    };
  });
}

export function parseClassificationRecords(csv: string): PostClassification[] {
  return parseCsv(csv).map((row, index) => {
    const relevant = required(row, "relevant", index);
    const sentiment = required(row, "sentiment", index);
    const topic = required(row, "topic", index);
    if (!["true", "false"].includes(relevant) ||
        !["positive", "neutral", "negative", "uncertain"].includes(sentiment) ||
        !["타격", "선발", "불펜", "수비", "감독 운용", "기타"].includes(topic)) {
      throw new Error(`CSV ${index + 2}행의 감성 분류가 올바르지 않습니다.`);
    }
    return {
      source: required(row, "source", index),
      postId: required(row, "postId", index),
      relevant: relevant === "true",
      sentiment: sentiment as Sentiment,
      topic: topic as Topic,
    };
  });
}
