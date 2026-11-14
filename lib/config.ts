import type { Mood } from "@/types/forecast";

// 숫자 기준은 모두 이 파일에 모읍니다. (총괄 관리)

/** moodScore 하한선 → 기분. 위에서부터 순서대로 검사합니다. */
export const MOOD_THRESHOLDS: ReadonlyArray<{ min: number; mood: Mood }> = [
  { min: 60, mood: "매우 좋음" },
  { min: 20, mood: "좋음" },
  { min: -20, mood: "보통" },
  { min: -60, mood: "안 좋음" },
  { min: -Infinity, mood: "매우 안 좋음" },
];

/** moodScore(-100~100)를 기분 단계로 변환 */
export function moodFromScore(score: number): Mood {
  return MOOD_THRESHOLDS.find((t) => score >= t.min)!.mood;
}

/** moodScore = teamScore * team + playerScore * player */
export const SCORE_WEIGHTS = {
  team: 0.6,
  player: 0.4,
} as const;

export const SCORE_RANGE = { min: -100, max: 100 } as const;
export const PLAYER_RATING_RANGE = { min: -2, max: 2 } as const;
export const MAX_RECENT_GAMES = 10;

/** 경기 자료가 없는 팀에 주는 기본 예보 점수 (보통) */
export const FALLBACK_MOOD_SCORE = 0;
export const FAVORITE_MENUS_RANGE = { min: 1, max: 5 } as const;

/** 부르는 이름 글자 수 (앞뒤 공백 제거 후) */
export const DISPLAY_NAME_RANGE = { min: 1, max: 10 } as const;

export const AI_TIMEOUT_MS = 10000;

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-sonnet-5-5";

// ── 대화 시뮬레이터 ──────────────────────────────────────

/** 화면이 보내는 시작 볼카운트 (2아웃에서 시작) */
export const CHAT_START_COUNT = { balls: 0, strikes: 0, outs: 2 } as const;

/** 볼카운트 규칙: 볼 4개면 카운트 초기화, 스트라이크 3개면 1아웃, 3아웃이면 대화 종료 */
export const CHAT_COUNT_RULES = { ballsReset: 4, strikesForOut: 3, outsToEnd: 3 } as const;

/** Claude에 보내는 최근 메시지 개수 */
export const CHAT_RECENT_MESSAGES = 20;

/** 대화 종료 시 받을 팁 개수, 팁 제목 최대 글자 수 */
export const CHAT_TIP_COUNT = 3;
export const CHAT_TIP_TITLE_MAX = 15;

/** AI 실패 시 판정용 위험 단어. 하나라도 있으면 strike */
export const CHAT_DANGER_WORDS = [
  "졌",
  "패배",
  "연패",
  "못하",
  "망했",
  "최하위",
  "가을야구",
  "탈락",
  "역전패",
] as const;

/** AI 실패 시 기본 답장 */
export const CHAT_FALLBACK_REPLY = {
  strike: "……그 얘기는 꺼내지 마.",
  ball: { boss: "그래, 알겠어.", friend: "응, 그렇지 뭐." },
} as const;

/** 팁 생성 실패 시 기본 팁 */
export const CHAT_FALLBACK_TIPS = [
  {
    title: "진 경기 얘기는 먼저 꺼내지 않기",
    desc: "결과나 선수 실수보다는 상대가 먼저 꺼낼 때까지 기다려요",
  },
  {
    title: "다음 경기에 대한 기대로 이야기하기",
    desc: "지난 경기 평가 대신 앞으로 잘될 거라는 쪽으로 말해요",
  },
  {
    title: "좋아하는 다른 주제로 돌리기",
    desc: "점심 메뉴나 주말 계획처럼 기분 좋아질 화제를 꺼내요",
  },
] as const;
