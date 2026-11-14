"use client";

import { createElement, Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import design from "./v7-design.json";
import { MOODS, ORDER, type MoodKey } from "./v7-moods";
import { initialDemo, playDemoTurn } from "./survival-demo";
import { getForecast } from "@/lib/api";
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

type Screen = keyof typeof design;
type TemplateNode = string | {tag:string;attrs:Record<string,string>;children:TemplateNode[]};
type Values = Record<string,unknown>;
const teams = [{name:"LG",color:"#C30452"},{name:"두산",color:"#131230"},{name:"KIA",color:"#C8102E"},{name:"삼성",color:"#074CA1"},{name:"롯데",color:"#041E42"},{name:"한화",color:"#FF6600"},{name:"SSG",color:"#CE0E2D"},{name:"NC",color:"#315288"},{name:"KT",color:"#000000"},{name:"키움",color:"#570514"}];
const attributeNames:Record<string,string>={class:"className",for:"htmlFor",viewbox:"viewBox",tabindex:"tabIndex",'stroke-width':"strokeWidth",'stroke-linecap':"strokeLinecap",'stroke-linejoin':"strokeLinejoin",'fill-rule':"fillRule",'clip-rule':"clipRule",'stroke-dasharray':"strokeDasharray",'text-anchor':"textAnchor",'font-size':"fontSize",'font-weight':"fontWeight",'dominant-baseline':"dominantBaseline",'attributename':"attributeName",'repeatcount':"repeatCount",'keytimes':"keyTimes",'keypoints':"keyPoints",'calcmode':"calcMode",'pathlength':"pathLength"};
function lookup(key:string,v:Values):unknown{return key.trim().split('.').reduce<unknown>((o,k)=>o&&typeof o==='object'?(o as Values)[k]:undefined,v);}
function interpolate(s:string,v:Values):unknown{const exact=s.match(/^\{\{\s*([^}]+?)\s*\}\}$/);return exact?lookup(exact[1],v):s.replace(/\{\{\s*([^}]+?)\s*\}\}/g,(_,key)=>String(lookup(key,v)??''));}
function inlineStyle(raw:string,v:Values):CSSProperties{return Object.fromEntries(raw.split(';').filter(x=>x.includes(':')).map(s=>{const i=s.indexOf(':');return[s.slice(0,i).trim().replace(/-([a-z])/g,(_,x)=>x.toUpperCase()),interpolate(s.slice(i+1).trim(),v)];})) as CSSProperties;}

