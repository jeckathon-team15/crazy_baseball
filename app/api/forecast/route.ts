import type { BossInput, ForecastResponse } from "@/types/forecast";
import { FAVORITE_MENUS_RANGE } from "@/lib/config";
import { MOCK_RESPONSES } from "@/lib/mock";

// 껍데기 구현: 600ms 뒤 샘플 응답을 돌려줍니다. (분석 담당이 나중에 진짜로 교체)

const MOCK_DELAY_MS = 600;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function validate(body: unknown): BossInput | string {
  if (!body || typeof body !== "object") return "입력값이 비어 있습니다.";
  const b = body as Record<string, unknown>;

  if (!isNonEmptyString(b.bossTitle)) return "상사 호칭을 입력해 주세요.";
  if (!isNonEmptyString(b.team)) return "응원하는 팀을 입력해 주세요.";
  if (!isNonEmptyString(b.player)) return "좋아하는 선수를 입력해 주세요.";

  const menus = Array.isArray(b.favoriteMenus) ? b.favoriteMenus.filter(isNonEmptyString) : [];
  if (menus.length < FAVORITE_MENUS_RANGE.min || menus.length > FAVORITE_MENUS_RANGE.max) {
    return `좋아하는 메뉴를 ${FAVORITE_MENUS_RANGE.min}~${FAVORITE_MENUS_RANGE.max}개 입력해 주세요.`;
  }

  return {
    bossTitle: b.bossTitle.trim(),
    team: b.team.trim(),
    player: b.player.trim(),
    favoriteMenus: menus.map((m) => m.trim()),
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const input = validate(body);
  if (typeof input === "string") {
    return Response.json({ error: input }, { status: 400 });
  }

  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));

  // 같은 입력이면 같은 샘플이 나오도록 간단한 해시로 선택
  const key = [...(input.team + input.player)].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const response: ForecastResponse = MOCK_RESPONSES[key % MOCK_RESPONSES.length];

  return Response.json(response);
}
