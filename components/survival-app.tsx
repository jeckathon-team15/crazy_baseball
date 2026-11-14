"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { getForecast } from "@/lib/api";
import type { BossInput, ForecastResponse } from "@/types/forecast";
import BaseballFace from "./baseball-face";
import { DEMO_POLICY, initialDemo, playDemoTurn } from "./survival-demo";
import "./survival.css";

type View = "brief" | "chat" | "result";
type Message = { role: "user" | "assistant"; text: string; reason?: string; out?: number };
const teams = ["LG 트윈스", "한화 이글스", "KIA 타이거즈", "삼성 라이온즈", "롯데 자이언츠", "두산 베어스", "SSG 랜더스", "KT 위즈", "NC 다이노스", "키움 히어로즈"];
const defaultProfile: BossInput = { relation: "boss", displayName: "팀장님", team: "LG 트윈스", player: "최애 타자", favoriteMenus: ["국밥"] };
const outNames = ["", "원아웃", "투아웃", "쓰리아웃"];

function Logo() {
  return <svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17"/><path d="M9 6q17 14 0 28M31 6q-17 14 0 28M10 11l5-2m-2 8 5-1m-5 8 5 1m-8 5 5 2m15-21-5-2m2 8-5-1m5 8-5 1m8 5-5 2"/></svg>;
}

