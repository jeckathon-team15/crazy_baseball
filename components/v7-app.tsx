"use client";

import { createElement, Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import design from "./v7-design.json";
import { MOODS, ORDER, type MoodKey } from "./v7-moods";
import { getForecast, sendChat } from "@/lib/api";
import { clearSession, getSession, setSession, type Session } from "@/lib/session";
import { CHAT_START_COUNT, DISPLAY_NAME_RANGE } from "@/lib/config";
import type { ForecastResponse, GameResult } from "@/types/forecast";
import type { ChatMessage, Count, Relation, Tip } from "@/types/chat";
import "./v7.css";
import AnalysisLoading from "./analysis-loading";
import { runAnalysis, waitForMotion, type AnalysisStage } from "./analysis-progress";
import Image from "next/image";
import lgLogo from "./assets/team-logos/lg_sym.png";
import doosanLogo from "./assets/team-logos/doosan_sym.png";
import kiaLogo from "./assets/team-logos/kia_sym.png";
import samsungLogo from "./assets/team-logos/samsung_sym.png";
import lotteLogo from "./assets/team-logos/lotte_sym.png";
import hanwhaLogo from "./assets/team-logos/hanwha_sym.png";
import ssgLogo from "./assets/team-logos/ssg_sym.png";
import ncLogo from "./assets/team-logos/nc_sym.png";
import ktLogo from "./assets/team-logos/img.png";
import kiwoomLogo from "./assets/team-logos/kiwoom_sym.png";

const teamLogos:Record<string,typeof lgLogo>={LG:lgLogo,두산:doosanLogo,KIA:kiaLogo,삼성:samsungLogo,롯데:lotteLogo,한화:hanwhaLogo,SSG:ssgLogo,NC:ncLogo,KT:ktLogo,키움:kiwoomLogo};

type Screen = keyof typeof design;
type TemplateNode = string | {tag:string;attrs:Record<string,string>;children:TemplateNode[]};
type Values = Record<string,unknown>;
const teams = [{name:"LG",color:"#C30452"},{name:"두산",color:"#131230"},{name:"KIA",color:"#C8102E"},{name:"삼성",color:"#074CA1"},{name:"롯데",color:"#041E42"},{name:"한화",color:"#FF6600"},{name:"SSG",color:"#CE0E2D"},{name:"NC",color:"#315288"},{name:"KT",color:"#000000"},{name:"키움",color:"#570514"}];
const attributeNames:Record<string,string>={class:"className",for:"htmlFor",viewbox:"viewBox",tabindex:"tabIndex",'stroke-width':"strokeWidth",'stroke-linecap':"strokeLinecap",'stroke-linejoin':"strokeLinejoin",'fill-rule':"fillRule",'clip-rule':"clipRule",'stroke-dasharray':"strokeDasharray",'text-anchor':"textAnchor",'font-size':"fontSize",'font-weight':"fontWeight",'fill-opacity':"fillOpacity",'font-family':"fontFamily",'dominant-baseline':"dominantBaseline",'attributename':"attributeName",'repeatcount':"repeatCount",'keytimes':"keyTimes",'keypoints':"keyPoints",'calcmode':"calcMode",'pathlength':"pathLength"};
function lookup(key:string,v:Values):unknown{return key.trim().split('.').reduce<unknown>((o,k)=>o&&typeof o==='object'?(o as Values)[k]:undefined,v);}
function interpolate(s:string,v:Values):unknown{const exact=s.match(/^\{\{\s*([^}]+?)\s*\}\}$/);return exact?lookup(exact[1],v):s.replace(/\{\{\s*([^}]+?)\s*\}\}/g,(_,key)=>String(lookup(key,v)??''));}
function inlineStyle(raw:string,v:Values):CSSProperties{return Object.fromEntries(raw.split(';').filter(x=>x.includes(':')).map(s=>{const i=s.indexOf(':');return[s.slice(0,i).trim().replace(/-([a-z])/g,(_,x)=>x.toUpperCase()),interpolate(s.slice(i+1).trim(),v)];})) as CSSProperties;}

