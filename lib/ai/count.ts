import type { ChatResponse, Count, Relation } from "@/types/chat";
import { CHAT_COUNT_RULES, CHAT_DANGER_WORDS, CHAT_FALLBACK_REPLY } from "@/lib/config";

// 순수 함수 모음 (서버 키 없음). scripts/selftest-chat.ts에서 테스트합니다.

export type Call = ChatResponse["call"];

/** 판정 하나를 반영한 다음 볼카운트와 종료 여부. AI가 아니라 코드로 계산합니다. */
export function applyCall(count: Count, call: Call): { count: Count; ended: boolean } {
  let { balls, strikes, outs } = count;

  if (call === "ball") {
    balls += 1;
    if (balls >= CHAT_COUNT_RULES.ballsReset) {
      balls = 0;
      strikes = 0;
    }
  } else {
    strikes += 1;
    if (strikes >= CHAT_COUNT_RULES.strikesForOut) {
      outs += 1;
      balls = 0;
      strikes = 0;
    }
  }

  return { count: { balls, strikes, outs }, ended: outs >= CHAT_COUNT_RULES.outsToEnd };
}

/** AI 실패 시 위험 단어로 판정 */
export function judgeByKeywords(text: string): Call {
  return CHAT_DANGER_WORDS.some((w) => text.includes(w)) ? "strike" : "ball";
}

/** AI 실패 시 기본 답장 */
export function fallbackReply(call: Call, relation: Relation): string {
  return call === "strike" ? CHAT_FALLBACK_REPLY.strike : CHAT_FALLBACK_REPLY.ball[relation];
}
