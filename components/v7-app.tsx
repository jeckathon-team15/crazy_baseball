"use client";

import { createElement, Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import design from "./v7-design.json";
import { MOODS, ORDER, type MoodKey } from "./v7-moods";
import { CHAT_START_COUNT, DISPLAY_NAME_RANGE } from "@/lib/config";
import type { ChatMessage, Count, Relation, Tip } from "@/types/chat";
import { getForecast, getDailyMood, sendChat, finishChatReview } from "@/lib/api";
import NoGame from "./no-game";
import { dailyAsReport, moodKey, extremeDemo, GAME_DATE, chatOpening } from "./daily-experience";
import type { DailyMood } from "@/lib/analysis/daily-mood";
import type { ForecastResponse } from "@/types/forecast";
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

type Screen = keyof typeof design | "no_game" | "review";
type TemplateNode = string | {tag:string;attrs:Record<string,string>;children:TemplateNode[]};
type Values = Record<string,unknown>;
const teams = [{name:"LG",color:"#C30452"},{name:"두산",color:"#131230"},{name:"KIA",color:"#C8102E"},{name:"삼성",color:"#074CA1"},{name:"롯데",color:"#041E42"},{name:"한화",color:"#FF6600"},{name:"SSG",color:"#CE0E2D"},{name:"NC",color:"#315288"},{name:"KT",color:"#000000"},{name:"키움",color:"#570514"}];
const attributeNames:Record<string,string>={class:"className",for:"htmlFor",viewbox:"viewBox",tabindex:"tabIndex",'stroke-width':"strokeWidth",'stroke-linecap':"strokeLinecap",'stroke-linejoin':"strokeLinejoin",'fill-rule':"fillRule",'clip-rule':"clipRule",'stroke-dasharray':"strokeDasharray",'text-anchor':"textAnchor",'font-size':"fontSize",'font-weight':"fontWeight",'dominant-baseline':"dominantBaseline",'attributename':"attributeName",'repeatcount':"repeatCount",'keytimes':"keyTimes",'keypoints':"keyPoints",'calcmode':"calcMode",'pathlength':"pathLength"};
function lookup(key:string,v:Values):unknown{return key.trim().split('.').reduce<unknown>((o,k)=>o&&typeof o==='object'?(o as Values)[k]:undefined,v);}
function interpolate(s:string,v:Values):unknown{const exact=s.match(/^\{\{\s*([^}]+?)\s*\}\}$/);return exact?lookup(exact[1],v):s.replace(/\{\{\s*([^}]+?)\s*\}\}/g,(_,key)=>String(lookup(key,v)??''));}
function inlineStyle(raw:string,v:Values):CSSProperties{return Object.fromEntries(raw.split(';').filter(x=>x.includes(':')).map(s=>{const i=s.indexOf(':');return[s.slice(0,i).trim().replace(/-([a-z])/g,(_,x)=>x.toUpperCase()),interpolate(s.slice(i+1).trim(),v)];})) as CSSProperties;}

type AdviceTone={bg:string;label:string;title:string};
const ADVICE_TONES:Record<'green'|'yellow'|'red',AdviceTone>={
 green:{bg:'#E8F7EC',label:'#1E7B34',title:'#0F5A22'},
 yellow:{bg:'#FFF7DB',label:'#A05A00',title:'#7A4300'},
 red:{bg:'#FFF2F3',label:'#D70015',title:'#8A0010'},
};
const ADVICE_TONE_BY_MOOD:Record<MoodKey,keyof typeof ADVICE_TONES>={vgood:'green',good:'green',normal:'yellow',bad:'red',vbad:'red'};
const isTextNode=(n:TemplateNode,text:string)=>typeof n!=='string'&&n.children[0]===text;

