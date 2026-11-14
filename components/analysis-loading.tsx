import Image, { type StaticImageData } from "next/image";
import { LOADING_MOTION_MS, type AnalysisStage } from "./analysis-progress";

const stages = [
  { base: "1루", title: "경기 자료 요청", pending: "서버에서 경기 자료를 불러오는 중" },
  { base: "2루", title: "응답 수신", pending: "경기 자료를 받았어요" },
  { base: "3루", title: "결과 화면 준비", pending: "받은 자료로 결과 화면을 준비하는 중" },
  { base: "홈", title: "준비 완료", pending: "결과가 준비됐어요!" },
];
const points = [{ x:160,y:230 },{ x:270,y:120 },{ x:160,y:10 },{ x:50,y:120 },{ x:160,y:230 }];

export default function AnalysisLoading({stage,team,logo,onCancel}:{stage:AnalysisStage;team:string;logo:StaticImageData;onCancel:()=>void}) {
  return <div className="analysis-loading" role="status" aria-live="polite" aria-busy={stage<4}>
    <section className="analysis-loading-card">
      <svg className="analysis-field" viewBox="0 -20 320 300" role="img" aria-label={`주자 ${stage===0?'홈에서 출발 준비':stages[stage-1].base+' 도착'}`}>
        <polygon points="160,230 270,120 160,10 50,120" fill="#E7F5E9"/>
        <path d="M160 230L270 120L160 10L50 120L160 230" fill="none" stroke="#D1D1D6" strokeWidth="8" strokeDasharray="1 13" strokeLinecap="round"/>
        <path className="analysis-route" d="M160 230L270 120L160 10L50 120L160 230" pathLength="4" fill="none" stroke="#4A73DF" strokeWidth="8" strokeLinecap="round" strokeDasharray="4" strokeDashoffset={4-stage} style={{transitionDuration:`${LOADING_MOTION_MS}ms`}}/>
        {points.slice(1).map((p,i)=><g key={i}><rect x={p.x-13} y={p.y-13} width="26" height="26" rx="3" transform={`rotate(45 ${p.x} ${p.y})`} fill={stage>=i+1?'#4A73DF':'white'} stroke={stage>=i+1?'#4A73DF':'#C7C7CC'} strokeWidth="4"/><text x={p.x+(i===0?31:i===2?-30:0)} y={p.y+(i===1?-24:i===3?42:6)} textAnchor={i===0?'start':i===2?'end':'middle'} fill={stage>=i+1?'#1C1C1E':'#8E8E93'} fontSize="16" fontWeight="700">{stages[i].base}</text></g>)}
        <g className="analysis-runner" style={{offsetPath:'path("M160 230L270 120L160 10L50 120L160 230")',offsetDistance:`${stage*25}%`,offsetRotate:'0deg',transitionDuration:`${LOADING_MOTION_MS}ms`}}><circle className={stage===1?'analysis-waiting':''} r="18" fill="#4A73DF" opacity=".17"/><circle r="11" fill="#4A73DF" stroke="white" strokeWidth="4"/></g>
      </svg>
      <div className="analysis-loading-copy"><h1>{stage===4?'분석 결과 준비 완료':'경기력 불러오는 중'}</h1><p>{stage===0?'홈에서 출발 준비':stages[stage-1].pending}</p><span><Image src={logo} alt="" width={24} height={24} style={{objectFit:'contain'}}/>{team} 경기 자료</span></div>
      <ol className="analysis-stages">{stages.map((item,i)=><li key={item.base} data-state={stage>i+1||stage===4?'done':stage===i+1?'active':'waiting'} aria-current={stage===i+1?'step':undefined}><span><b>{item.base}</b>{item.title}</span><small>{stage>i+1||stage===4?'완료':stage===i+1?'진행 중':'대기'}</small></li>)}</ol>
      <button type="button" className="analysis-cancel" onClick={onCancel}>분석 취소</button>
    </section>
  </div>;
}
