import { MAX_RECENT_GAMES, moodFromScore, SCORE_RANGE, SCORE_WEIGHTS } from "@/lib/config";
import type { BossInput, ForecastResponse, PlayerGame } from "@/types/forecast";
import { selectGamePosts, summarizeSentiment, type FanPost, type PostClassification, type SentimentSummary } from "./fan-posts";
import { getRecentTeamGames, normalizeTeam, timestamp, type GameRecord, type TeamGame } from "./game-results";
import { scoreForecast, scorePlayerGames, type ScoreRules } from "./score-forecast";

export type PlayerRecord = PlayerGame & { team: string; player: string };

export type AnalysisRules = ScoreRules & {
  recentGames: number;
  windowHours: number;
  maxPosts: number;
  minimumPosts: number;
  maxAgeDays: number;
};

type TeamSnapshot = {
  team: string;
  games: TeamGame[];
  players: Record<string, PlayerGame[]>;
  sentiment: SentimentSummary;
  sources: string[];
  gameScore: number;
  teamScore: number;
  streak: number;
  validUntil: string;
};

export type AnalysisSnapshot = {
  version: 1;
  source: "sample" | "live";
  asOf: string;
  teams: TeamSnapshot[];
};

export function findTeamGameRecord(
  records: GameRecord[],
  team: string,
  asOf: string,
  target: TeamGame | undefined,
): GameRecord | undefined {
  if (!target) return undefined;
  return records.find((record) => {
    if (record.gameId !== target.gameId) return false;
    const [game] = getRecentTeamGames([record], team, asOf, 1);
    return game && game.startsAt === target.startsAt && game.endsAt === target.endsAt &&
      game.opponent === target.opponent && game.teamScore === target.teamScore && game.oppScore === target.oppScore;
  });
}

export function buildAnalysisSnapshot(
  input: {
    games: GameRecord[];
    posts: FanPost[];
    classifications: PostClassification[];
    players: PlayerRecord[];
    teams: string[];
    asOf: string;
    source: "sample" | "live";
  },
  rules: AnalysisRules,
): AnalysisSnapshot {
  if (
    !Number.isInteger(rules.recentGames) || rules.recentGames < 1 ||
    rules.recentGames > MAX_RECENT_GAMES ||
    !Number.isInteger(rules.minimumPosts) || rules.minimumPosts < 1 ||
    !Number.isInteger(rules.maxPosts) || rules.maxPosts < rules.minimumPosts ||
    !Number.isFinite(rules.windowHours) || rules.windowHours <= 0 ||
    !Number.isFinite(rules.maxAgeDays) || rules.maxAgeDays <= 0
  ) {
    throw new Error("경기 수 또는 게시글 집계 설정이 올바르지 않습니다.");
  }
  if (timestamp(input.asOf) === null) throw new Error("집계 시각이 올바르지 않습니다.");

  const teams: TeamSnapshot[] = [];
  const names = new Set(input.teams.map(normalizeTeam).filter((name): name is string => name !== null));
  for (const team of names) {
    const games = getRecentTeamGames(input.games, team, input.asOf, rules.recentGames);
    if (games.length === 0) continue;
    const latestGame = findTeamGameRecord(input.games, team, input.asOf, games[0]);
    if (!latestGame) continue;
    const selected = selectGamePosts(input.posts, latestGame, input.games, team, input.asOf, rules);
    const sentiment = summarizeSentiment(selected, input.classifications, rules.minimumPosts);
    const scores = scoreForecast(games, sentiment.score, null, rules);
    const players: Record<string, PlayerGame[]> = Object.create(null);
    const gameDates = new Set(games.map((game) => game.date));
    for (const player of input.players) {
      if (normalizeTeam(player.team) !== team || !player.player.trim() || !gameDates.has(player.date)) continue;
      const name = player.player.trim().normalize("NFKC");
      const game: PlayerGame = { date: player.date, role: player.role, summary: player.summary, rating: player.rating };
      (players[name] ??= []).push(game);
    }
    for (const entries of Object.values(players)) {
      entries.sort((a, b) => b.date.localeCompare(a.date));
      entries.splice(MAX_RECENT_GAMES);
    }
    teams.push({
      team, games, players, sentiment,
      sources: [...new Set(selected.map((post) => post.source))],
      gameScore: scores.gameScore,
      teamScore: scores.teamScore,
      streak: scores.streak,
      validUntil: new Date(Date.parse(games[0].endsAt) + rules.maxAgeDays * 24 * 60 * 60 * 1000).toISOString(),
    });
  }
  return { version: 1, source: input.source, asOf: input.asOf, teams };
}

