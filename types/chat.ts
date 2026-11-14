// 대화 시뮬레이터 계약. 필드 이름·모양을 바꾸려면 총괄에게 요청하세요.

export type Relation = "boss" | "friend";

export type ChatProfile = {
  relation: Relation;
  displayName: string;
  team: string;
  mood: string;
  moodReason: string;
};

export type ChatMessage = { role: "user" | "partner"; text: string };

export type Count = { balls: number; strikes: number; outs: number };

export type ChatRequest = { profile: ChatProfile; messages: ChatMessage[]; count: Count };

export type Tip = { title: string; desc: string };

export type ChatResponse = {
  reply: string;
  call: "ball" | "strike";
  count: Count;
  ended: boolean;
  tips?: Tip[];
  fallback: boolean;
};
