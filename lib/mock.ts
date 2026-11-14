import type { ForecastResponse } from "@/types/forecast";

// 화면·API 개발용 샘플 응답. 실제 데이터가 아닙니다.

/** 매우 좋음 사례: 팀 연승 + 선수 맹타 */
export const MOCK_SUNNY = {
  input: {
    bossTitle: "과장님",
    team: "LG 트윈스",
    player: "오지환",
    favoriteMenus: ["삼겹살", "김치찌개", "냉면"],
  },
  performance: {
    team: "LG 트윈스",
    player: "오지환",
    teamGames: [
      { date: "2026-10-01", opponent: "두산 베어스", teamScore: 7, oppScore: 2, result: "W" },
      { date: "2026-09-30", opponent: "두산 베어스", teamScore: 5, oppScore: 4, result: "W" },
      { date: "2026-09-28", opponent: "KIA 타이거즈", teamScore: 9, oppScore: 1, result: "W" },
      { date: "2026-09-27", opponent: "KIA 타이거즈", teamScore: 3, oppScore: 3, result: "D" },
      { date: "2026-09-26", opponent: "SSG 랜더스", teamScore: 6, oppScore: 2, result: "W" },
    ],
    playerGames: [
      { date: "2026-10-01", role: "hitter", summary: "4타수 3안타 1홈런 3타점", rating: 2 },
      { date: "2026-09-30", role: "hitter", summary: "4타수 2안타 1타점", rating: 1 },
      { date: "2026-09-28", role: "hitter", summary: "5타수 2안타 1볼넷", rating: 1 },
    ],
    teamScore: 85,
    playerScore: 80,
    highlights: ["4연승 중", "오지환 최근 3경기 연속 멀티히트"],
    source: "sample",
    asOf: "2026-10-01",
  },
  forecast: {
    mood: "매우 좋음",
    moodScore: 83,
    headline: "LG 오지환 선수 맹타로 내일 과장님 기분은 매우 좋음",
    reason:
      "LG 트윈스가 최근 5경기 4승 1무로 상승세입니다. 오지환 선수도 3경기 연속 멀티히트를 기록해 과장님의 출근길 표정이 밝을 것으로 예상됩니다.",
    lunch: { menu: "삼겹살", comment: "축하 분위기엔 고기. 오늘은 과장님이 쏠 확률도 있습니다." },
    tips: [
      "아침 인사에 어제 경기 홈런 이야기를 곁들이세요.",
      "미뤄둔 결재는 오늘 올리는 것이 좋습니다.",
    ],
    fallback: false,
  },
} satisfies ForecastResponse;

/** 매우 안 좋음 사례: 팀 연패 + 투수 난조. 긴 선수 이름, 메뉴 1개 */
export const MOCK_THUNDER = {
  input: {
    bossTitle: "팀장님",
    team: "한화 이글스",
    player: "알렉산더 크리스토퍼 몽고메리-라미레스",
    favoriteMenus: ["순댓국"],
  },
  performance: {
    team: "한화 이글스",
    player: "알렉산더 크리스토퍼 몽고메리-라미레스",
    teamGames: [
      { date: "2026-10-01", opponent: "삼성 라이온즈", teamScore: 1, oppScore: 11, result: "L" },
      { date: "2026-09-30", opponent: "삼성 라이온즈", teamScore: 2, oppScore: 5, result: "L" },
      { date: "2026-09-28", opponent: "롯데 자이언츠", teamScore: 0, oppScore: 4, result: "L" },
      { date: "2026-09-27", opponent: "롯데 자이언츠", teamScore: 3, oppScore: 8, result: "L" },
      { date: "2026-09-26", opponent: "NC 다이노스", teamScore: 4, oppScore: 6, result: "L" },
    ],
    playerGames: [
      { date: "2026-10-01", role: "pitcher", summary: "2⅓이닝 8실점 3볼넷", rating: -2 },
      { date: "2026-09-25", role: "pitcher", summary: "4이닝 6실점", rating: -2 },
    ],
    teamScore: -90,
    playerScore: -95,
    highlights: ["5연패 중", "최근 2경기 선발 조기 강판"],
    source: "sample",
    asOf: "2026-10-01",
  },
  forecast: {
    mood: "매우 안 좋음",
    moodScore: -92,
    headline: "한화 몽고메리-라미레스 선수 난조로 내일 팀장님 기분은 매우 안 좋음",
    reason:
      "한화 이글스가 5연패에 빠졌고, 어제는 1-11 대패였습니다. 선발 몽고메리-라미레스 선수가 2경기 연속 조기 강판되며 팀장님의 인내심이 한계에 다다른 것으로 분석됩니다.",
    lunch: { menu: "순댓국", comment: "뜨끈한 국물로 속을 달래 드리세요. 메뉴 선택권은 팀장님께." },
    tips: [
      "오전 중 보고는 피하고 오후로 미루세요.",
      "야구 이야기는 절대 먼저 꺼내지 마세요.",
      "가능하면 외근·재택 일정을 확인해 보세요.",
    ],
    fallback: false,
  },
} satisfies ForecastResponse;

export const MOCK_RESPONSES = [MOCK_SUNNY, MOCK_THUNDER] satisfies ForecastResponse[];
