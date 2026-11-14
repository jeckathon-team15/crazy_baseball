import type { BossInput, ForecastResponse } from "@/types/forecast";
import { DISPLAY_NAME_RANGE, FAVORITE_MENUS_RANGE } from "@/lib/config";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createForecastResponse, createUnavailableForecast, getTeamSnapshotStatus, type AnalysisSnapshot } from "@/lib/analysis/forecast-snapshot";
import { normalizeTeam, timestamp } from "@/lib/analysis/game-results";
import { predictMood } from "@/lib/analysis/mood-model";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function validate(body: unknown): BossInput | string {
  if (!body || typeof body !== "object") return "입력값이 비어 있습니다.";
  const b = body as Record<string, unknown>;

  if (b.relation !== "boss" && b.relation !== "friend") return "관계(직장 상사/친구)를 선택해 주세요.";
  if (!isNonEmptyString(b.displayName)) return "부르는 이름을 입력해 주세요.";
  if (b.displayName.trim().length > DISPLAY_NAME_RANGE.max) {
    return `부르는 이름은 ${DISPLAY_NAME_RANGE.max}자 이내로 입력해 주세요.`;
  }
  if (!isNonEmptyString(b.team)) return "응원하는 팀을 입력해 주세요.";
  if (!isNonEmptyString(b.player)) return "좋아하는 선수를 입력해 주세요.";

  const menus = Array.isArray(b.favoriteMenus) ? b.favoriteMenus.filter(isNonEmptyString) : [];
  if (menus.length < FAVORITE_MENUS_RANGE.min || menus.length > FAVORITE_MENUS_RANGE.max) {
    return `좋아하는 메뉴를 ${FAVORITE_MENUS_RANGE.min}~${FAVORITE_MENUS_RANGE.max}개 입력해 주세요.`;
  }

  return {
    relation: b.relation,
    displayName: b.displayName.trim(),
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

  try {
    const path = process.env.MOOD_SNAPSHOT_PATH?.trim() ||
      join(process.cwd(), "lib", "analysis", "data", "forecast-snapshot.json");
    const snapshot: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!snapshot || typeof snapshot !== "object" || !("version" in snapshot) || snapshot.version !== 1 ||
        !("source" in snapshot) || !["sample", "live"].includes(String(snapshot.source)) ||
        !("asOf" in snapshot) || typeof snapshot.asOf !== "string" || timestamp(snapshot.asOf) === null ||
        !("teams" in snapshot) || !Array.isArray(snapshot.teams)) {
      throw new Error("예보 데이터 형식 오류");
    }
    const analysis = snapshot as AnalysisSnapshot;
    const now = Date.now();
    const status = getTeamSnapshotStatus(analysis, input.team, now);
    if (status !== "ready") {
      // 자료가 없거나 오래된 팀도 화면이 깨지지 않게 기본 예보(fallback: true)로 응답합니다.
      return Response.json({ ...createUnavailableForecast(input, analysis, status), prediction: { method: "unavailable" } });
    }
    const response: ForecastResponse | null = createForecastResponse(input, analysis);
    if (!response) throw new Error("예보 데이터 형식 오류");
    const team = analysis.teams.find((item) => item.team === normalizeTeam(input.team));
    const modelPath = process.env.MOOD_MODEL_PATH?.trim() ||
      join(process.cwd(), "lib", "analysis", "data", "mood-model.json");
    let model: unknown = null;
    try {
      model = JSON.parse(await readFile(modelPath, "utf8"));
    } catch {
      // The rule-based forecast remains available when no model is installed.
    }
    const prediction = team
      ? predictMood(model, team.games[0], team.sentiment, analysis.source, now)
      : null;
    if (!prediction) {
      return Response.json({ ...response, prediction: { method: "rule_based" } });
    }
    const warning = prediction.mood === "매우 안 좋음"
      ? "야친자 경보" : prediction.mood === "안 좋음" ? "야친자 주의보" : "야친자 예보";
    return Response.json({
      ...response,
      forecast: {
        ...response.forecast,
        mood: prediction.mood,
        moodScore: prediction.moodScore,
        headline: `${warning} · ${input.displayName}의 예상 기분은 ${prediction.mood}`,
        reason: `${response.forecast.reason} 사용자 기분 기록을 학습한 공통 모델을 적용했습니다.`,
        tips: [
          "최근 경기 결과를 먼저 확인해 보세요.",
          prediction.mood === "안 좋음" || prediction.mood === "매우 안 좋음"
            ? "야구 이야기는 분위기를 보고 꺼내세요." : "경기 이야기를 가볍게 나눠 보세요.",
        ],
      },
      prediction,
    });
  } catch {
    return Response.json({ error: "예보 데이터를 읽지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 503 });
  }
}