// ── 관계별 문구 ─────────────────────────────────────────
const RELATION_COPY:Record<Relation,{badge:string;namePlaceholder:string;greeting:string;chatPlaceholder:string}>={
 boss:{badge:'직장 상사 · 존댓말',namePlaceholder:'예: 김 과장님',greeting:'어제 경기 봤어? 거기서 왜 번트를 대냐고…',chatPlaceholder:'존댓말로 말해 보세요'},
 friend:{badge:'친구 · 반말',namePlaceholder:'예: 민수',greeting:'야 어제 경기 봤냐? 진짜 열받아 죽겠네',chatPlaceholder:'편하게 말해 보세요'},
};
const NAME_REQUIRED='부르는 이름을 입력해 주세요';
/** 받침이 있으면 "과", 없으면 "와". 한글로 끝나지 않으면 "과(와)" */
function withGwa(word:string){const c=word.charCodeAt(word.length-1);if(c>=0xAC00&&c<=0xD7A3)return word+((c-0xAC00)%28?'과':'와');return word+'과(와)';}
// 디자인 원본의 팁 문구 → 응답 tips 순서
const TEMPLATE_TIPS=[['진 경기 얘기는 먼저 꺼내지 않기','결과나 선수 실수보다는 상대가 먼저 꺼낼 때까지 기다려요'],['다음 경기에 대한 기대로 이야기하기','지난 경기 평가 대신 앞으로 잘될 거라는 쪽으로 말해요'],['좋아하는 다른 주제로 자연스럽게 돌리기','점심 메뉴나 주말 계획처럼 기분 좋아질 화제를 꺼내요']];

// 예보 기분 → 화면 표정 (이름이 같습니다)
const MOOD_KEY_BY_LABEL:Record<string,MoodKey>=Object.fromEntries(ORDER.map(k=>[MOODS[k].label,k]));
const ADVICE_TITLE:Record<MoodKey,string>={vgood:'먼저 말 걸어도 좋아요!',good:'편하게 인사하세요!',normal:'평소처럼 대하세요',bad:'말 한마디 조심하세요',vbad:'최대한 피하세요!'};
// 내일의 조언 카드 색: 좋음 계열 초록, 보통 노랑, 나쁨 계열 빨강
type AdviceTone={bg:string;label:string;title:string};
const ADVICE_TONES:Record<'green'|'yellow'|'red',AdviceTone>={
 green:{bg:'#E8F7EC',label:'#1E7B34',title:'#0F5A22'},
 yellow:{bg:'#FFF7DB',label:'#A05A00',title:'#7A4300'},
 red:{bg:'#FFF2F3',label:'#D70015',title:'#8A0010'},
};
const ADVICE_TONE_BY_MOOD:Record<MoodKey,keyof typeof ADVICE_TONES>={vgood:'green',good:'green',normal:'yellow',bad:'red',vbad:'red'};
const isTextNode=(n:TemplateNode,text:string)=>typeof n!=='string'&&n.children[0]===text;
const RESULT_LABEL:Record<GameResult['result'],string>={W:'승',L:'패',D:'무'};
const NO_GAMES='경기 자료 준비 중';
/** 최근 경기(최근 순)로 결과 화면 숫자를 만듭니다. */
function summarizeGames(games:GameResult[]){
 if(games.length===0)return {record:NO_GAMES,avgLabel:'최근 경기 평균 득점',avg:'-',last:'-',caption:NO_GAMES};
 const count=(r:GameResult['result'])=>games.filter(g=>g.result===r).length;
 const first=games[0].result;let run=0;for(const g of games){if(g.result!==first)break;run++;}
 const streak=first==='D'||run<2?'':`${run}${first==='W'?'연승':'연패'} · `;
 const draws=count('D');
 const recent=games.slice(0,5);const avg=recent.reduce((a,g)=>a+g.teamScore,0)/recent.length;
 const last=games[0];
 return {
  record:`${streak}${games.length}경기 ${count('W')}승 ${draws?`${draws}무 `:''}${count('L')}패`,
  avgLabel:`최근 ${recent.length}경기 평균 득점`,
  avg:`${avg.toFixed(1)}점`,
  last:`${last.opponent}전 ${last.teamScore}:${last.oppScore} ${RESULT_LABEL[last.result]}`,
  caption:`최근 ${games.length}경기 · 왼쪽이 가장 최근`,
 };
}

