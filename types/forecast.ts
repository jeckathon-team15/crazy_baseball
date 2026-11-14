// 계약(contract) 파일. 필드 이름·단위를 바꾸려면 총괄에게 요청하세요.

export type BossInput = {
  bossTitle: string; // "과장님", "팀장님"
  team: string; // 팀 이름
  player: string; // 선수 이름
  favoriteMenus: string[]; // 1~5개
};

export type GameResult = {
  date: string; // "2026-10-01"
  opponent: string;
  teamScore: number;
  oppScore: number;
  result: "W" | "L" | "D";
};

export type PlayerGame = {
  date: string;
  role: "hitter" | "pitcher";
  summary: string; // "4타수 0안타 2삼진", "5이닝 6실점"
  rating: number; // -2(최악) ~ +2(최고)
};

export type Performance = {
  team: string;
  player: string;
  teamGames: GameResult[]; // 최근 순, 최대 10개
  playerGames: PlayerGame[]; // 최근 순, 최대 10개
  teamScore: number; // -100 ~ 100
  playerScore: number; // -100 ~ 100
  highlights: string[]; // "5연패 중", "최근 3경기 무안타"
  source: "sample" | "live";
  asOf: string; // 데이터 기준일
};

export type Mood = "매우 안 좋음" | "안 좋음" | "보통" | "좋음" | "매우 좋음";

export type Forecast = {
  mood: Mood;
  moodScore: number; // -100 ~ 100
  headline: string; // "LG 오지환 선수 부진으로 내일 과장님 기분은 안 좋음"
  reason: string; // 근거 2~3문장
  lunch: { menu: string; comment: string }; // favoriteMenus 중 하나
  tips: string[]; // 대처 요령 2~3개
  fallback: boolean; // AI 실패로 기본 문구를 썼는지
};

export type ForecastResponse = {
  input: BossInput;
  performance: Performance;
  forecast: Forecast;
};
