import type { BossInput, ForecastResponse } from "@/types/forecast";

// 클라이언트에서 /api/forecast를 호출합니다. (웹 담당 관리)

export async function getForecast(input: BossInput): Promise<ForecastResponse> {
  let res: Response;
  try {
    res = await fetch("/api/forecast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
  }

  const data: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : `예보를 불러오지 못했습니다. (${res.status})`;
    throw new Error(message);
  }

  if (!data) throw new Error("예보 응답이 비어 있습니다.");
  return data as ForecastResponse;
}
