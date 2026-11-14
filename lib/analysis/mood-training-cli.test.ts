import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCsv } from "./csv";

test("prepares the Python trainer's CSV from game, post, classification and feedback files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mood-training-cli-"));
  const files = {
    games: join(dir, "games.csv"), posts: join(dir, "posts.csv"),
    labels: join(dir, "labels.csv"), feedback: join(dir, "feedback.csv"), output: join(dir, "training.csv"),
  };
  try {
    await writeFile(files.games, "gameId,date,homeTeam,awayTeam,homeScore,awayScore,status,startsAt,endsAt\n" +
      "g1,2026-10-01,한화,삼성,4,2,finished,2026-10-01T18:30:00+09:00,2026-10-01T21:30:00+09:00\n");
    await writeFile(files.posts, "source,postId,gameId,team,teamTag,publishedAt,title,text,url\n" +
      "sample,1,g1,한화,한화,2026-10-01T21:40:00+09:00,불펜,잘했다,\n");
    await writeFile(files.labels, "source,postId,relevant,sentiment,topic\nsample,1,true,positive,불펜\n");
    await writeFile(files.feedback, "user_id,game_id,team,as_of,mood_recorded_at,mood\n" +
      "anon-1,g1,한화,2026-10-01T23:00:00+09:00,2026-10-02T09:00:00+09:00,좋음\n");
    const args = ["--conditions=react-server", "--import", "tsx", "scripts/build-mood-training.ts",
      "--games", files.games, "--posts", files.posts, "--labels", files.labels,
      "--feedback", files.feedback, "--output", files.output,
      "--window-hours", "12", "--max-posts", "50", "--minimum-posts", "1"];
    const result = spawnSync(process.execPath, args, { cwd: process.cwd(), encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const [row] = parseCsv(await readFile(files.output, "utf8"));
    assert.equal(row.game_id, "g1");
    assert.equal(row.team_score, "4");
    assert.equal(row.positive, "1");
    assert.equal(row.mood, "좋음");

    args[args.indexOf("--output") + 1] = files.feedback;
    const before = await readFile(files.feedback, "utf8");
    const overwrite = spawnSync(process.execPath, args, { cwd: process.cwd(), encoding: "utf8" });
    assert.notEqual(overwrite.status, 0);
    assert.equal(await readFile(files.feedback, "utf8"), before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