export default function V7App(){
 const [screen,setScreen]=useState<Screen>('main');
 const [team,setTeam]=useState('LG');const [name,setName]=useState('');const [relation,setRelation]=useState<Relation>('boss');
 const [mood,setMood]=useState<MoodKey>('vbad');const [report,setReport]=useState<ForecastResponse|null>(null);const [error,setError]=useState('');
 const [messages,setMessages]=useState<ChatMessage[]>([]);const [input,setInput]=useState('');
 const [count,setCount]=useState<Count>({...CHAT_START_COUNT});const [tips,setTips]=useState<Tip[]|null>(null);const [pending,setPending]=useState(false);
 const [analysisStage,setAnalysisStage]=useState<AnalysisStage>(0);const analysisController=useRef<AbortController|null>(null);
 const request=useRef(0);const log=useRef<HTMLDivElement>(null);
 const who=name.trim();const nameOk=who.length>=DISPLAY_NAME_RANGE.min&&who.length<=DISPLAY_NAME_RANGE.max;const ended=count.outs>=3;const copy=RELATION_COPY[relation];
 useEffect(()=>{if(log.current)log.current.scrollTop=log.current.scrollHeight;},[messages,pending]);
 /** 결과·대화 화면은 세션을 읽어서 씁니다. 없으면 메인으로 */
 function go(next:Screen):Session|null{
  window.scrollTo({top:0});
  if(next==='main'){setScreen('main');return null;}
  const s=getSession();
  if(!s){request.current++;setScreen('main');return null;}
  setRelation(s.relation);setName(s.displayName);setTeam(s.team);setScreen(next);return s;
 }
 function resetChat(s:Session){setMessages([{role:'partner',text:RELATION_COPY[s.relation].greeting}]);setCount({...CHAT_START_COUNT});setTips(null);setInput('');setError('');}
 function startChat(){const s=go('chat');if(s)resetChat(s);}
 function cancelAnalysis(){analysisController.current?.abort();request.current++;go('main');}
 async function analyze(){
  if(!nameOk)return;
  setSession({relation,displayName:who,team});
  analysisController.current?.abort();
  const controller=new AbortController();analysisController.current=controller;
  const id=++request.current;setError('');setReport(null);setAnalysisStage(0);
  const s=go('loading');if(!s)return;
  try{
   await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
   controller.signal.throwIfAborted();
   const result=await runAnalysis(
    ()=>getForecast({relation:s.relation,displayName:s.displayName,team:s.team,player:'팀 전체',favoriteMenus:['국밥']},controller.signal),
    stage=>{if(id===request.current)setAnalysisStage(stage);},
    ()=>waitForMotion(controller.signal),controller.signal);
   if(id!==request.current)return;
   setReport(result);setMood(MOOD_KEY_BY_LABEL[result.forecast.mood]??'normal');go('result');
  }catch(e){
   if(id!==request.current||controller.signal.aborted)return;
   setError(e instanceof Error?e.message:'자료를 불러오지 못했어요. 다시 시도해주세요.');go('main');
  }
 }
 function restart(){clearSession();request.current++;setName('');setRelation('boss');setTeam('LG');setReport(null);setMessages([]);setTips(null);setCount({...CHAT_START_COUNT});go('main');}
 function navigate(href:string){if(href==='Main.dc.html'){if(screen==='warning')restart();else{request.current++;go('main');}}else if(href==='WebLoading.dc.html'){void analyze();}else if(href==='WebResult.dc.html'){if(report)go('result');else void analyze();}else if(href==='SimChat.dc.html')startChat();else if(href==='SimWarning.dc.html')go('warning');}
 async function send(){
  const value=input.trim();if(!value||ended||pending)return;
  const s=getSession();if(!s){go('main');return;}
  const before=messages;const next:ChatMessage[]=[...messages,{role:'user',text:value}];
  setMessages(next);setInput('');setError('');setPending(true);
  try{
   const res=await sendChat({profile:{relation:s.relation,displayName:s.displayName,team:s.team,mood:MOODS[mood].label,moodReason:moodSentence(mood)},messages:next,count});
   setMessages([...next,{role:'partner',text:res.reply}]);setCount(res.count);
   if(res.ended){setTips(res.tips??null);window.setTimeout(()=>go('warning'),1200);}
  }catch(e){setMessages(before);setInput(value);setError(e instanceof Error?e.message:'답장을 받지 못했어요. 다시 보내 주세요.');}
  finally{setPending(false);}
 }
 const reportMood=report?MOOD_KEY_BY_LABEL[report.forecast.mood]:undefined;
 const stats=summarizeGames(report?.performance.teamGames??[]);
 /** 예보와 같은 표정이면 실제 예보 근거, 미리보기로 바꾼 표정이면 기본 문구 */
 function moodSentence(k:MoodKey){return report&&k===reportMood?report.forecast.reason:text(MOODS[k].sentence);}
 const lastUser=messages.filter(m=>m.role==='user').at(-1)?.text??'';const lastPartner=messages.filter(m=>m.role==='partner').at(-1)?.text??'……';
 /** 디자인 원본 문구 → 현재 값 */
 function exactText(t:string):string|undefined{
  if(t==='야친자')return '관계';
  if(screen==='result'){
   const tip=(i:number)=>report&&mood===reportMood?report.forecast.tips[i]:undefined;
   if(t==='5연패 · 10경기 3승 7패')return stats.record;
   if(t==='최근 5경기 평균 득점')return stats.avgLabel;
   if(t==='[N]점')return stats.avg;
   if(t==='1점 차 역전패')return stats.last;
   if(t==='최근 10경기 · 왼쪽이 가장 최근')return stats.caption;
   if(t==='왜 나쁠까요?')return '왜 이런 기분일까요?';
   if(t==='최대한 피하세요!')return ADVICE_TITLE[mood];
   if(t==='보고와 결재는 오후로 미루기')return tip(0)??t;
   if(t==='야구 이야기는 먼저 꺼내지 않기')return tip(1)??t;
  }
  if(t==='과')return who.slice(0,1);
  if(t==='대화 시뮬레이터에서 이 이름으로 불러요')return nameOk?t:NAME_REQUIRED;
  if(t==='입력한 정보는 예보를 만드는 데만 쓰고 저장하지 않아요. 예보는 경기 기록과 AI로 만든 재미용 결과예요.')return '입력한 정보는 이 브라우저 탭에만 잠시 보관하고 서버에 저장하지 않아요. 경기 자료는 샘플이에요.';
  if(t==='과장님과 대화 연습하기')return `${withGwa(who)} 대화 연습하기`;
  if(t==='그래도 LG가 올해 가을야구는 못 가겠죠?')return lastUser;
  if(t==='……'&&screen==='warning')return lastPartner;
  for(let i=0;i<TEMPLATE_TIPS.length;i++){const tip=tips?.[i];if(!tip)break;if(t===TEMPLATE_TIPS[i][0])return tip.title;if(t===TEMPLATE_TIPS[i][1])return tip.desc;}
  return undefined;
 }
 function text(s:string){const exact=exactText(s.trim());if(exact!==undefined)return exact;return s.replaceAll('야친자 기분 기상청','야친자로부터 살아남기').replaceAll('김 과장님','__NAME__').replaceAll('과장님','__NAME__').replaceAll('__NAME__',who).replaceAll('직장 상사 · 존댓말',copy.badge).replaceAll('LG',team).replaceAll('[YYYY-MM-DD]',report?.performance.asOf??'샘플').replaceAll('경기 기록과 AI로 만든 재미용 예보예요',report?.performance.source==='live'?'경기 기록과 팬 반응으로 만든 재미용 예보예요':'시연용 샘플 경기로 만든 예보예요').replaceAll('마지막 스트라이크: "올해 가을야구는 못 가겠죠?"',`마지막 스트라이크: “${lastUser}”`);}
 const selected=teams.find(t=>t.name===team)??teams[0];const m=MOODS[mood];
 const values:Values={sentence:moodSentence(mood),faceFill:m.face,blush:m.blush,eyeRy:m.eyeRy,browW:m.browW,browL:m.browL,browR:m.browR,xAnim:m.x,yAnim:m.y,sAnim:m.s,rAnim:m.r,ariaLabel:`기분이 ${m.label}인 야구공 캐릭터`,isVgood:mood==='vgood',isGood:mood==='good',isNormal:mood==='normal',isBad:mood==='bad',isVbad:mood==='vbad',openEyes:mood!=='vgood',moods:ORDER.map(k=>({label:MOODS[k].label,pressed:String(k===mood),bg:k===mood?'#1C1C1E':'#FFFFFF',fg:k===mood?'#FFFFFF':'#1C1C1E',border:k===mood?'#1C1C1E':'#D1D1D6',pick:()=>setMood(k)}))};
 function countBoard(){
  const status=ended?'삼진 아웃!':count.strikes===2?'투 스트라이크!':count.strikes===1?'원 스트라이크!':count.outs===2?'투아웃!':count.outs===1?'원아웃!':'플레이볼!';
  return <aside className="v7-count" aria-label={`볼 ${count.balls}, 스트라이크 ${count.strikes}, 아웃 ${count.outs}`}><div className="v7-board">{[{label:'B',num:count.balls,total:3,color:'#34C759'},{label:'S',num:count.strikes,total:2,color:'#FFCC00'},{label:'O',num:count.outs,total:2,color:'#FF3B30'}].map(row=><div className="v7-countrow" key={row.label}><b>{row.label}</b><div className="v7-lights">{Array.from({length:row.total},(_,i)=><i key={i} style={{background:i<row.num?row.color:undefined}}/>)}</div></div>)}</div><strong>{status}</strong><small>무난한 말은 볼<br/>위험한 말은 스트라이크<br/>3아웃이면 대화 끝</small></aside>;
 }
 function render(n:TemplateNode,key:string,v:Values):ReactNode{
  if(typeof n==='string')return text(String(interpolate(n,v)??''));
  if(n.tag==='sc-if')return interpolate(n.attrs.value,v)?<Fragment key={key}>{n.children.map((c,i)=>render(c,`${key}.${i}`,v))}</Fragment>:null;
  if(n.tag==='sc-for'){const list=interpolate(n.attrs.list,v) as Values[];return <Fragment key={key}>{list.map((item,j)=>n.children.map((c,i)=>render(c,`${key}.${j}.${i}`,{...v,[n.attrs.as]:item})))}</Fragment>;}
  if(n.attrs['data-slot']==='messages')return <div key={key} className="v7-messages" ref={log} role="log" aria-live="polite">{messages.map((item,i)=><div className={`v7-message ${item.role==='user'?'user':'assistant'}`} key={i}>{item.role==='partner'&&<span className="v7-avatar">{who.slice(0,1)}</span>}<p>{item.text}</p></div>)}{pending&&<div className="v7-message assistant" aria-label={`${who} 입력 중`}><span className="v7-avatar">{who.slice(0,1)}</span><p>…</p></div>}</div>;
  if(n.attrs['data-slot']==='count')return <Fragment key={key}>{countBoard()}</Fragment>;
  if(n.tag==='div'&&n.attrs.style?.includes('repeat(10')){
   const chip=(label:string)=>n.children.find((c):c is Exclude<TemplateNode,string>=>typeof c!=='string'&&c.children[0]===label);
   const loss=inlineStyle(chip('패')?.attrs.style??'',v);const win=inlineStyle(chip('승')?.attrs.style??'',v);
   const chipStyle={W:win,L:loss,D:{...loss,background:'#F2F2F7',color:'#6E6E73'}};
   const games=(report?.performance.teamGames??[]).slice(0,10);
   if(games.length===0)return <div key={key} style={{fontSize:13,color:'#6E6E73'}}>{NO_GAMES}</div>;
   return <div key={key} style={inlineStyle(n.attrs.style,v)}>{games.map((g,i)=><span key={i} style={chipStyle[g.result]} title={`${g.date} ${g.opponent} ${g.teamScore}:${g.oppScore}`}>{RESULT_LABEL[g.result]}</span>)}</div>;
  }
  const props:Record<string,unknown>={key};for(const [a,b]of Object.entries(n.attrs)){if(a.startsWith('hint-'))continue;if(a==='style')props.style=inlineStyle(b,v);else if(a.toLowerCase()==='onclick')props.onClick=interpolate(b,v);else props[attributeNames[a]??a]=interpolate(b,v);}
  const style=(props.style??{}) as CSSProperties;
  if(n.attrs.href){props.onClick=(e:{preventDefault:()=>void})=>{e.preventDefault();navigate(n.attrs.href);};}
  if(n.attrs.href==='WebLoading.dc.html'&&!nameOk){props['aria-disabled']=true;props.title=NAME_REQUIRED;props.style={...style,opacity:.4,cursor:'not-allowed'};props.onClick=(e:{preventDefault:()=>void})=>e.preventDefault();}
  if(n.attrs['data-relation']){const r=n.attrs['data-relation'] as Relation;const on=relation===r;props['aria-checked']=on;props.onClick=()=>setRelation(r);props.style={...style,background:on?'#FFFFFF':'transparent',boxShadow:on?'0 1px 3px #0000001f':'none',fontWeight:on?700:500};}
  if(n.attrs['data-team']){const on=team===n.attrs['data-team'];props['aria-pressed']=on;props.onClick=()=>setTeam(n.attrs['data-team']);props.style={...style,border:on?'2px solid #0071E3':'1px solid #E5E5EA'};}
  if(n.attrs.id==='boss-name'){props.value=name;props.maxLength=DISPLAY_NAME_RANGE.max;props.placeholder=copy.namePlaceholder;props['aria-invalid']=!nameOk;props.onChange=(e:{target:{value:string}})=>setName(e.target.value);}
  if(n.attrs.id==='chat-input'){props.value=input;props.maxLength=160;props.placeholder=copy.chatPlaceholder;props.disabled=ended;props.onChange=(e:{target:{value:string}})=>setInput(e.target.value);props.onKeyDown=(e:{key:string;nativeEvent:{isComposing:boolean}})=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing)void send();};}
  if(n.attrs['data-action']==='send'){props.onClick=()=>void send();props.disabled=!input.trim()||ended||pending;}
  if(n.tag==='section'&&n.attrs['aria-label']?.endsWith('과 대화')){props['aria-label']=`${withGwa(who)} 대화`;props['data-chat-section']='true';}
  if(style.background==='#C30452')props.style={...style,background:selected.color};
  if(screen==='result'){
   const tone=ADVICE_TONES[ADVICE_TONE_BY_MOOD[mood]];
   if(n.tag==='section'&&n.children.some(c=>isTextNode(c,'내일의 조언'))){props.style={...style,background:tone.bg,transition:'background .3s'};props['data-advice-tone']=ADVICE_TONE_BY_MOOD[mood];}
   else if(isTextNode(n,'내일의 조언'))props.style={...style,color:tone.label};
   else if(isTextNode(n,'최대한 피하세요!'))props.style={...style,color:tone.title};
  }
  if(n.tag==='div'&&n.children.some(c=>typeof c!=='string'&&c.attrs['data-slot']==='messages'))props['data-chat-layout']='true';
  if(style.justifyContent==='space-between'&&style.alignItems==='baseline')props['data-result-row']='true';
  if(n.attrs.role==='dialog')props['data-warning-dialog']='true';
  if(n.tag==='a'&&n.attrs.href==='SimWarning.dc.html')return null;
  if(n.attrs['data-team']){const label=n.attrs['data-team'];return createElement('button',props,<Image key="logo" src={teamLogos[label]} alt="" width={36} height={36} sizes="36px" style={{width:36,height:36,objectFit:'contain',flexShrink:0}}/>,label);}
  if(n.tag==='span'&&style.background==='#C30452')return <Image key={key} src={teamLogos[team]} alt={`${team} 로고`} width={24} height={24} sizes="24px" style={{width:24,height:24,objectFit:'contain'}}/>;
  if(n.tag==='input')return createElement(n.tag,props);
  return createElement(n.tag,props,...n.children.map((c,i)=>render(c,`${key}.${i}`,v)));
 }
 return <div className="v7-root" data-screen={screen}><div className="v7-notice">가상 상대 · 샘플 경기로 하는 대화 체험입니다. 실제 메시지는 보내지 않아요.</div>{error&&<p className="v7-error" role="alert">{error}</p>}{screen==='loading'?<AnalysisLoading stage={analysisStage} team={team} logo={teamLogos[team]} onCancel={cancelAnalysis}/>:render(design[screen] as TemplateNode,'root',values)}</div>;
}
