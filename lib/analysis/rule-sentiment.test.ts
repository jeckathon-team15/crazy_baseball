import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyFanPostsByRules } from "./rule-sentiment";
import type { FanPost } from "./fan-posts";

const base: FanPost = {
  source: "mlbpark", postId: "1", gameId: "g1", team: "한화", teamTag: "한화",
  publishedAt: "2026-10-01T22:00:00+09:00", title: "", text: "", url: "",
};

function classify(text: string) {
  return classifyFanPostsByRules([{ ...base, text }], { team: "한화 이글스", opponent: "삼성 라이온즈" })[0];
}

test("classifies baseball reactions and their main topics without an external model", () => {
  assert.deepEqual(
    [classify("오늘 불펜 정말 든든하고 잘했다"), classify("수비 실책이 너무 아쉽다")]
      .map(({ sentiment, topic }) => [sentiment, topic]),
    [["positive", "불펜"], ["negative", "수비"]],
  );
  assert.equal(classify("경기 결과는 4대 2").sentiment, "neutral");
  assert.equal(classify("선발이 잘 던졌다").sentiment, "positive");
  assert.equal(classify("오늘 경기는 졌다").sentiment, "negative");
});

test("handles common Korean negations before matching sentiment words", () => {
  assert.equal(classify("오늘 타격은 안 좋았다").sentiment, "negative");
  assert.equal(classify("선발이 나쁘지 않았다").sentiment, "positive");
  assert.equal(classify("타격을 잘하지 못했다").sentiment, "negative");
  assert.equal(classify("오늘 투구는 안 잘했다").sentiment, "negative");
  assert.equal(classify("패배하지 않았다").sentiment, "uncertain");
});

test("holds unclear, mixed or opponent-directed reactions instead of guessing", () => {
  assert.equal(classify("글쎄요 ㅋㅋ").sentiment, "uncertain");
  assert.equal(classify("불펜은 잘했지만 타격이 아쉽다").sentiment, "uncertain");
  assert.equal(classify("삼성 불펜이 정말 잘했다").sentiment, "uncertain");
  assert.equal(classify("상대팀 선발이 최고였다").sentiment, "uncertain");
  const [opponentAlias] = classifyFanPostsByRules(
    [{ ...base, text: "기아 선발이 잘했다" }],
    { team: "한화 이글스", opponent: "KIA 타이거즈" },
  );
  assert.equal(opponentAlias.sentiment, "uncertain");
});

test("excludes obvious ticket sales and transfer rumours from game reactions", () => {
  assert.equal(classify("경기 티켓 양도합니다").relevant, false);
  assert.equal(classify("트레이드 소문이 좋다").relevant, false);
});