export function getTeamSnapshotStatus(
  snapshot: AnalysisSnapshot,
  team: string,
  now: number,
): "ready" | "missing" | "stale" | "future" {
  const entry = snapshot.teams.find((item) => item.team === normalizeTeam(team));
  if (!entry || entry.games.length === 0) return "missing";
  if (snapshot.source === "live" &&
      (Date.parse(snapshot.asOf) > now || Date.parse(entry.games[0].endsAt) > now)) {
    return "future";
  }
  if (snapshot.source === "live" && (!Number.isFinite(Date.parse(entry.validUntil)) || now > Date.parse(entry.validUntil))) {
    return "stale";
  }
  return "ready";
}

export function createForecastResponse(input: BossInput, snapshot: AnalysisSnapshot): ForecastResponse | null {
  const team = snapshot.teams.find((entry) => entry.team === normalizeTeam(input.team));
  if (!team || team.games.length === 0) return null;
  const playerName = input.player.trim().normalize("NFKC");
  const playerGames = Object.hasOwn(team.players, playerName) ? team.players[playerName] : [];
  const playerScore = scorePlayerGames(playerGames);
  const calculatedScore = playerScore === null
    ? team.teamScore
    : team.teamScore * SCORE_WEIGHTS.team + playerScore * SCORE_WEIGHTS.player;
  const moodScore = Math.round(Math.max(SCORE_RANGE.min, Math.min(SCORE_RANGE.max, calculatedScore)));
  const mood = moodFromScore(moodScore);
  const wins = team.games.filter((game) => game.result === "W").length;
  const losses = team.games.filter((game) => game.result === "L").length;
  const draws = team.games.length - wins - losses;
  const label = team.sources.length === 1 && team.sources[0] === "mlbpark" ? "엠팍 게시글" : "커뮤니티 게시글";
  const fanText = team.sentiment.score === null
    ? `${label} ${team.sentiment.validCount}건으로 반응 점수는 적용하지 않았습니다.`
    : `${label} ${team.sentiment.validCount}건 중 긍정 ${team.sentiment.positive}건, 중립 ${team.sentiment.neutral}건, 부정 ${team.sentiment.negative}건입니다.`;
  const highlights = [
    `최근 ${team.games.length}경기 ${wins}승 ${draws}무 ${losses}패`,
    ...(team.streak > 1 ? [`${team.streak}연승`] : team.streak < -1 ? [`${Math.abs(team.streak)}연패`] : []),
    fanText,
    ...(team.sentiment.score !== null && team.sentiment.topTopic
      ? [`반응 주요 주제: ${team.sentiment.topTopic}`] : []),
    ...(team.sentiment.score !== null && team.sentiment.negativeTopTopic
      ? [`부정 반응 주요 주제: ${team.sentiment.negativeTopTopic}`] : []),
    ...(playerScore === null ? ["선수 경기 기록 미제공"] : []),
  ];
  const asOf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(snapshot.asOf));
  const warning = mood === "매우 안 좋음" ? "야친자 경보" : mood === "안 좋음" ? "야친자 주의보" : "야친자 예보";
  const sample = snapshot.source === "sample" ? "시연용 데이터입니다. " : "";

  return {
    input,
    performance: {
      team: team.team,
      player: input.player,
      teamGames: team.games.map(({ date, opponent, teamScore, oppScore, result }) =>
        ({ date, opponent, teamScore, oppScore, result })),
      playerGames,
      teamScore: team.teamScore,
      playerScore: playerScore ?? 0,
      highlights,
      source: snapshot.source,
      asOf,
    },
    forecast: {
      mood,
      moodScore,
      headline: `${warning} · ${input.bossTitle}의 예상 기분은 ${mood}`,
      reason: `${sample}${highlights[0]}입니다. ${fanText}`,
      lunch: { menu: input.favoriteMenus[0], comment: "좋아하는 메뉴 중에서 골랐어요." },
      tips: [
        "최근 경기 결과를 먼저 확인해 보세요.",
        mood === "안 좋음" || mood === "매우 안 좋음" ? "야구 이야기는 분위기를 보고 꺼내세요." : "경기 이야기를 가볍게 나눠 보세요.",
      ],
      fallback: true,
    },
  };
}
