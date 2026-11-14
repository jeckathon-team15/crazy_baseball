import { useId } from "react";
import type { Emotion } from "./survival-demo";

export default function BaseballFace({ emotion = "tired" }: { emotion?: Emotion }) {
  const id = useId().replaceAll(":", "");
  const tense = emotion === "annoyed" || emotion === "angry";
  return (
    <svg className="baseball-face" viewBox="0 0 210 190" role="img" aria-label={emotion === "calm" ? "표정이 풀린 야구공" : tense ? "표정이 굳은 야구공" : "잠을 설친 야구공"}>
      <defs><radialGradient id={id} cx="35%" cy="26%" r="76%"><stop stopColor="#fffef8"/><stop offset=".76" stopColor="#f2eee4"/><stop offset="1" stopColor="#ded7c9"/></radialGradient></defs>
      <ellipse cx="105" cy="175" rx="57" ry="6" fill="#3a3023" opacity=".08"/>
      <path d="M70 159q-10 15-19 10m91-10q10 15 19 10" fill="none" stroke="#493e37" strokeWidth="4" strokeLinecap="round"/>
      <path d="M38 100q-17 2-18 18m152-18q17 2 18 18" fill="none" stroke="#493e37" strokeWidth="4" strokeLinecap="round"/>
      <circle cx="105" cy="91" r="74" fill={`url(#${id})`} stroke="#c4b8a8" strokeWidth="1.3"/>
      <path d="M57 35q46 55 0 112m96-112q-46 55 0 112" fill="none" stroke="#b46b6b" strokeWidth="2" strokeDasharray="4 6"/>
      {tense ? <path d="m76 73 17 5m25 0 17-5" stroke="#5c4140" strokeWidth="4" strokeLinecap="round"/> : <path d="m76 76 17-2m25 0 17 2" stroke="#75665b" strokeWidth="3" strokeLinecap="round"/>}
      <ellipse cx="84" cy="91" rx="4" ry={tense ? 8 : 6} fill="#453a32"/><ellipse cx="126" cy="91" rx="4" ry={tense ? 8 : 6} fill="#453a32"/>
      <path d={emotion === "calm" ? "M94 114q11 13 22 0" : tense ? "M94 119q11-12 22 0" : "M96 116h18"} fill="none" stroke="#665047" strokeWidth="3" strokeLinecap="round"/>
      <ellipse cx="68" cy="109" rx="9" ry="4" fill="#d6a4a0" opacity=".55"/><ellipse cx="142" cy="109" rx="9" ry="4" fill="#d6a4a0" opacity=".55"/>
      {emotion === "angry" && <path d="m160 38 5 8m5-10-6 3m10 7-8-1" stroke="#93444d" strokeWidth="2.5" fill="none"/>}
    </svg>
  );
}
