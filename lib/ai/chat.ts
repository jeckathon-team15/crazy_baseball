import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage, ChatProfile, ChatRequest, ChatResponse, Count, Tip } from "@/types/chat";
import {
  AI_TIMEOUT_MS,
  AI_SERVICE_ENABLED,
  CHAT_FALLBACK_TIPS,
  CHAT_RECENT_MESSAGES,
  CHAT_TIP_COUNT,
  CHAT_TIP_TITLE_MAX,
  CLAUDE_MODEL,
} from "@/lib/config";
import { applyCall, fallbackReply, judgeByKeywords, type Call } from "@/lib/ai/count";

// 서버는 아무것도 저장하지 않습니다. 매 요청마다 상대 정보와 대화 전체를 받아 Claude에 보냅니다.
//
// 참고: Claude Sonnet 5.5 / Opus 5.5는 tool_choice를 "tool"로 강제하면 400을 돌려줍니다.
// 그래서 tool_choice는 auto로 두고 strict 스키마 + "반드시 도구 호출" 지시로 JSON을 받습니다.
// 도구를 안 부르거나 형식이 틀리면 기본 문구(fallback)로 응답합니다.

const REQUEST_OPTIONS = { timeout: AI_TIMEOUT_MS, maxRetries: 0 };
const MAX_TOKENS = 4000;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

// ── 도구 정의 ─────────────────────────────────────────

const RESPOND_TOOL: Anthropic.Tool = {
  name: "respond",
  description: "사용자의 마지막 말에 대한 판정과 상대 인물의 답장을 제출합니다. 매 턴 반드시 한 번 호출합니다.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      call: {
        type: "string",
        enum: ["ball", "strike"],
        description: "사용자의 마지막 말 판정. 위험하면 strike, 무난하면 ball",
      },
      reply: { type: "string", description: "상대 인물의 답장 1~2문장" },
    },
    required: ["call", "reply"],
    additionalProperties: false,
  },
};

const TIPS_TOOL: Anthropic.Tool = {
  name: "tips",
  description: `대화 종료 후 사용자에게 줄 말하기 팁 ${CHAT_TIP_COUNT}개를 제출합니다.`,
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        description: `팁 정확히 ${CHAT_TIP_COUNT}개`,
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: `어떤 방식으로 말할지 (${CHAT_TIP_TITLE_MAX}자 이내)` },
            desc: { type: "string", description: "그렇게 말하면 좋은 이유나 방법 한 문장" },
          },
          required: ["title", "desc"],
          additionalProperties: false,
        },
      },
    },
    required: ["items"],
    additionalProperties: false,
  },
};

// ── 프롬프트 ──────────────────────────────────────────

function formatCount(c: Count): string {
  return `${c.outs}아웃 ${c.balls}볼 ${c.strikes}스트라이크`;
}

function buildChatSystem(profile: ChatProfile, count: Count): string {
  const tone =
    profile.relation === "boss"
      ? "너는 사용자의 직장 상사다. 사용자는 너에게 존댓말을 쓰고, 너는 상사답게 짧고 무뚝뚝한 반말로 답한다."
      : "너는 사용자의 친구다. 둘 다 편한 반말로 이야기한다.";

  return [
    `너는 대화 연습 시뮬레이터 속 인물 "${profile.displayName}"이다. KBO ${profile.team}의 열성 팬이다.`,
    `오늘 기분은 "${profile.mood}"이고, 이유는 "${profile.moodReason}"이다.`,
    tone,
    "",
    "## 답장 규칙",
    "- 답장은 1~2문장. 실제 사람처럼 말한다.",
    "- 이모지, 괄호 속 행동 묘사, 설명은 쓰지 않는다. 자신이 AI라고 말하지 않는다.",
    "- 기분이 나쁠수록, 스트라이크가 쌓일수록 더 예민하고 날카롭게 반응한다.",
    "",
    "## 판정 규칙 (사용자의 마지막 말만 판정)",
    "- strike: 응원 팀이나 선수 비난, 패배·연패 언급, 비꼬기, 무례한 말, 관계에 맞지 않는 말투(상사에게 반말 등)",
    "- ball: 그 외 무난한 말",
    "",
    `현재 볼카운트: ${formatCount(count)}`,
    "",
    "매 턴 반드시 respond 도구를 한 번 호출해서 판정(call)과 답장(reply)을 제출한다. 도구 밖에 다른 텍스트는 쓰지 않는다.",
  ].join("\n");
}

function buildTipsSystem(): string {
  return [
    "너는 직장·친구 사이 대화 코치다. 사용자는 야구 팬인 상대와 대화 연습을 마쳤다. 수동 종료일 수도 있으므로 3아웃이나 실패라고 단정하지 않는다.",
    `대화를 보고, 다음에 어떤 방식으로 말하면 좋을지 팁 ${CHAT_TIP_COUNT}개를 준다.`,
    "- 정확한 대사를 주지 말고 말하는 방식을 알려준다.",
    `- title은 ${CHAT_TIP_TITLE_MAX}자 이내, desc는 한 문장.`,
    "반드시 tips 도구를 한 번 호출해서 제출한다. 도구 밖에 다른 텍스트는 쓰지 않는다.",
  ].join("\n");
}

