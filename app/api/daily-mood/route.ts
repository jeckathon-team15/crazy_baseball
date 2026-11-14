import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SCORE_RANGE } from "@/lib/config";
import { analyzeUploadedCommunity } from "@/lib/analysis/daily-community";
import { createDailyMood, getYesterdayInSeoul, type DailyGameRecord, type DailyMood } from "@/lib/analysis/daily-mood";
import { normalizeTeam, timestamp, type TeamGame } from "@/lib/analysis/game-results";
import { getTeamSnapshotStatus, type AnalysisSnapshot } from "@/lib/analysis/forecast-snapshot";
import { predictMood, type MoodPrediction } from "@/lib/analysis/mood-model";
import type { SentimentSummary } from "@/lib/analysis/fan-posts";
import { fetchKboGames } from "@/lib/sports/api-sports";
import { fetchKboWebsiteGames } from "@/lib/sports/kbo-website";

type GameSource = "kbo" | "api-sports";

type CachedGames = {
  date: string;
  key: string;
  expiresAt: number;
  games: Promise<DailyGameRecord[]>;
};

let cachedGames: CachedGames | null = null;

async function gamesForDate(date: string, source: GameSource, key: string): Promise<DailyGameRecord[]> {
  const cacheKey = `${source}:${key}`;
  if (cachedGames?.date === date && cachedGames.key === cacheKey && cachedGames.expiresAt > Date.now()) {
    return cachedGames.games;
  }
  const entry: CachedGames = {
    date,
    key: cacheKey,
    expiresAt: Date.now() + 5 * 60 * 1000,
    games: source === "kbo" ? fetchKboWebsiteGames(date) : fetchKboGames(date, key),
  };
  cachedGames = entry;
  try {
    return await entry.games;
  } catch (error) {
    if (cachedGames === entry) cachedGames = null;
    throw error;
  }
}

async function matchingCommunity(result: DailyMood): Promise<AnalysisSnapshot["teams"][number] | null> {
  if (result.status !== "ready" || result.games.length === 0) return null;
  const snapshotPath = process.env.MOOD_SNAPSHOT_PATH?.trim() ||
    join(process.cwd(), "lib", "analysis", "data", "forecast-snapshot.json");
  try {
    const snapshotText = await readFile(snapshotPath, "utf8");
    const snapshot: unknown = JSON.parse(snapshotText);
    if (!snapshot || typeof snapshot !== "object" || !("version" in snapshot) || snapshot.version !== 1 ||
        !("source" in snapshot) || snapshot.source !== "live" ||
        !("asOf" in snapshot) || typeof snapshot.asOf !== "string" || timestamp(snapshot.asOf) === null ||
        !("teams" in snapshot) || !Array.isArray(snapshot.teams)) return null;
    const analysis = snapshot as AnalysisSnapshot;
    const now = Date.now();
    if (getTeamSnapshotStatus(analysis, result.team, now) !== "ready") return null;
    const team = analysis.teams.find((item) => item.team === result.team);
    const game = team?.games[0];
    const dailyGame = result.games[0];
    if (!team || !game || timestamp(game.endsAt) === null ||
        Date.parse(game.endsAt) > Date.parse(analysis.asOf) ||
        game.gameId !== dailyGame.gameId || game.date !== dailyGame.date ||
        game.teamScore !== dailyGame.teamScore || game.oppScore !== dailyGame.oppScore ||
        game.opponent !== dailyGame.opponent) return null;
    return team;
  } catch {
    return null;
  }
}

function usableSentiment(value: unknown): value is SentimentSummary {
  if (!value || typeof value !== "object") return false;
  const summary = value as Record<string, unknown>;
  const { positive, neutral, negative, validCount, score } = summary;
  if (typeof positive !== "number" || typeof neutral !== "number" || typeof negative !== "number" ||
      typeof validCount !== "number" || typeof score !== "number" || !Number.isFinite(score) ||
      ![positive, neutral, negative, validCount].every((count) => Number.isInteger(count) && count >= 0) ||
      validCount < 1 || positive + neutral + negative !== validCount || Math.abs(score) > SCORE_RANGE.max) return false;
  return Math.abs(score - SCORE_RANGE.max * (positive - negative) / validCount) < 0.000001;
}

async function modelPrediction(game: TeamGame, sentiment: SentimentSummary): Promise<MoodPrediction | null> {
  const modelPath = process.env.MOOD_MODEL_PATH?.trim() ||
    join(process.cwd(), "lib", "analysis", "data", "mood-model.json");
  try {
    const model: unknown = JSON.parse(await readFile(modelPath, "utf8"));
    return predictMood(model, game, sentiment, "live", Date.now());
  } catch {
    return null;
  }
}

type DailyLookup = { team: string; date: string; source: GameSource; games: DailyGameRecord[]; result: DailyMood };

