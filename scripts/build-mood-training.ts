import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { parseCsv } from "../lib/analysis/csv";
import { parseClassificationRecords, parseFanPosts, parseGameRecords } from "../lib/analysis/input-csv";
import { buildMoodTrainingRows, trainingRowsCsv } from "../lib/analysis/mood-training";

const parsed = parseArgs({
  options: {
    games: { type: "string" }, posts: { type: "string" }, labels: { type: "string" },
    feedback: { type: "string" }, output: { type: "string" },
    "window-hours": { type: "string" }, "max-posts": { type: "string" },
    "minimum-posts": { type: "string" },
  },
  strict: true,
  allowPositionals: false,
});

function required(name: keyof typeof parsed.values): string {
  const value = parsed.values[name];
  if (!value?.trim()) throw new Error(`--${name} 값을 입력해 주세요.`);
  return value.trim();
}

function numberOption(name: keyof typeof parsed.values): number {
  const number = Number(required(name));
  if (!Number.isFinite(number)) throw new Error(`--${name} 값은 숫자여야 합니다.`);
  return number;
}

async function main(): Promise<void> {
  const gamesPath = resolve(required("games"));
  const postsPath = resolve(required("posts"));
  const labelsPath = resolve(required("labels"));
  const feedbackPath = resolve(required("feedback"));
  const output = resolve(required("output"));
  if ([gamesPath, postsPath, labelsPath, feedbackPath].includes(output)) {
    throw new Error("학습 결과 파일 경로가 입력 파일과 같습니다.");
  }
  const [gameCsv, postCsv, labelCsv, feedbackCsv] = await Promise.all([
    readFile(gamesPath, "utf8"), readFile(postsPath, "utf8"),
    readFile(labelsPath, "utf8"), readFile(feedbackPath, "utf8"),
  ]);
  const feedback = parseCsv(feedbackCsv);
  if (feedback.length === 0) throw new Error("기분 기록이 없습니다.");
  const result = buildMoodTrainingRows({
    games: parseGameRecords(gameCsv), posts: parseFanPosts(postCsv),
    classifications: parseClassificationRecords(labelCsv), feedback,
    rules: {
      windowHours: numberOption("window-hours"), maxPosts: numberOption("max-posts"),
      minimumPosts: numberOption("minimum-posts"),
    },
  });
  if (result.rows.length === 0) {
    throw new Error(`학습 가능한 기분 기록이 없습니다. 유효 반응 부족: ${result.skippedInsufficientPosts}건`);
  }
  await mkdir(dirname(output), { recursive: true });
  const temporary = `${output}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, trainingRowsCsv(result.rows), { flag: "wx" });
    await rename(temporary, output);
  } finally {
    await rm(temporary, { force: true });
  }
  console.log(`학습 기록 ${result.rows.length}건 저장: ${output}`);
  console.log(`유효 반응 부족으로 제외: ${result.skippedInsufficientPosts}건`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "학습 데이터를 만들지 못했습니다.");
  process.exitCode = 1;
});
