import type { ChatMessage, ChatProfile, ChatRequest, Count } from "@/types/chat";
import { CHAT_START_COUNT, AI_SERVICE_ENABLED } from "@/lib/config";
import { runChatTurn, finishChat } from "@/lib/ai/chat";

// POST /api/chat — 대화 한 턴. 서버는 아무것도 저장하지 않고, 화면이 매번 대화 전체와 볼카운트를 보냅니다.

function bad(error: string) {
  return Response.json({ error }, { status: 400 });
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function parseProfile(v: unknown): ChatProfile | null {
  if (!isObject(v)) return null;
  const { relation, displayName, team, mood, moodReason } = v;
  if (relation !== "boss" && relation !== "friend") return null;
  if (typeof displayName !== "string" || displayName.trim() === "") return null;
  if (typeof team !== "string" || team.trim() === "") return null;
  return {
    relation,
    displayName: displayName.trim(),
    team: team.trim(),
    mood: typeof mood === "string" ? mood.trim() : "",
    moodReason: typeof moodReason === "string" ? moodReason.trim() : "",
  };
}

function parseMessages(v: unknown): ChatMessage[] | null {
  if (!Array.isArray(v)) return null;
  const messages: ChatMessage[] = [];
  for (const m of v) {
    if (!isObject(m) || (m.role !== "user" && m.role !== "partner") || typeof m.text !== "string") {
      return null;
    }
    messages.push({ role: m.role, text: m.text });
  }
  return messages;
}

/** 볼카운트가 없거나 이상하면 시작 카운트로 */
function parseCount(v: unknown): Count {
  const ok = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;
  if (isObject(v) && ok(v.balls) && ok(v.strikes) && ok(v.outs)) {
    return { balls: v.balls, strikes: v.strikes, outs: v.outs };
  }
  return { ...CHAT_START_COUNT };
}

export async function POST(request: Request) {
  if (!AI_SERVICE_ENABLED) return Response.json({ error: "시연이 종료되어 AI 대화 및 대화 분석 기능을 중단했습니다." }, { status: 410 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad("요청 형식이 올바르지 않습니다. JSON으로 보내 주세요.");
  }
  if (!isObject(body)) return bad("요청 형식이 올바르지 않습니다.");

  const profile = parseProfile(body.profile);
  if (!profile) return bad("상대 정보(profile)가 없거나 올바르지 않습니다.");

  const messages = parseMessages(body.messages);
  if (!messages) return bad("대화 목록(messages) 형식이 올바르지 않습니다.");

  if(body.action === "finish") return Response.json(await finishChat(profile,messages));

  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") return bad("마지막 메시지는 사용자의 말이어야 합니다.");
  if (last.text.trim() === "") return bad("메시지를 입력해 주세요.");

  const req: ChatRequest = { profile, messages, count: parseCount(body.count) };
  return Response.json(await runChatTurn(req));
}