async function lookupDailyMood(teamName: string, selectedDate: string | null): Promise<DailyLookup | Response> {
  const team = normalizeTeam(teamName);
  if (!team) return Response.json({ error: "응원팀을 선택해 주세요." }, { status: 400 });
  if (selectedDate !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate) ||
      timestamp(`${selectedDate}T00:00:00Z`) === null)) {
    return Response.json({ error: "경기 날짜를 올바르게 선택해 주세요." }, { status: 400 });
  }

  const apiSportsKey = process.env.API_SPORTS_KEY?.trim() ?? "";
  const source = process.env.GAME_RESULTS_SOURCE?.trim().toLowerCase() || "kbo";
  if (source !== "kbo" && source !== "api-sports") {
    return Response.json({ error: "경기 결과 출처 설정을 확인해 주세요." }, { status: 503 });
  }
  const key = source === "api-sports" ? apiSportsKey : "";
  if (source === "api-sports" && !key) {
    return Response.json({ error: "경기 결과 API 연결 설정이 필요합니다." }, { status: 503 });
  }

  const date = selectedDate ?? getYesterdayInSeoul(new Date());
  try {
    const games = await gamesForDate(date, source, key);
    const result = createDailyMood(team, date, games);
    return { team, date, source, games, result };
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    const code = cause && typeof cause === "object" && "code" in cause &&
      typeof cause.code === "string" && /^[A-Z0-9_]{1,40}$/.test(cause.code) ? cause.code : undefined;
    console.error("[daily-mood] 경기 결과 조회 실패", {
      source, date, type: error instanceof Error ? error.name : "UnknownError", code,
      message: source === "kbo" && error instanceof Error ? error.message : undefined,
    });
    return Response.json({ error: "경기 결과를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 502 });
  }
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const lookup = await lookupDailyMood(params.get("team") ?? "", params.get("date"));
  if (lookup instanceof Response) return lookup;
  const { team, date, source, games, result } = lookup;
  const community = await matchingCommunity(result);
  const valid = community && usableSentiment(community.sentiment);
  const prediction = valid ? await modelPrediction(community.games[0], community.sentiment) : null;
  const ruleBased = valid ? createDailyMood(team, date, games, community.sentiment.score) : result;
  const details = valid ? { applied: true, sample: false, origin: "saved", sentiment: community.sentiment } : null;
  const output = prediction
    ? { ...result, source, mood: prediction.mood, score: prediction.moodScore, prediction, community: details }
    : { ...ruleBased, source, prediction: { method: "rule_based", communityApplied: Boolean(valid) }, community: details };
  return Response.json(output, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "게시글 분석 파일을 확인해 주세요." }, { status: 400 });
  }
  const team = form.get("team");
  const date = form.get("date");
  const gameFile = form.get("games");
  const postFile = form.get("posts");
  const labelsFile = form.get("labels");
  if (typeof team !== "string" || typeof date !== "string" ||
      !gameFile || typeof gameFile === "string" || !postFile || typeof postFile === "string" ||
      (labelsFile !== null && typeof labelsFile === "string")) {
    return Response.json({ error: "응원팀, 경기 날짜와 두 개의 CSV 파일을 선택해 주세요." }, { status: 400 });
  }
  const files = [gameFile, postFile, ...(labelsFile ? [labelsFile] : [])];
  if (files.some((file) => file.size === 0 || file.size > 2 * 1024 * 1024)) {
    return Response.json({ error: "CSV 파일은 각각 2MB 이하의 비어 있지 않은 파일이어야 합니다." }, { status: 400 });
  }
  const lookup = await lookupDailyMood(team, date);
  if (lookup instanceof Response) return lookup;
  if (lookup.result.status !== "ready") {
    return Response.json({ error: "종료된 경기 결과를 확인한 뒤 게시글을 분석할 수 있습니다." }, { status: 400 });
  }
  try {
    const [gamesCsv, postsCsv, labelsCsv] = await Promise.all([
      gameFile.text(), postFile.text(), labelsFile ? labelsFile.text() : Promise.resolve(undefined),
    ]);
    const analysis = analyzeUploadedCommunity({ gamesCsv, postsCsv, labelsCsv,
      daily: lookup.result, providerGames: lookup.games, now: Date.now() });
    const applied = analysis.sentiment.score !== null;
    const prediction = applied && !analysis.sample
      ? await modelPrediction(analysis.game, analysis.sentiment) : null;
    const ruleBased = applied
      ? createDailyMood(lookup.team, lookup.date, lookup.games, analysis.sentiment.score) : lookup.result;
    const community = { applied, sample: analysis.sample, origin: "upload", sentiment: analysis.sentiment };
    const output = prediction
      ? { ...lookup.result, source: lookup.source, mood: prediction.mood, score: prediction.moodScore, prediction, community }
      : { ...ruleBased, source: lookup.source, prediction: { method: "rule_based", communityApplied: applied }, community };
    return Response.json(output, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "CSV 분석에 실패했습니다." }, { status: 400 });
  }
}
