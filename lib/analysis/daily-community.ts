import type { DailyGameRecord, DailyMood } from "./daily-mood";
import { classifyFanPostsByRules } from "./rule-sentiment";
import { selectGamePosts, summarizeSentiment, type SentimentSummary } from "./fan-posts";
import { normalizeTeam, timestamp, type TeamGame } from "./game-results";
import { parseClassificationRecords, parseFanPosts, parseGameRecords } from "./input-csv";

export type UploadedCommunity = {
  game: TeamGame;
  sentiment: SentimentSummary;
  sample: boolean;
};

export function analyzeUploadedCommunity(input: {
  gamesCsv: string;
  postsCsv: string;
  labelsCsv?: string;
  daily: DailyMood;
  providerGames: DailyGameRecord[];
  now: number;
}): UploadedCommunity {
  const dailyGame = input.daily.games[0];
  if (input.daily.status !== "ready" || !dailyGame || !Number.isFinite(input.now)) {
    throw new Error("종료된 경기 결과가 있어야 게시글을 분석할 수 있습니다.");
  }

  const games = parseGameRecords(input.gamesCsv);
  const matching = games.filter((game) => game.gameId === dailyGame.gameId);
  const provider = input.providerGames.find((game) => game.gameId === dailyGame.gameId && game.status === "finished");
  if (matching.length !== 1 || !provider) {
    throw new Error("경기 CSV에 선택한 경기와 일치하는 경기 ID가 하나 있어야 합니다.");
  }
  const game = matching[0];
  const end = game.endsAt ? timestamp(game.endsAt) : null;
  if (game.status !== "finished" || game.date !== dailyGame.date || end === null || end > input.now ||
      timestamp(game.startsAt) !== timestamp(provider.startsAt) ||
      normalizeTeam(game.homeTeam) !== normalizeTeam(provider.homeTeam) ||
      normalizeTeam(game.awayTeam) !== normalizeTeam(provider.awayTeam) ||
      game.homeScore !== provider.homeScore || game.awayScore !== provider.awayScore) {
    throw new Error("경기 CSV의 날짜, 팀, 점수 또는 시각이 실제 경기 결과와 일치하지 않습니다.");
  }

  const posts = parseFanPosts(input.postsCsv);
  const sameDayGames = input.providerGames.map((record) => ({
    ...record, status: record.status === "pending" ? "scheduled" as const : record.status,
    endsAt: null,
  }));
  const selected = selectGamePosts(posts, game, [...games, ...sameDayGames], input.daily.team,
    new Date(input.now).toISOString(), { windowHours: 12, maxPosts: 50 });
  const classifications = input.labelsCsv
    ? parseClassificationRecords(input.labelsCsv)
    : classifyFanPostsByRules(selected, { team: input.daily.team, opponent: dailyGame.opponent });
  const sentiment = summarizeSentiment(selected, classifications, 10);
  return {
    game: { ...dailyGame, endsAt: game.endsAt! },
    sentiment,
    sample: posts.some((post) => ["sample", "demo"].includes(post.source.trim().toLowerCase())),
  };
}
