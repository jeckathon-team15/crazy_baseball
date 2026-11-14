// 실행: npx tsx scripts/selftest-chat.ts
import assert from "node:assert/strict";
import { applyCall, fallbackReply, judgeByKeywords } from "@/lib/ai/count";
import { CHAT_FALLBACK_REPLY, CHAT_START_COUNT } from "@/lib/config";

const cases: Array<[string, () => void]> = [
  ["시작 카운트에서 ball → 볼 1", () => {
    assert.deepEqual(applyCall(CHAT_START_COUNT, "ball"), {
      count: { balls: 1, strikes: 0, outs: 0 },
      ended: false,
    });
  }],
  ["0아웃 2스트라이크에서 strike → 1아웃, 종료 아님", () => {
    assert.deepEqual(applyCall({ balls: 1, strikes: 2, outs: 0 }, "strike"), {
      count: { balls: 0, strikes: 0, outs: 1 },
      ended: false,
    });
  }],
  ["볼 3개에서 ball → 카운트 초기화", () => {
    assert.deepEqual(applyCall({ balls: 3, strikes: 2, outs: 2 }, "ball"), {
      count: { balls: 0, strikes: 0, outs: 2 },
      ended: false,
    });
  }],
  ["스트라이크 1개에서 strike → 2스트라이크, 볼 유지", () => {
    assert.deepEqual(applyCall({ balls: 2, strikes: 1, outs: 2 }, "strike"), {
      count: { balls: 2, strikes: 2, outs: 2 },
      ended: false,
    });
  }],
  ["1아웃 2스트라이크에서 strike → 2아웃, 카운트 초기화", () => {
    assert.deepEqual(applyCall({ balls: 1, strikes: 2, outs: 1 }, "strike"), {
      count: { balls: 0, strikes: 0, outs: 2 },
      ended: false,
    });
  }],
  ["2아웃 2스트라이크에서 strike → 3아웃, ended", () => {
    assert.deepEqual(applyCall({ balls: 3, strikes: 2, outs: 2 }, "strike"), {
      count: { balls: 0, strikes: 0, outs: 3 },
      ended: true,
    });
  }],
  ["2아웃 2스트라이크에서 ball → 종료 아님", () => {
    assert.equal(applyCall({ balls: 0, strikes: 2, outs: 2 }, "ball").ended, false);
  }],
  ["위험 단어 판정", () => {
    assert.equal(judgeByKeywords("어제 LG 또 졌다면서요?"), "strike");
    assert.equal(judgeByKeywords("이러다 가을야구 못 가겠네요"), "strike");
    assert.equal(judgeByKeywords("과장님 점심 뭐 드실래요?"), "ball");
  }],
  ["기본 답장", () => {
    assert.equal(fallbackReply("strike", "boss"), CHAT_FALLBACK_REPLY.strike);
    assert.equal(fallbackReply("ball", "boss"), "그래, 알겠어.");
    assert.equal(fallbackReply("ball", "friend"), "응, 그렇지 뭐.");
  }],
];

let failed = 0;
for (const [name, run] of cases) {
  try {
    run();
    console.log(`✓ ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`✗ ${name}\n  ${(e as Error).message}`);
  }
}

console.log(`\n${cases.length - failed}/${cases.length} 통과`);
if (failed > 0) process.exit(1);
