import { readFile, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { buildAnalysisSnapshot, findTeamGameRecord, type AnalysisRules } from "../lib/analysis/forecast-snapshot";
import { selectGamePosts, type PostClassification } from "../lib/analysis/fan-posts";
import { classifyFanPostsByRules } from "../lib/analysis/rule-sentiment";
import { getRecentTeamGames, normalizeTeam, timestamp } from "../lib/analysis/game-results";
import { parseClassificationRecords, parseFanPosts, parseGameRecords, parsePlayerRecords } from "../lib/analysis/input-csv";

const parsed = parseArgs({
  options: {
    games: { type: "string" },
    posts: { type: "string" },
    players: { type: "string" },
    labels: { type: "string" },
    teams: { type: "string" },
    source: { type: "string" },
    "as-of": { type: "string" },
    output: { type: "string" },
    "recent-games": { type: "string" },
    "window-hours": { type: "string" },
    "max-posts": { type: "string" },
    "minimum-posts": { type: "string" },
    "max-age-days": { type: "string" },
    "win-points": { type: "string" },
    "run-difference-points": { type: "string" },
    "streak-points": { type: "string" },
    "run-difference-limit": { type: "string" },
    "streak-limit": { type: "string" },
    "fan-weight": { type: "string" },
    classify: { type: "boolean", default: false },
    "max-tokens": { type: "string" },
  },
  strict: true,
  allowPositionals: false,
});

function required(name: keyof typeof parsed.values): string {
  const value = parsed.values[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`--${name} 값을 입력해 주세요.`);
  return value.trim();
}

function numberOption(name: keyof typeof parsed.values): number {
  const value = Number(required(name));
  if (!Number.isFinite(value)) throw new Error(`--${name} 값은 숫자여야 합니다.`);
  return value;
}

async function main(): Promise<void> {
  const gamesPath = resolve(required("games"));
  const postsPath = parsed.values.posts ? resolve(parsed.values.posts) : null;
  const playersPath = parsed.values.players ? resolve(parsed.values.players) : null;
  const labelsPath = parsed.values.labels ? resolve(parsed.values.labels) : null;
  const output = resolve(parsed.values.output ?? "lib/analysis/data/forecast-snapshot.json");
  if ([gamesPath, postsPath, playersPath, labelsPath].includes(output)) {
    throw new Error("결과 파일 경로가 입력 파일과 같습니다.");
  }
  if (labelsPath && parsed.values.classify) throw new Error("--labels와 --classify 중 하나를 선택해 주세요.");

  const source = required("source");
  if (source !== "sample" && source !== "live") throw new Error("--source는 sample 또는 live여야 합니다.");
  const asOf = parsed.values["as-of"] ?? new Date().toISOString();
  if (timestamp(asOf) === null) throw new Error("--as-of에는 시간대가 포함된 ISO 시각이 필요합니다.");
  const teams = required("teams").split(",").map((value) => value.trim()).filter(Boolean);
  if (teams.length === 0 || teams.some((value) => !normalizeTeam(value))) {
    throw new Error("--teams에 올바른 KBO 구단을 입력해 주세요.");
  }

  const rules: AnalysisRules = {
    recentGames: numberOption("recent-games"),
    windowHours: numberOption("window-hours"),
    maxPosts: numberOption("max-posts"),
    minimumPosts: numberOption("minimum-posts"),
    maxAgeDays: numberOption("max-age-days"),
    winPoints: numberOption("win-points"),
    runDifferencePoints: numberOption("run-difference-points"),
    streakPoints: numberOption("streak-points"),
    runDifferenceLimit: numberOption("run-difference-limit"),
    streakLimit: numberOption("streak-limit"),
    fanWeight: numberOption("fan-weight"),
  };
  const [gameCsv, postCsv, playerCsv, labelCsv] = await Promise.all([
    readFile(gamesPath, "utf8"),
    postsPath ? readFile(postsPath, "utf8") : Promise.resolve(null),
    playersPath ? readFile(playersPath, "utf8") : Promise.resolve(null),
    labelsPath ? readFile(labelsPath, "utf8") : Promise.resolve(null),
  ]);
  const games = parseGameRecords(gameCsv);
  const posts = postCsv === null ? [] : parseFanPosts(postCsv);
  const players = playerCsv === null ? [] : parsePlayerRecords(playerCsv);
  let classifications: PostClassification[] = labelCsv === null ? [] : parseClassificationRecords(labelCsv);

  if (postCsv !== null && labelCsv === null) {
    if (parsed.values["max-tokens"]) console.error("--max-tokens는 규칙 기반 감성 분석에서 사용하지 않습니다.");
    for (const team of [...new Set(teams.map((name) => normalizeTeam(name)!))]) {
      const recent = getRecentTeamGames(games, team, asOf, rules.recentGames);
      const latestGame = findTeamGameRecord(games, team, asOf, recent[0]);
      if (!latestGame) continue;
      const selected = selectGamePosts(posts, latestGame, games, team, asOf, rules);
      classifications = classifications.concat(classifyFanPostsByRules(selected, {
        team, opponent: recent[0].opponent,
      }));
    }
  }

  const snapshot = buildAnalysisSnapshot({ games, posts, players, classifications, teams, source, asOf }, rules);
  if (snapshot.teams.length === 0) throw new Error("집계할 종료 경기가 없습니다.");
  await mkdir(dirname(output), { recursive: true });
  const temporary = `${output}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: "wx" });
    await rename(temporary, output);
  } finally {
    await rm(temporary, { force: true });
  }
  console.log(`${snapshot.teams.length}개 구단의 예보 데이터를 저장했습니다: ${output}`);
  for (const team of snapshot.teams) {
    console.log(`${team.team}: 경기 ${team.games.length}건, 유효 게시글 ${team.sentiment.validCount}건`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "분석 데이터를 만들지 못했습니다.");
  process.exitCode = 1;
});