/** 화면 메시지 → Claude 메시지. 최근 N개만, 첫 메시지는 user가 되도록 */
function toClaudeMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  const recent: Anthropic.MessageParam[] = messages
    .slice(-CHAT_RECENT_MESSAGES)
    .filter((m) => m.text.trim().length > 0)
    .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));

  if (recent[0]?.role === "assistant") {
    recent.unshift({ role: "user", content: "(대화 시작)" });
  }
  return recent;
}

function toTranscript(profile: ChatProfile, messages: ChatMessage[]): string {
  const relation = profile.relation === "boss" ? "직장 상사" : "친구";
  const lines = messages.map((m) => `${m.role === "user" ? "사용자" : profile.displayName}: ${m.text}`);
  return [
    `상대: ${profile.displayName} (${relation}, KBO ${profile.team} 팬)`,
    `상대의 오늘 기분: ${profile.mood} — ${profile.moodReason}`,
    "",
    "## 대화",
    ...lines,
  ].join("\n");
}

// ── Claude 호출 ───────────────────────────────────────

async function callTool(
  system: string,
  messages: Anthropic.MessageParam[],
  tool: Anthropic.Tool,
): Promise<unknown> {
  if (!AI_SERVICE_ENABLED) return null;
  const response = await getClient().messages.create(
    {
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages,
      tools: [tool],
      tool_choice: { type: "auto", disable_parallel_tool_use: true },
      output_config: { effort: "low" },
    },
    REQUEST_OPTIONS,
  );

  if (response.stop_reason === "refusal") return null;
  const block = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === tool.name,
  );
  return block?.input ?? null;
}

function parseRespond(input: unknown): { call: Call; reply: string } | null {
  if (!input || typeof input !== "object") return null;
  const { call, reply } = input as Record<string, unknown>;
  if (call !== "ball" && call !== "strike") return null;
  if (typeof reply !== "string" || reply.trim().length === 0) return null;
  return { call, reply: reply.trim() };
}

function parseTips(input: unknown): Tip[] | null {
  if (!input || typeof input !== "object") return null;
  const { items } = input as Record<string, unknown>;
  if (!Array.isArray(items)) return null;
  const tips = items
    .filter(
      (t): t is Tip =>
        !!t &&
        typeof t === "object" &&
        typeof (t as Tip).title === "string" &&
        typeof (t as Tip).desc === "string" &&
        (t as Tip).title.trim().length > 0 &&
        (t as Tip).desc.trim().length > 0,
    )
    .slice(0, CHAT_TIP_COUNT)
    .map((t) => ({ title: t.title.trim(), desc: t.desc.trim() }));
  return tips.length === CHAT_TIP_COUNT ? tips : null;
}

async function generateReply(req: ChatRequest): Promise<{ call: Call; reply: string } | null> {
  try {
    const input = await callTool(
      buildChatSystem(req.profile, req.count),
      toClaudeMessages(req.messages),
      RESPOND_TOOL,
    );
    return parseRespond(input);
  } catch (e) {
    console.warn("[chat] respond 호출 실패:", (e as Error).message);
    return null;
  }
}

async function generateTips(profile: ChatProfile, messages: ChatMessage[]): Promise<Tip[] | null> {
  try {
    // 대화 전체를 한 덩어리 텍스트로 넘깁니다 (마지막이 상대 답장이어도 user 메시지가 되도록).
    const input = await callTool(
      buildTipsSystem(),
      [{ role: "user", content: toTranscript(profile, messages) }],
      TIPS_TOOL,
    );
    return parseTips(input);
  } catch (e) {
    console.warn("[chat] tips 호출 실패:", (e as Error).message);
    return null;
  }
}

// ── 진입점 ────────────────────────────────────────────

/** 사용자의 마지막 말에 대한 답장·판정·볼카운트(+종료 시 팁). 실패해도 항상 응답을 돌려줍니다. */
export async function runChatTurn(req: ChatRequest): Promise<ChatResponse> {
  const lastText = req.messages[req.messages.length - 1].text;

  const ai = await generateReply(req);
  const call = ai?.call ?? judgeByKeywords(lastText);
  const reply = ai?.reply ?? fallbackReply(call, req.profile.relation);
  let fallback = ai === null;

  const next = applyCall(req.count, call);
  const result: ChatResponse = { reply, call, count: next.count, ended: next.ended, fallback };

  if (next.ended) {
    const tips = await generateTips(req.profile, [...req.messages, { role: "partner", text: reply }]);
    if (!tips) fallback = true;
    result.tips = tips ?? CHAT_FALLBACK_TIPS.map((t) => ({ ...t }));
    result.fallback = fallback;
  }

  return result;
}

export async function finishChat(profile:ChatProfile,messages:ChatMessage[]):Promise<{tips:Tip[];fallback:boolean}>{
 const tips=messages.some(m=>m.role==="user")?await generateTips(profile,messages):null;
 return {tips:tips??CHAT_FALLBACK_TIPS.map(t=>({...t})),fallback:tips===null};
}