export default function V7App(){
 const [screen,setScreen]=useState<Screen>('main');
 const [team,setTeam]=useState('LG');const [name,setName]=useState('과장님');const [relation,setRelation]=useState('boss');
 const [mood,setMood]=useState<MoodKey>('vbad');const [report,setReport]=useState<ForecastResponse|null>(null);const [error,setError]=useState('');
 const [game,setGame]=useState(initialDemo);const [messages,setMessages]=useState([{role:'assistant',text:initialDemo.last.reply}]);const [input,setInput]=useState('');
 const [analysisStage,setAnalysisStage]=useState<AnalysisStage>(0);const analysisController=useRef<AbortController|null>(null);
 const [balls,setBalls]=useState(0);const request=useRef(0);const log=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(log.current)log.current.scrollTop=log.current.scrollHeight;},[messages]);
 function go(next:Screen){setScreen(next);window.scrollTo({top:0});}
 function startChat(){setGame(initialDemo);setMessages([{role:'assistant',text:relation==='friend'?'어제 경기 봤어? 오늘은 야구 얘기 하지 말자…':initialDemo.last.reply}]);setInput('');setBalls(0);go('chat');}
 function cancelAnalysis(){analysisController.current?.abort();request.current++;go('main');}
 async function analyze(){
  if(!name.trim())return;
  analysisController.current?.abort();
  const controller=new AbortController();analysisController.current=controller;
  const id=++request.current;setError('');setReport(null);setAnalysisStage(0);go('loading');
  try{
   await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
   controller.signal.throwIfAborted();
   const result=await runAnalysis(
    ()=>getForecast({bossTitle:name.trim(),team,player:'팀 전체',favoriteMenus:['국밥']},controller.signal),
    stage=>{if(id===request.current)setAnalysisStage(stage);},
    ()=>waitForMotion(controller.signal),controller.signal);
   if(id!==request.current)return;
   setReport(result);setMood('vbad');go('result');
  }catch(e){
   if(id!==request.current||controller.signal.aborted)return;
   setError(e instanceof Error?e.message:'자료를 불러오지 못했어요. 다시 시도해주세요.');go('main');
  }
 }

 function navigate(href:string){if(href==='Main.dc.html'){request.current++;go('main');}else if(href==='WebLoading.dc.html'){void analyze();}else if(href==='WebResult.dc.html'){if(report)go('result');else void analyze();}else if(href==='SimChat.dc.html')startChat();else if(href==='SimWarning.dc.html')go('warning');}
 function send(){const value=input.trim();if(!value||game.ended)return;const next=playDemoTurn(game,value);setGame(next);setMessages(m=>[...m,{role:'user',text:value},{role:'assistant',text:next.last.reply}]);setInput('');if(!next.last.out)setBalls(b=>(b+1)%4);if(next.ended)go('warning');}
 function text(s:string){return s.replaceAll('야친자 기분 기상청','야친자로부터 살아남기').replaceAll('김 과장님','__NAME__').replaceAll('과장님','__NAME__').replaceAll('__NAME__',name).replaceAll('직장 상사 · 존댓말',relation==='friend'?'친구 · 반말':'직장 상사 · 존댓말').replaceAll('LG',team).replaceAll('친구과','친구와').replaceAll('[YYYY-MM-DD]',report?.performance.asOf??'샘플').replaceAll('[N]점','예시 3.2점').replaceAll('경기 기록과 AI로 만든 재미용 예보예요','샘플 경기 기반 체험 결과예요').replaceAll('예보는 경기 기록과 AI로 만든 재미용 결과예요.','현재는 샘플 경기와 체험 대화로 동작해요.').replaceAll('마지막 스트라이크: "올해 가을야구는 못 가겠죠?"',`마지막 스트라이크: “${messages.filter(m=>m.role==='user').at(-1)?.text??''}”`);}
 const selected=teams.find(t=>t.name===team)!;const m=MOODS[mood];
 const values:Values={sentence:text(m.sentence),faceFill:m.face,blush:m.blush,eyeRy:m.eyeRy,browW:m.browW,browL:m.browL,browR:m.browR,xAnim:m.x,yAnim:m.y,sAnim:m.s,rAnim:m.r,ariaLabel:`기분이 ${m.label}인 야구공 캐릭터`,isVgood:mood==='vgood',isGood:mood==='good',isNormal:mood==='normal',isBad:mood==='bad',isVbad:mood==='vbad',openEyes:mood!=='vgood',moods:ORDER.map(k=>({label:MOODS[k].label,pressed:String(k===mood),bg:k===mood?'#1C1C1E':'#FFFFFF',fg:k===mood?'#FFFFFF':'#1C1C1E',border:k===mood?'#1C1C1E':'#D1D1D6',pick:()=>setMood(k)}))};
 function count(){return <aside className="v7-count" aria-label={`볼 ${balls}, 스트라이크 ${game.outs}, 아웃 ${game.outs}`}><div className="v7-board">{[{label:'B',num:balls,total:3,color:'#34C759'},{label:'S',num:game.outs,total:2,color:'#FFCC00'},{label:'O',num:game.outs,total:2,color:'#FF3B30'}].map(row=><div className="v7-countrow" key={row.label}><b>{row.label}</b><div className="v7-lights">{Array.from({length:row.total},(_,i)=><i key={i} style={{background:i<row.num?row.color:undefined}}/>)}</div></div>)}</div><strong>{game.outs===0?'플레이볼!':game.outs===1?'원아웃!':game.outs===2?'투아웃!':'삼진 아웃!'}</strong><small>무난한 말은 볼<br/>위험한 말은 스트라이크<br/>말실수 세 번이면 대화 끝</small></aside>;}
 function render(n:TemplateNode,key:string,v:Values):ReactNode{
  if(typeof n==='string')return text(String(interpolate(n,v)??''));
  if(n.tag==='sc-if')return interpolate(n.attrs.value,v)?<Fragment key={key}>{n.children.map((c,i)=>render(c,`${key}.${i}`,v))}</Fragment>:null;
  if(n.tag==='sc-for'){const list=interpolate(n.attrs.list,v) as Values[];return <Fragment key={key}>{list.map((item,j)=>n.children.map((c,i)=>render(c,`${key}.${j}.${i}`,{...v,[n.attrs.as]:item})))}</Fragment>;}
  if(n.attrs['data-slot']==='messages')return <div key={key} className="v7-messages" ref={log} role="log" aria-live="polite">{messages.map((item,i)=><div className={`v7-message ${item.role}`} key={i}>{item.role==='assistant'&&<span className="v7-avatar">{name[0]}</span>}<p>{item.text}</p></div>)}</div>;
  if(n.attrs['data-slot']==='count')return <Fragment key={key}>{count()}</Fragment>;
  const props:Record<string,unknown>={key};for(const [a,b]of Object.entries(n.attrs)){if(a.startsWith('hint-'))continue;if(a==='style')props.style=inlineStyle(b,v);else if(a.toLowerCase()==='onclick')props.onClick=interpolate(b,v);else props[attributeNames[a]??a]=interpolate(b,v);}
  const style=(props.style??{}) as CSSProperties;
  if(n.attrs.href){props.onClick=(e:{preventDefault:()=>void})=>{e.preventDefault();navigate(n.attrs.href);};}
  if(n.attrs['data-relation']){const on=relation===n.attrs['data-relation'];props['aria-checked']=on;props.onClick=()=>setRelation(n.attrs['data-relation']);props.style={...style,background:on?'#FFFFFF':'transparent',boxShadow:on?'0 1px 3px #0000001f':'none',fontWeight:on?700:500};}
  if(n.attrs['data-team']){const on=team===n.attrs['data-team'];props['aria-pressed']=on;props.onClick=()=>setTeam(n.attrs['data-team']);props.style={...style,border:on?'2px solid #0071E3':'1px solid #E5E5EA'};}
  if(n.attrs.id==='boss-name'){props.value=name;props.maxLength=20;props.onChange=(e:{target:{value:string}})=>setName(e.target.value);}
  if(n.attrs.id==='chat-input'){props.value=input;props.maxLength=160;props.disabled=game.ended;props.onChange=(e:{target:{value:string}})=>setInput(e.target.value);props.onKeyDown=(e:{key:string;nativeEvent:{isComposing:boolean}})=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing)send();};}
  if(n.attrs['data-action']==='send'){props.onClick=send;props.disabled=!input.trim()||game.ended;}
  if(style.background==='#C30452')props.style={...style,background:selected.color};
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
