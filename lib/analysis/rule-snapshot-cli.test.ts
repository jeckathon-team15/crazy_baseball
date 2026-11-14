import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

test("builds a sentiment snapshot from CSV without an AI key or labels file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "baseball-rule-snapshot-"));
  const output = join(directory, "snapshot.json");
  try {
    const args = [
      "--conditions=react-server", "--import", "tsx", "scripts/build-forecast-snapshot.ts",
      "--games", "scripts/sample/games.csv", "--posts", "scripts/sample/posts.csv",
      "--teams", "한화,삼성", "--source", "sample", "--as-of", "2026-11-14T08:00:00+09:00",
      "--output", output, "--recent-games", "5", "--window-hours", "12", "--max-posts", "50",
      "--minimum-posts", "1", "--max-age-days", "7", "--win-points", "60",
      "--run-difference-points", "4", "--streak-points", "5", "--run-difference-limit", "5",
      "--streak-limit", "4", "--fan-weight", "0.2",
    ];
    const options = { cwd: process.cwd(), env: { ...process.env, ANTHROPIC_API_KEY: "" }, encoding: "utf8" as const };
    const result = spawnSync(process.execPath, args, options);
    assert.equal(result.status, 0, result.stderr);
    const snapshot = JSON.parse(await readFile(output, "utf8"));
    const hanwha = snapshot.teams.find((team: { team: string }) => team.team === "한화 이글스");
    assert.ok(hanwha.sentiment.validCount > 0);
    assert.ok(hanwha.sentiment.negative > 0);
    assert.equal(typeof hanwha.sentiment.score, "number");

    const legacy = spawnSync(process.execPath, [...args, "--classify", "--max-tokens", "100"], options);
    assert.equal(legacy.status, 0, legacy.stderr);
    const legacySnapshot = JSON.parse(await readFile(output, "utf8"));
    assert.equal(legacySnapshot.teams[0].sentiment.validCount, snapshot.teams[0].sentiment.validCount);

    const manual = spawnSync(process.execPath, [...args, "--labels", "scripts/sample/classifications.csv"], options);
    assert.equal(manual.status, 0, manual.stderr);
    const manualSnapshot = JSON.parse(await readFile(output, "utf8"));
    assert.equal(manualSnapshot.teams[0].sentiment.validCount, 10);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