export default function V7App(){
 const [screen,setScreen]=useState<Screen>('main');
 const [date,setDate]=useState(GAME_DATE);const dateInput=useRef<HTMLInputElement>(null);const [dataMode,setDataMode]=useState<'live'|'sample'>('live');const [daily,setDaily]=useState<DailyMood|null>(null);
 const [team,setTeam]=useState('LG');const [name,setName]=useState('과장님');const [relation,setRelation]=useState<Relation>('boss');
 const [mood,setMood]=useState<MoodKey>('vbad');const [report,setReport]=useState<ForecastResponse|null>(null);const [error,setError]=useState('');
 const [messages,setMessages]=useState<ChatMessage[]>([]);const [input,setInput]=useState('');const [chatCount,setChatCount]=useState<Count>({...CHAT_START_COUNT});const [pending,setPending]=useState(false);const [tips,setTips]=useState<Tip[]|null>(null);
 const [reviewFallback,setReviewFallback]=useState(false);
 const [analysisStage,setAnalysisStage]=useState<AnalysisStage>(0);const analysisController=useRef<AbortController|null>(null);
const request=useRef(0);const log=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(log.current)log.current.scrollTop=log.current.scrollHeight;},[messages]);
 function go(next:Screen){setScreen(next);window.scrollTo({top:0});}
 function startChat(){setMessages([{role:'partner',text:chatOpening(mood,relation)}]);setChatCount({...CHAT_START_COUNT});setTips(null);setInput('');setError('');go('chat');}

 function cancelAnalysis(){analysisController.current?.abort();request.current++;go('main');}
 async function analyze(testMode=false){
  const selectedDate=testMode?GAME_DATE:dateInput.current?.value||date;if(!name.trim()||!selectedDate)return;setDate(selectedDate);if(testMode){setDataMode('sample');setTeam('한화');setDate(GAME_DATE);}
  analysisController.current?.abort();
  const controller=new AbortController();analysisController.current=controller;
  const id=++request.current;setError('');setReport(null);setDaily(null);setAnalysisStage(0);go('loading');
  try{
   await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
   controller.signal.throwIfAborted();
   const result=await runAnalysis(
    async()=>{if(testMode)return {daily:null,report:extremeDemo(name.trim(),relation)};if(dataMode==='live'){const daily=await getDailyMood({team,date:selectedDate},controller.signal);return {daily,report:dailyAsReport(daily,name.trim(),relation)};}return {daily:null,report:await getForecast({relation,displayName:name.trim(),team,player:'팀 전체',favoriteMenus:['국밥']},controller.signal)};},
    stage=>{if(id===request.current)setAnalysisStage(stage);},
    ()=>waitForMotion(controller.signal),controller.signal);
   if(id!==request.current)return;
   setDaily(result.daily);setReport(result.report);setMood(result.report?moodKey(result.report.forecast.mood):'normal');go(result.daily&&result.daily.status!=='ready'?'no_game':'result');
  }catch(e){
   if(id!==request.current||controller.signal.aborted)return;
   setError(e instanceof Error?e.message:'자료를 불러오지 못했어요. 다시 시도해주세요.');go('main');
  }
 }

 function navigate(href:string){if(href==='Main.dc.html'){request.current++;go('main');}else if(href==='WebLoading.dc.html'){void analyze();}else if(href==='WebResult.dc.html'){if(report)go('result');else void analyze();}else if(href==='SimChat.dc.html')startChat();else if(href==='SimWarning.dc.html')go('warning');}
 async function endConversation(){
  if(pending)return;setPending(true);setError('');
  try{const result=await finishChatReview({profile:{relation,displayName:name.trim(),team,mood:MOODS[mood].label,moodReason:[report?.forecast.reason??MOODS[mood].sentence,...(report?.performance.highlights??[])].join(' ')},messages,count:chatCount});setTips(result.tips);setReviewFallback(result.fallback);go('review');}
  catch(e){setError(e instanceof Error?e.message:'대화 분석을 불러오지 못했어요.');}finally{setPending(false);}
 }
 async function send(){
  const value=input.trim();if(!value||chatCount.outs>=3||pending)return;
  const before=messages;const next:ChatMessage[]=[...messages,{role:'user',text:value}];setMessages(next);setInput('');setError('');setPending(true);
  try{const result=await sendChat({profile:{relation,displayName:name.trim(),team,mood:MOODS[mood].label,moodReason:[report?.forecast.reason??MOODS[mood].sentence,...(report?.performance.highlights??[])].join(' ')},messages:next,count:chatCount});setMessages([...next,{role:'partner',text:result.reply}]);setChatCount(result.count);if(result.ended){setTips(result.tips??null);setReviewFallback(result.fallback);go('review');}}
  catch(e){setMessages(before);setInput(value);setError(e instanceof Error?e.message:'답장을 받지 못했어요. 다시 보내주세요.');}finally{setPending(false);}
 }

 function text(s:string){if(screen==='warning'&&s.trim()==='……')return messages.filter(m=>m.role==='partner').at(-1)?.text??'…';const templateTips=[['진 경기 얘기는 먼저 꺼내지 않기','결과나 선수 실수보다는 상대가 먼저 꺼낼 때까지 기다려요'],['다음 경기에 대한 기대로 이야기하기','지난 경기 평가 대신 앞으로 잘될 거라는 쪽으로 말해요'],['좋아하는 다른 주제로 자연스럽게 돌리기','점심 메뉴나 주말 계획처럼 기분 좋아질 화제를 꺼내요']];for(let i=0;i<templateTips.length;i++){if(tips?.[i]&&s.trim()===templateTips[i][0])return tips[i].title;if(tips?.[i]&&s.trim()===templateTips[i][1])return tips[i].desc;}return s.replaceAll('야친자 기분 기상청','야친자 경보기').replaceAll('야친자로부터 살아남기','야친자 경보기').replaceAll('새 예보 만들기','새 경보 만들기').replaceAll('예보를 만드는 데만','대화 상황을 만드는 데만').replaceAll('다시 예보하기','다른 경기로 다시 하기').replaceAll('예보로 돌아가기','분석 결과로 돌아가기').replaceAll('내일 기분','경기 후 팬심').replaceAll('내일의 조언','첫마디 생존 팁').replaceAll('김 과장님','__NAME__').replaceAll('과장님','__NAME__').replaceAll('__NAME__',name).replaceAll('직장 상사 · 존댓말',relation==='friend'?'친구 · 반말':'직장 상사 · 존댓말').replaceAll('LG',team).replaceAll('친구과','친구와').replaceAll('[YYYY-MM-DD]',report?.performance.asOf??date).replaceAll('[N]점','예시 3.2점').replaceAll('경기 기록과 AI로 만든 재미용 예보예요',dataMode==='live'?'선택한 날짜의 경기 기록을 바탕으로 한 재미용 결과예요':'샘플 경기로 만든 체험 결과예요').replaceAll('예보는 경기 기록과 AI로 만든 재미용 결과예요.','실제 사람의 기분을 알 수는 없지만, 첫마디는 연습할 수 있어요.').replaceAll('마지막 스트라이크: "올해 가을야구는 못 가겠죠?"',`마지막 스트라이크: “${messages.filter(m=>m.role==='user').at(-1)?.text??''}”`);}
 const selected=teams.find(t=>t.name===team)!;const m=MOODS[mood];
 const values:Values={sentence:report?.forecast.reason??text(m.sentence),faceFill:m.face,blush:m.blush,eyeRy:m.eyeRy,browW:m.browW,browL:m.browL,browR:m.browR,xAnim:m.x,yAnim:m.y,sAnim:m.s,rAnim:m.r,ariaLabel:`기분이 ${m.label}인 야구공 캐릭터`,isVgood:mood==='vgood',isGood:mood==='good',isNormal:mood==='normal',isBad:mood==='bad',isVbad:mood==='vbad',openEyes:mood!=='vgood',moods:ORDER.map(k=>({label:MOODS[k].label,pressed:String(k===mood),bg:k===mood?'#1C1C1E':'#FFFFFF',fg:k===mood?'#FFFFFF':'#1C1C1E',border:k===mood?'#1C1C1E':'#D1D1D6',pick:()=>setMood(k)}))};
 function count(){
  const status=chatCount.outs>=3?'삼진 아웃!':chatCount.strikes===2?'투 스트라이크!':chatCount.strikes===1?'원 스트라이크!':chatCount.outs===2?'투아웃!':chatCount.outs===1?'원아웃!':'플레이볼!';
  return <aside className="v7-count" aria-label={`볼 ${chatCount.balls}, 스트라이크 ${chatCount.strikes}, 아웃 ${chatCount.outs}`}><div className="v7-board">{[{label:'B',num:chatCount.balls,total:3,color:'#34C759'},{label:'S',num:chatCount.strikes,total:2,color:'#FFCC00'},{label:'O',num:chatCount.outs,total:2,color:'#FF3B30'}].map(row=><div className="v7-countrow" key={row.label}><b>{row.label}</b><div className="v7-lights">{Array.from({length:row.total},(_,i)=><i key={i} style={{background:i<row.num?row.color:undefined}}/>)}</div></div>)}</div><strong>{status}</strong><small>무난한 말은 볼<br/>위험한 말은 스트라이크<br/>3아웃이면 대화 끝</small></aside>;
 }
 function render(n:TemplateNode,key:string,v:Values):ReactNode{
  if(typeof n==='string')return text(String(interpolate(n,v)??''));
  if(n.attrs['aria-label']==='기분 미리보기')return null;
  if(screen==='main'&&n.tag==='p'&&JSON.stringify(n.children).includes('입력한 정보는'))return null;
  if(n.tag==='section'&&n.children.some(c=>typeof c!=='string'&&c.tag==='h2'&&c.children.includes('왜 나쁠까요?'))){return <section key={key} className="result-data-card"><h2>선택한 경기에서는</h2><p className="result-source">{dataMode==='live'?'경기 기록':'샘플 자료'} · {report?.performance.asOf}</p>{report?.performance.teamGames.map((g,i)=><div className="result-game" key={i}><span>{g.date}<br/><small>{g.opponent}전</small></span><strong>{g.teamScore} : {g.oppScore}<em>{g.result==='W'?'승리':g.result==='L'?'패배':'무승부'}</em></strong></div>)}</section>;}
  if(n.tag==='section'&&n.children.some(c=>typeof c==='object'&&c.children.includes('내일의 조언'))){return <section key={key} className="result-tips-card"><span>첫마디 생존 팁</span><h2>{mood==='vbad'||mood==='bad'?'오늘은 한마디 더 조심.':'말문을 가볍게 열어보세요.'}</h2><ul>{report?.forecast.tips.map(tip=><li key={tip}>{tip}</li>)}</ul></section>;}
  if(n.tag==='sc-if')return interpolate(n.attrs.value,v)?<Fragment key={key}>{n.children.map((c,i)=>render(c,`${key}.${i}`,v))}</Fragment>:null;
  if(n.tag==='sc-for'){const list=interpolate(n.attrs.list,v) as Values[];return <Fragment key={key}>{list.map((item,j)=>n.children.map((c,i)=>render(c,`${key}.${j}.${i}`,{...v,[n.attrs.as]:item})))}</Fragment>;}
  if(n.attrs['data-slot']==='messages')return <div key={key} className="v7-messages" ref={log} role="log" aria-live="polite">{messages.map((item,i)=><div className={`v7-message ${item.role==='user'?'user':'assistant'}`} key={i}>{item.role==='partner'&&<span className="v7-avatar">{name[0]}</span>}<p>{item.text}</p></div>)}{pending&&<div className='v7-message assistant' aria-label='답장 작성 중'><p>…</p></div>}</div>;
  if(n.attrs['data-slot']==='count')return <Fragment key={key}>{count()}</Fragment>;
  const props:Record<string,unknown>={key};for(const [a,b]of Object.entries(n.attrs)){if(a.startsWith('hint-'))continue;if(a==='style')props.style=inlineStyle(b,v);else if(a.toLowerCase()==='onclick')props.onClick=interpolate(b,v);else props[attributeNames[a]??a]=interpolate(b,v);}
  const style=(props.style??{}) as CSSProperties;if(key==='root'&&screen==='main')props.className='stadium-content';
  if(n.attrs.href){props.onClick=(e:{preventDefault:()=>void})=>{e.preventDefault();navigate(n.attrs.href);};if(n.attrs.href==='WebLoading.dc.html'&&(!name.trim()||!date)){props['aria-disabled']=true;props.onClick=(e:{preventDefault:()=>void})=>e.preventDefault();}}
  if(n.attrs['data-relation']){const on=relation===n.attrs['data-relation'];props['aria-checked']=on;props.onClick=()=>setRelation(n.attrs['data-relation'] as Relation);props.style={...style,background:on?'#FFFFFF':'transparent',boxShadow:on?'0 1px 3px #0000001f':'none',fontWeight:on?700:500};}
  if(n.attrs['data-team']){const on=team===n.attrs['data-team'];props['aria-pressed']=on;props.onClick=()=>setTeam(n.attrs['data-team']);props.style={...style,border:on?'2px solid #0071E3':'1px solid #E5E5EA'};}
  if(n.attrs.id==='boss-name'){props.value=name;props.maxLength=DISPLAY_NAME_RANGE.max;props.onChange=(e:{target:{value:string}})=>setName(e.target.value);}
  if(n.attrs.id==='chat-input'){props.value=input;props.maxLength=160;props.disabled=chatCount.outs>=3||pending;props.onChange=(e:{target:{value:string}})=>setInput(e.target.value);props.onKeyDown=(e:{key:string;nativeEvent:{isComposing:boolean}})=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing)send();};}
  if(n.attrs['data-action']==='send'){props.onClick=send;props.disabled=!input.trim()||chatCount.outs>=3||pending;}
  if(style.background==='#C30452')props.style={...style,background:selected.color};
  if(screen==='result'){
   const tone=ADVICE_TONES[ADVICE_TONE_BY_MOOD[mood]];
   if(n.tag==='section'&&n.children.some(c=>isTextNode(c,'내일의 조언'))){props.style={...style,background:tone.bg,transition:'background .3s'};props['data-advice-tone']=ADVICE_TONE_BY_MOOD[mood];}
   else if(isTextNode(n,'내일의 조언'))props.style={...style,color:tone.label};
   else if(isTextNode(n,'최대한 피하세요!'))props.style={...style,color:tone.title};
  }
  if(n.tag==='div'&&n.children.some(c=>typeof c!=='string'&&c.attrs['data-slot']==='messages'))props['data-chat-layout']='true';
  if(style.justifyContent==='space-between'&&style.alignItems==='baseline')props['data-result-row']='true';
  if(n.tag==='section'&&n.attrs['aria-label']?.endsWith('과 대화')){props['aria-label']=`${name} 대화`;props['data-chat-section']='true';}
  if(n.attrs.role==='dialog')props['data-warning-dialog']='true';
  if(n.tag==='a'&&n.attrs.href==='SimWarning.dc.html')return null;
  if(screen==='chat'&&n.tag==='a'&&n.attrs.href==='WebResult.dc.html')return <div key={key} className='chat-header-actions'>{createElement(n.tag,props,'분석 결과로 돌아가기')}<button type='button' disabled={pending} onClick={()=>void endConversation()}>{pending?'대화 분석 중…':'대화 종료'}</button></div>;
  if(screen==='main'&&n.tag==='div'&&String(style.gridTemplateColumns).includes('auto-fill'))props.className='team-picker-grid';
  if(n.attrs['data-team']){const label=n.attrs['data-team'];return createElement('button',props,<Image key="logo" src={teamLogos[label]} alt="" width={36} height={36} sizes="36px" style={{width:36,height:36,objectFit:'contain',flexShrink:0}}/>,label);}
  if(n.tag==='span'&&style.background==='#C30452')return <Image key={key} src={teamLogos[team]} alt={`${team} 로고`} width={24} height={24} sizes="24px" style={{width:24,height:24,objectFit:'contain'}}/>;
  if(n.tag==='input')return createElement(n.tag,props);if(screen==='main'&&n.tag==='a'&&n.attrs.href==='WebLoading.dc.html')return <div key={key} className='analysis-actions'>{createElement(n.tag,props,`${team}로 분석 시작 →`)}<button className='extreme-test' aria-label='테스트 · 극대노 체험' disabled={!name.trim()} onClick={()=>void analyze(true)}>테스트 · 극대노</button></div>;
  const children=n.children.map((c,i)=>render(c,`${key}.${i}`,v));return createElement(n.tag,props,...children);
 }
 if(screen==='review')return <div className="v7-root" data-screen="review"><main className="conversation-review"><header><span>야친자 경보기</span><button onClick={()=>go(report?'result':'main')}>경기 분석으로 돌아가기</button></header><section><small>{chatCount.outs>=3?'3아웃으로 종료':'직접 종료한 대화'}</small><h1>대화 복기</h1><p>{name}과 나눈 대화를 돌아보세요.</p><div className="review-stats"><span>내가 보낸 말 <b>{messages.filter(m=>m.role==='user').length}개</b></span><span>종료 카운트 <b>{chatCount.balls}B · {chatCount.strikes}S · {chatCount.outs}O</b></span></div><h2>다음 대화에서는</h2>{messages.some(m=>m.role==='user')?(tips??[]).map((tip,i)=><article key={i}><h3>{tip.title}</h3><p>{tip.desc}</p></article>):<p>아직 보낸 메시지가 없어요. 한마디 나눈 뒤 종료하면 대화에 맞는 팁을 받을 수 있어요.</p>}{reviewFallback&&messages.some(m=>m.role==='user')&&<small>AI 분석을 받지 못해 기본 대화 팁을 보여드려요.</small>}<details><summary>나눈 대화 다시 보기</summary>{messages.map((m,i)=><p key={i}><b>{m.role==='user'?'나':name}</b> · {m.text}</p>)}</details><button className="review-retry" onClick={startChat}>다시 대화하기</button></section></main></div>;
 return <div className="v7-root" data-screen={screen}>{error&&<p className="v7-error" role="alert">{error}</p>}{screen==='no_game'?<NoGame date={date} team={team} name={name} pending={daily?.status==='pending'} logo={teamLogos[team]} onBack={()=>go('main')} onChat={startChat}/>:screen==='loading'?<AnalysisLoading stage={analysisStage} team={team} logo={teamLogos[team]} onCancel={cancelAnalysis}/>:render(design[screen] as TemplateNode,'root',values)}{screen==='main'&&<footer className='stadium-credit'>사진: 잠실야구장 · Cyberdoomslayer, Wikimedia Commons (<a href='https://creativecommons.org/licenses/by-sa/4.0/' target='_blank' rel='noreferrer'>CC BY-SA 4.0</a>)</footer>}</div>;
}
