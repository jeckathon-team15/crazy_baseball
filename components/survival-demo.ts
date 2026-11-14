// Local, deterministic UI preview only. Replace through an agreed chat API contract.
export const DEMO_POLICY = {
  outLimit: 3,
  initialTension: 42,
  maxTension: 100,
  riskyChange: 26,
  recoveryChange: -17,
  lunchChange: -12,
  empathyChange: -10,
} as const;

export type Emotion = "calm" | "annoyed" | "angry" | "tired";
export type DemoReply = { reply: string; reason: string; out: boolean };
export type DemoState = {
  outs: number;
  tension: number;
  emotion: Emotion;
  ended: boolean;
  last: DemoReply;
};

export const initialDemo: DemoState = {
  outs: 0,
  tension: DEMO_POLICY.initialTension,
  emotion: "tired",
  ended: false,
  last: { reply: "점심시간이네요. …어제 경기 때문에 잠을 좀 설쳤어요.", reason: "", out: false },
};

export function playDemoTurn(state: DemoState, message: string): DemoState {
  const text = message.trim();
  if (!text || state.ended) return state;
  let last: DemoReply;
  let delta: number = 0;
  if (/과자|커피/.test(text) && /말고|이야기|얘기|드세|드실|죄송/.test(text)) {
    last = { reply: "아, 과자였어요? 제가 좀 예민했네요. 커피랑 같이 먹을게요.", reason: "오해를 풀었어요. 표정은 풀려도, 이미 기록된 아웃은 남아요.", out: false };
    delta = DEMO_POLICY.recoveryChange;
  } else if (/홈런|끝내기|역전|병살|공놀이|못하|졌/.test(text)) {
    last = { reply: "…지금 그 이야기 하는 거예요? 어제 9회 말에 무슨 일이 있었는지 아시죠?", reason: "가상 경기에서 끝내기 홈런으로 진 상황을 건드렸어요.", out: true };
    delta = DEMO_POLICY.riskyChange;
  } else if (/점심|국밥|밥|메뉴|드시고|먹고/.test(text)) {
    last = { reply: "오늘은 뜨끈한 국밥이나 먹죠. 야구 얘기 안 하고 밥만 먹으니까 좀 낫네요.", reason: "편안한 식사 이야기로 분위기를 바꿨어요.", out: false };
    delta = DEMO_POLICY.lunchChange;
  } else if (/죄송|미안|아쉬|괜찮|고생|응원/.test(text)) {
    last = { reply: "뭐, 그럴 때도 있는 거죠. 다음 경기는 잘하겠죠. 신경 써줘서 고마워요.", reason: "경기력을 평가하기보다 좋아하는 마음을 알아줬어요.", out: false };
    delta = DEMO_POLICY.empathyChange;
  } else {
    last = { reply: "네, 듣고 있어요. 오늘은 조금 조용히 있고 싶긴 하네요. 점심 이야기는 괜찮아요.", reason: "이번 말은 무사히 넘어갔어요.", out: false };
  }
  const outs = Math.min(DEMO_POLICY.outLimit, state.outs + Number(last.out));
  const tension = Math.max(0, Math.min(DEMO_POLICY.maxTension, state.tension + delta));
  const ended = outs === DEMO_POLICY.outLimit;
  if (ended) last = { ...last, reply: "점심은… 각자 먹죠. 오늘은 여기까지 이야기합시다." };
  return { outs, tension, ended, last, emotion: ended ? "angry" : last.out ? "annoyed" : delta < 0 ? "calm" : "tired" };
}
