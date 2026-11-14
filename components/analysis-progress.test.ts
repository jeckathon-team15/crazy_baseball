import assert from "node:assert/strict";
import test from "node:test";
import { runAnalysis, type AnalysisStage } from "./analysis-progress";

test("waits at first base until the actual response arrives", async () => {
  let finish!: (value: string) => void;
  const response = new Promise<string>(resolve => { finish = resolve; });
  const stages: AnalysisStage[] = [];
  const job = runAnalysis(() => response, stage => stages.push(stage), async () => {}, new AbortController().signal);
  await Promise.resolve();
  assert.deepEqual(stages, [1]);
  finish("report");
  assert.equal(await job, "report");
  assert.deepEqual(stages, [1, 2, 3, 4]);
});

test("failed requests never advance to the next base", async () => {
  const stages: AnalysisStage[] = [];
  await assert.rejects(runAnalysis(async () => { throw new Error("offline"); }, stage => stages.push(stage), async () => {}, new AbortController().signal), /offline/);
  assert.deepEqual(stages, [1]);
});

test("cancellation prevents stale results and later progress", async () => {
  const controller = new AbortController();
  const stages: AnalysisStage[] = [];
  await assert.rejects(runAnalysis(async () => { controller.abort(); return "late"; }, stage => stages.push(stage), async () => {}, controller.signal), { name: "AbortError" });
  assert.deepEqual(stages, [1]);
});
