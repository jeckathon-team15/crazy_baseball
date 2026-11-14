import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { analyzeCommunity, BaseballApiError, getDailyMood } from "../../public/yachinja-api.js";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("requests the selected team and date using a same-origin URL", async () => {
  let requested = "";
  globalThis.fetch = async (url) => {
    requested = String(url);
    return Response.json({ status: "ready", mood: "좋음" });
  };
  const result = await getDailyMood({ team: "한화 이글스", date: "2026-11-07" });
  const url = new URL(requested, "http://localhost");
  assert.equal(url.pathname, "/api/daily-mood");
  assert.equal(url.searchParams.get("team"), "한화 이글스");
  assert.equal(url.searchParams.get("date"), "2026-11-07");
  assert.equal(result.mood, "좋음");
});

test("sends uploaded CSV files as multipart without overriding the boundary", async () => {
  globalThis.fetch = async (_url, init) => {
    assert.equal(init?.method, "POST");
    assert.equal(init?.headers, undefined);
    const form = init?.body as FormData;
    assert.equal(form.get("team"), "삼성");
    assert.equal(form.get("date"), "2026-11-07");
    assert.equal(await (form.get("games") as Blob).text(), "game CSV");
    assert.equal(await (form.get("posts") as Blob).text(), "post CSV");
    assert.equal(form.get("labels"), null);
    return Response.json({ community: { applied: true }, prediction: { method: "rule_based" } });
  };
  const result = await analyzeCommunity({
    team: "삼성", date: "2026-11-07", games: new Blob(["game CSV"]), posts: new Blob(["post CSV"]),
  });
  assert.equal(result.community.applied, true);
});

test("includes an optional classification CSV when provided", async () => {
  globalThis.fetch = async (_url, init) => {
    const form = init?.body as FormData;
    assert.equal(await (form.get("labels") as Blob).text(), "classification CSV");
    return Response.json({ status: "ready" });
  };
  await analyzeCommunity({ team: "한화", date: "2026-11-07", games: new Blob(["g"]),
    posts: new Blob(["p"]), labels: new Blob(["classification CSV"]) });
});

test("reports server messages and payload limits without exposing an HTML error page", async () => {
  globalThis.fetch = async () => Response.json({ error: "경기를 확인해 주세요." }, { status: 502 });
  await assert.rejects(() => getDailyMood({ team: "한화" }), (error: unknown) =>
    error instanceof BaseballApiError && error.status === 502 && error.message === "경기를 확인해 주세요.",
  );
  globalThis.fetch = async () => new Response("<html>too large</html>", { status: 413 });
  await assert.rejects(() => getDailyMood({ team: "한화" }), (error: unknown) =>
    error instanceof BaseballApiError && error.status === 413 && !error.message.includes("<html>"),
  );
});

test("rejects empty and oversized uploads before sending a request", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({}); };
  await assert.rejects(() => analyzeCommunity({ team: "삼성", date: "2026-11-07", games: new Blob([]), posts: new Blob(["x"]) }));
  await assert.rejects(() => analyzeCommunity({
    team: "삼성", date: "2026-11-07", games: new Blob([new Uint8Array(2 * 1024 * 1024 + 1)]), posts: new Blob(["x"]),
  }));
  const fullFile = new Blob([new Uint8Array(2 * 1024 * 1024)]);
  await assert.rejects(() => analyzeCommunity({
    team: "삼성", date: "2026-11-07", games: fullFile, posts: fullFile, labels: new Blob(["x"]),
  }));
  assert.equal(calls, 0);
});
