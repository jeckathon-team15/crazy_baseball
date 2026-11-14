// Browser adapter for a frontend hosted in the same Next.js project.
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

export class BaseballApiError extends Error {
  /** @param {string} message @param {number} [status] */
  constructor(message, status = 0) {
    super(message);
    this.name = "BaseballApiError";
    this.status = status;
  }
}

/** @param {unknown} value @param {string} label */
function required(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new BaseballApiError(`${label} 선택해 주세요.`);
  return value.trim();
}

/** @param {string} url @param {RequestInit} init */
async function requestJson(url, init) {
  let response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new BaseballApiError("서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    // Hosting platforms may return a non-JSON error body.
  }
  if (!response.ok) {
    const message = response.status === 413
      ? "업로드 데이터가 너무 큽니다. 파일 전체 크기를 4MB 이내로 줄여 주세요."
      : typeof data?.error === "string" ? data.error : "요청을 처리하지 못했습니다.";
    throw new BaseballApiError(message, response.status);
  }
  if (!data || typeof data !== "object") throw new BaseballApiError("API 응답 형식이 올바르지 않습니다.", response.status);
  return data;
}

/** @param {{team: string, date?: string}} options */
export async function getDailyMood({ team, date }) {
  const params = new URLSearchParams({ team: required(team, "응원팀을") });
  if (date !== undefined) params.set("date", required(date, "경기 날짜를"));
  return requestJson(`/api/daily-mood?${params}`, { cache: "no-store" });
}

/** @param {{team: string, date: string, games: Blob, posts: Blob, labels?: Blob | null}} options */
export async function analyzeCommunity({ team, date, games, posts, labels = null }) {
  const selectedTeam = required(team, "응원팀을");
  const selectedDate = required(date, "경기 날짜를");
  const files = [games, posts, ...(labels ? [labels] : [])];
  if (files.some((file) => !(file instanceof Blob) || file.size === 0 || file.size > MAX_FILE_BYTES)) {
    throw new BaseballApiError("CSV 파일은 각각 2MB 이하의 비어 있지 않은 파일이어야 합니다.");
  }
  if (files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_BYTES) {
    throw new BaseballApiError("업로드할 CSV 파일의 합계를 4MB 이내로 줄여 주세요.");
  }
  const form = new FormData();
  form.set("team", selectedTeam);
  form.set("date", selectedDate);
  form.set("games", games, "games.csv");
  form.set("posts", posts, "posts.csv");
  if (labels) form.set("labels", labels, "labels.csv");
  return requestJson("/api/daily-mood", { method: "POST", body: form });
}
