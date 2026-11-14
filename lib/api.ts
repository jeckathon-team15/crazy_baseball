import type { ChatRequest, ChatResponse } from "@/types/chat";
import type { BossInput, ForecastResponse } from "@/types/forecast";
import type { DailyMood } from "@/lib/analysis/daily-mood";

export async function getDailyMood(input:{team:string;date:string},signal?:AbortSignal):Promise<DailyMood>{
 const response=await fetch(`/api/daily-mood?${new URLSearchParams(input)}`,{signal,cache:"no-store"});
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw new Error(data?.error??"경기 결과를 불러오지 못했어요.");
 if(!data||!["ready","pending","no_game"].includes(data.status)||!Array.isArray(data.games)||data.date!==input.date)throw new Error("경기 응답을 확인할 수 없어요.");
 return data as DailyMood;
}

// 클라이언트에서 /api/forecast를 호출합니다. (웹 담당 관리)

export async function getForecast(input: BossInput, signal?: AbortSignal): Promise<ForecastResponse> {
  let res: Response;
  try {
    res = await fetch("/api/forecast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
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

/** 대화 한 턴. 대화 전체와 볼카운트를 매번 보냅니다. 실패 시 서버의 error 메시지로 throw */
export async function sendChat(req: ChatRequest): Promise<ChatResponse> {
  let res: Response;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
  } catch {
    throw new Error("서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
  }

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : `답장을 받지 못했습니다. (${res.status})`;
    throw new Error(message);
  }
  if (!data) throw new Error("답장 응답이 비어 있습니다.");
  return data as ChatResponse;
}

export async function finishChatReview(req:ChatRequest):Promise<{tips:import("@/types/chat").Tip[];fallback:boolean}>{
 const res=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...req,action:"finish"})});
 if(!res.ok)throw new Error("대화 분석을 불러오지 못했어요. 다시 시도해주세요.");
 return res.json();
}