export default function SurvivalApp() {
  const [view, setView] = useState<View>("brief");
  const [profile, setProfile] = useState(defaultProfile);
  const [draft, setDraft] = useState(defaultProfile);
  const [editing, setEditing] = useState(false);
  const [game, setGame] = useState(initialDemo);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [report, setReport] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const lastUser = messages.filter(m => m.role === "user");
  const safe = game.outs < DEMO_POLICY.outLimit;

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [messages]);
  function go(next: View) { setView(next); window.scrollTo({ top: 0 }); }
  function start() { setGame(initialDemo); setMessages([{ role: "assistant", text: initialDemo.last.reply }]); setText(""); go("chat"); }
  function send(value: string) {
    const clean = value.trim();
    if (!clean || game.ended) return;
    const next = playDemoTurn(game, clean);
    setGame(next);
    setMessages(previous => [...previous, { role: "user", text: clean }, { role: "assistant", text: next.last.reply, reason: next.last.reason, out: next.last.out ? next.outs : undefined }]);
    setText("");
  }
  function submitMessage(event: FormEvent) { event.preventDefault(); send(text); }
  function saveProfile(event: FormEvent) { event.preventDefault(); setProfile({ ...draft, displayName: draft.displayName.trim(), player: draft.player.trim() }); setEditing(false); setReport(null); setError(""); setMessages([]); setGame(initialDemo); go("brief"); }
  async function fetchReport() {
    setLoading(true); setError("");
    try { const data = await getForecast(profile); setReport(data); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "기록을 불러오지 못했어요. 다시 시도해주세요."); }
    finally { setLoading(false); }
  }
  async function shareResult() {
    const caption = `야친자로부터 살아남기 · ${outNames[game.outs] || "노아웃"}\n${lastUser.length}마디를 건넸습니다.\n${window.location.origin}`;
    try { await navigator.clipboard.writeText(caption); setCopied(true); }
    catch { setCopied(false); setError("복사를 허용하지 않는 브라우저예요. 주소창의 링크를 복사해주세요."); }
  }

  return <div className="yachinja-ui-root"><div className="shell">
    <header className="header"><button className="wordmark" onClick={() => go("brief")} aria-label="야친자로부터 살아남기 홈"><Logo/><span>야친자로부터<br/><span className="brand-second">살아남기<span className="wordmark-period">.</span></span></span></button><p className="brand-caption">야구는 몰라도,<br/>눈치는 챙겨야 하니까.</p><div className="header-right"><span className="live-dot"/> 팬심 대화 실험실<span className="demo-badge">체험 모드</span></div></header>
    <nav className="steps" aria-label="진행 단계"><button className={`step ${view === "brief" ? "active" : ""}`} onClick={() => go("brief")} aria-current={view === "brief" ? "step" : undefined}><span>01</span> 대화 전 브리핑</button><span className="step-line"/><button className={`step ${view === "chat" ? "active" : ""}`} onClick={() => messages.length ? go("chat") : start()} aria-current={view === "chat" ? "step" : undefined}><span>02</span> 눈치 실전</button><span className="step-line"/><button className={`step ${view === "result" ? "active" : ""}`} disabled={!lastUser.length} onClick={() => go("result")} aria-current={view === "result" ? "step" : undefined}><span>03</span> 오늘의 복기</button><span className="nav-note">가상 경기 · 규칙 기반 대화 체험</span></nav>
    <main>
      {view === "brief" && <section className="view"><div className="intro-grid"><div className="intro"><div className="eyebrow"><span className="tiny-cross">＋</span> 경기장 밖, 또 다른 승부<span className="issue">입 조심, 플레이볼.</span></div><h1 ref={titleRef}>야구는 끝났고,<br/><em>눈치전</em>은 시작됐다.</h1><p className="intro-copy">어젯밤 역전패가 오늘 내 점심에 미치는 영향.<br/>본게임 전에, 가상 상대와 한 번 연습해보세요.</p><div className="person-line"><div className="person-monogram">{profile.displayName[0]}</div><div><strong>가상 {profile.displayName}</strong><p>{profile.team} 팬 · 최애는 {profile.player}</p></div><button className="text-button" onClick={() => { setDraft(profile); setEditing(true); }}>상대 설정 ↗</button></div>
        <div className="field-heading"><span>오늘 연습할 상황</span><span className="mono">실제 경기와 무관한 가상 시나리오</span></div><div className="game-row"><span><i className="team-mark">홈</i><b>응원팀</b></span><strong className="game-score">4 <span>:</span> 5</strong><span><b>상대팀</b><i className="team-mark away">원</i></span></div><div className="event-line"><span className="event-time">9회 말</span><p>끝내기 홈런 허용. 이기던 경기가 뒤집혔습니다.</p></div><div className="brief-warning"><span className="warning-symbol">!</span><p><strong>오늘의 금기어, ‘홈런’.</strong><br/>과자 이름도 예외는 아닐 수 있습니다.</p></div><button className="start-button" onClick={start}><span>야친자와 대화 시작</span><span>→</span></button><p className="start-caption">말실수 세 번이면 쓰리아웃. 실제 상대에게는 전송되지 않아요.</p>
        <details className="api-report"><summary>경기 자료 더 보기 <span>↗</span></summary><p>현재는 예시 경기로 연습합니다. 선택한 팀의 실제 경기와 다를 수 있어요.</p><button className="text-button" disabled={loading} onClick={fetchReport}>{loading ? "자료를 불러오는 중…" : report ? "자료 다시 불러오기" : "예시 경기 자료 보기"}</button>{report && <div className="sample-result"><strong>{report.performance.source === "sample" ? "샘플 자료" : "서버 제공 자료"} · {report.performance.asOf}</strong><p>{report.performance.team} / {report.performance.player}</p><ul>{report.performance.highlights.map(item => <li key={item}>{item}</li>)}</ul></div>}{error && <p className="error-message" role="alert">{error}</p>}</details>
      </div><div className="preview-column"><div className="preview-label"><span>이런 대화가 될지도 모릅니다</span><span className="mono">첫 아웃의 순간 ↘</span></div><div className="preview-chat"><div className="chat-heading"><div className="person-monogram">{profile.displayName[0]}</div><div><strong>가상 {profile.displayName}</strong><p>상태 메시지: 오늘 야구 얘기 금지.</p></div><span className="chat-menu" aria-hidden="true">···</span></div><div className="preview-conversation"><div className="date-divider">오늘, 점심시간 직전</div><div className="bubble outgoing">{profile.displayName}, 홈런볼 드실래요?</div><div className="read-status">읽음</div><div className="sender">가상 {profile.displayName}</div><div className="bubble incoming">…지금 홈런이라고 했어요?</div><div className="bubble incoming narrow">어제 경기 보셨나 봐요.</div><div className="trigger-tag"><span>1 OUT</span> 뜻밖의 지뢰를 밟았습니다</div></div><div className="preview-character"><BaseballFace emotion="annoyed"/><div><span className="eyebrow">원아웃</span><p>과자를 권했을 뿐인데,<br/>분위기는 9회 말.</p></div></div></div><div className="margin-note"><span>NOTE —</span><p>실제 그분에게 보내지 마세요.<br/>여기는 안전하게 말실수하는 곳입니다.</p></div></div></div></section>}

      {view === "chat" && <section className="view chat-view"><div className="session-top"><div><div className="eyebrow">야구 팬과의 가상 대화</div><h2>한마디의 무게,<br/>오늘은 조금 다릅니다.</h2></div><button className="text-button" onClick={() => go("brief")}>← 브리핑 다시 보기</button></div><div className="session-grid"><section className="live-chat"><div className="chat-heading"><div className="person-monogram">{profile.displayName[0]}</div><div><strong>가상 {profile.displayName}</strong><p>{profile.team} 팬 · {game.ended ? "오늘은 각자 점심" : "오늘 야구 얘기 금지."}</p></div><span className="chat-menu" aria-hidden="true">···</span></div><div className="messages" ref={logRef} role="log" aria-live="polite" aria-label="가상 대화"><div className="date-divider">가상 경기 상황에 반응하는 체험 모드입니다</div>{messages.map((message, index) => <div key={index} className={`message-group ${message.role}`}><div className={`bubble ${message.role === "user" ? "outgoing" : "incoming"}`}>{message.text}</div>{message.reason && <details className={`message-reason ${message.out ? "out-reason" : ""}`}><summary>{message.out ? `${outNames[message.out]} · 판정 이유` : "상대 반응 살펴보기"}</summary><p>{message.reason}</p></details>}</div>)}{game.ended && <button className="start-button" onClick={() => go("result")}>쓰리아웃 · 오늘의 눈치 복기 →</button>}</div><div className="composer-area"><div className="suggestions"><button disabled={game.ended} onClick={() => send("홈런볼 드실래요?")}>홈런볼 드실래요?</button><button disabled={game.ended} onClick={() => send("점심 뭐 드시고 싶으세요?")}>점심 뭐 드실래요?</button>{game.outs > 0 && <button disabled={game.ended} onClick={() => send("야구 말고 과자 이야기였어요. 커피랑 드세요.")}>과자였다고 수습하기</button>}</div><form onSubmit={submitMessage} className="chat-form"><label htmlFor="message" className="sr-only">상대에게 할 말</label><input id="message" value={text} onChange={event => setText(event.target.value)} maxLength={160} autoComplete="off" disabled={game.ended} placeholder={game.ended ? "오늘의 대화가 종료됐습니다." : "말은 자유롭게, 눈치는 신중하게."}/><button type="submit" className="send-button" aria-label="메시지 보내기" disabled={!text.trim() || game.ended}>↑</button></form><div className="composer-note"><span>실제 메시지는 전송되지 않습니다.</span><span>가상 대화 · 체험 모드</span></div></div></section>
        <aside className="telemetry"><div className="telemetry-heading"><span className="live-dot"/> 지금 그분의 표정</div><div className="character-monitor"><BaseballFace emotion={game.emotion}/><div className="vertical-gauge" role="meter" aria-label="분노 정도" aria-valuemin={0} aria-valuemax={DEMO_POLICY.maxTension} aria-valuenow={game.tension} aria-valuetext={game.emotion === "calm" ? "분위기가 풀렸어요" : "말을 조심해야 해요"} data-level={game.emotion === "calm" ? "calm" : game.ended ? "danger" : "warm"}><div className="gauge-rail"><div className="gauge-fill" style={{ height: `${game.tension}%` }}/><div className="gauge-ticks"/></div></div></div><p className="character-caption">{game.ended ? "점심은… 각자 먹죠." : game.emotion === "calm" ? "조금 풀린 것 같기도 해요." : game.outs ? "표정이 굳어갑니다." : "아직 어제 경기를 잊지 못했어요."}</p><div className="out-panel" aria-live="polite"><span className="eyebrow">아웃 카운트</span><div className="out-dots" aria-label={`${game.outs}아웃`}>{Array.from({ length: DEMO_POLICY.outLimit }, (_, i) => <span key={i} className={i < game.outs ? "filled" : ""}/>)}</div><strong>{outNames[game.outs] || "아직은 노아웃"}</strong></div><div className="context-note"><span className="eyebrow">기억해두세요</span><p>어제 9회 말,<br/>끝내기 홈런으로 역전패.</p><span>이것은 가상 경기 상황입니다.</span></div><button className="text-button review-button" disabled={!lastUser.length} onClick={() => go("result")}>대화를 마치고 복기하기 ↗</button><button className="text-button restart-button" onClick={start}>처음부터 다시 ↗</button></aside></div></section>}

      {view === "result" && <section className="view"><div className="result-layout"><div><div className="eyebrow">오늘의 눈치전 · 종료</div><h2>{safe ? <>오늘의 대화는,<br/>여기까지 무사히.</> : <>쓰리아웃.<br/>점심은 각자 먹죠.</>}</h2><p className="result-description">{safe ? "어젯밤 경기는 바꿀 수 없었지만, 오늘의 첫마디는 고를 수 있었습니다." : "괜찮아요. 여기는 다시 연습할 수 있는 곳이니까요."}</p><button className="start-button" onClick={start}>한 번 더 살아남기 <span>↗</span></button><button className="text-button result-back" onClick={shareResult}>{copied ? "결과와 링크를 복사했어요" : "친구에게 결과 공유하기 ↗"}</button>{error && <p className="error-message" role="alert">{error}</p>}</div><div className="result-paper"><div className="field-heading"><span>오늘의 눈치 복기</span><span className="mono">오늘의 기록</span></div><div className="result-mascot"><BaseballFace emotion={game.emotion}/><strong>{outNames[game.outs] || "노아웃"}</strong></div>{messages.filter(m => m.role === "user").map((message, index) => { const reply = messages[messages.indexOf(message) + 1]; return <div className="moment" key={index}><small>{reply?.out ? outNames[reply.out] : "무사 통과"}</small><p>“{message.text}”</p><span>{reply?.reason}</span></div>; })}<div className="result-footer">야구는 몰라도,<br/>좋아하는 마음은 조금 알게 됐나요?</div></div></div></section>}
    </main><footer className="footer"><span>야친자로부터 살아남기<span className="footer-caption">야구가 끝난 뒤의 이야기.</span></span><span>가상 경기·규칙 기반 대화입니다. 실제 사람의 기분과는 무관합니다.</span></footer>
    {editing && <div className="modal-backdrop" onClick={() => setEditing(false)}><section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title" onClick={event => event.stopPropagation()}><form onSubmit={saveProfile}><div className="eyebrow">대화 상대 설정</div><h2 id="profile-title">누구의 눈치를<br/>볼까요?</h2><label htmlFor="boss">가상 상대 호칭</label><input id="boss" value={draft.displayName} onChange={event => setDraft({ ...draft, displayName: event.target.value })} maxLength={12} required autoFocus/><label htmlFor="team">응원팀</label><select id="team" value={draft.team} onChange={event => setDraft({ ...draft, team: event.target.value })}>{teams.map(team => <option key={team}>{team}</option>)}</select><label htmlFor="player">최애 선수 또는 별칭</label><input id="player" value={draft.player} onChange={event => setDraft({ ...draft, player: event.target.value })} maxLength={30} required/><label htmlFor="menu">좋아하는 점심 메뉴</label><input id="menu" value={draft.favoriteMenus[0]} onChange={event => setDraft({ ...draft, favoriteMenus: [event.target.value] })} maxLength={30} required/><div className="dialog-actions"><button type="button" onClick={() => setEditing(false)}>취소</button><button type="submit">설정 반영 ↗</button></div></form></section></div>}
  </div></div>;
}
