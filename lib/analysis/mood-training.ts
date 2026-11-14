import { MOOD_THRESHOLDS } from "@/lib/config";
import { findTeamGameRecord } from "./forecast-snapshot";
import { selectGamePosts, summarizeSentiment, type FanPost, type PostClassification } from "./fan-posts";
import { getRecentTeamGames, normalizeTeam, timestamp, type GameRecord } from "./game-results";

export type MoodTrainingRow = {
  user_id: string;
  game_id: string;
  team: string;
  game_date: string;
  game_ended_at: string;
  as_of: string;
  mood_recorded_at: string;
  team_score: number;
  opponent_score: number;
  positive: number;
  neutral: number;
  negative: number;
  mood: string;
};

const columns: Array<keyof MoodTrainingRow> = [
  "user_id", "game_id", "team", "game_date", "game_ended_at", "as_of",
  "mood_recorded_at", "team_score", "opponent_score", "positive", "neutral", "negative", "mood",
];
const moods = new Set([...MOOD_THRESHOLDS.map((item) => item.mood as string),
  "천둥번개", "비", "흐림", "구름 조금", "맑음"]);
const seoulDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
});

function required(row: Record<string, string>, name: string, line: number): string {
  const value = row[name]?.trim();
  if (!value) throw new Error(`기분 기록 CSV ${line}행에 ${name} 값이 필요합니다.`);
  return value;
}

export function buildMoodTrainingRows(input: {
  games: GameRecord[];
  posts: FanPost[];
  classifications: PostClassification[];
  feedback: Array<Record<string, string>>;
  rules: { windowHours: number; maxPosts: number; minimumPosts: number };
  now?: number;
}): { rows: MoodTrainingRow[]; skippedInsufficientPosts: number } {
  const { games, posts, classifications, feedback, rules } = input;
  const now = input.now ?? Date.now();
  if (!Number.isFinite(now) || !Number.isFinite(rules.windowHours) || rules.windowHours <= 0 ||
      !Number.isInteger(rules.maxPosts) || rules.maxPosts < 1 ||
      !Number.isInteger(rules.minimumPosts) || rules.minimumPosts < 1 ||
      rules.minimumPosts > rules.maxPosts) throw new Error("게시글 집계 설정을 확인해 주세요.");
  const rows: MoodTrainingRow[] = [];
  const seen = new Set<string>();
  let skippedInsufficientPosts = 0;

  for (const [index, entry] of feedback.entries()) {
    const line = index + 2;
    const user = required(entry, "user_id", line);
    const gameId = required(entry, "game_id", line);
    const team = normalizeTeam(required(entry, "team", line));
    const asOf = required(entry, "as_of", line);
    const recordedAt = required(entry, "mood_recorded_at", line);
    const mood = required(entry, "mood", line);
    const asOfTime = timestamp(asOf);
    const recordedTime = timestamp(recordedAt);
    if (!team) throw new Error(`기분 기록 CSV ${line}행의 팀이 올바르지 않습니다.`);
    if (!moods.has(mood)) throw new Error(`기분 기록 CSV ${line}행의 기분 단계가 올바르지 않습니다.`);
    if (asOfTime === null || recordedTime === null || asOfTime >= recordedTime || recordedTime > now) {
      throw new Error(`기분 기록 CSV ${line}행의 예측·기분 기록 시각을 확인해 주세요.`);
    }
    const key = JSON.stringify([user, gameId, team]);
    if (seen.has(key)) throw new Error(`기분 기록 CSV ${line}행에 중복 기록이 있습니다.`);
    seen.add(key);

    const candidates = games.filter((game) => game.gameId === gameId).flatMap((game) =>
      getRecentTeamGames([game], team, asOf, 1),
    );
    const target = candidates[0];
    if (!target) throw new Error(`기분 기록 CSV ${line}행의 종료된 경기와 팀을 확인해 주세요.`);
    if (candidates.some((item) => item.date !== target.date || item.teamScore !== target.teamScore ||
      item.oppScore !== target.oppScore || item.opponent !== target.opponent ||
      item.startsAt !== target.startsAt || item.endsAt !== target.endsAt)) {
      throw new Error(`기분 기록 CSV ${line}행의 경기 ID에 서로 다른 경기 결과가 있습니다.`);
    }
    const game = findTeamGameRecord(games, team, asOf, target);
    if (!game) throw new Error(`기분 기록 CSV ${line}행의 경기 정보를 확인해 주세요.`);
    const nextDay = new Date(Date.parse(`${target.date}T00:00:00Z`) + 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);
    if (seoulDate.format(new Date(recordedTime)) !== nextDay) {
      throw new Error(`기분 기록 CSV ${line}행은 경기 다음 날의 기분이어야 합니다.`);
    }

    const selected = selectGamePosts(posts, game, games, team, asOf, rules);
    const sentiment = summarizeSentiment(selected, classifications, rules.minimumPosts);
    if (sentiment.score === null) {
      skippedInsufficientPosts++;
      continue;
    }
    rows.push({
      user_id: user, game_id: gameId, team, game_date: target.date,
      game_ended_at: target.endsAt, as_of: asOf, mood_recorded_at: recordedAt,
      team_score: target.teamScore, opponent_score: target.oppScore,
      positive: sentiment.positive, neutral: sentiment.neutral, negative: sentiment.negative, mood,
    });
  }
  return { rows, skippedInsufficientPosts };
}

export function trainingRowsCsv(rows: MoodTrainingRow[]): string {
  const escape = (value: string | number) => {
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [columns.join(","), ...rows.map((row) => columns.map((column) => escape(row[column])).join(","))]
    .join("\n") + "\n";
}
