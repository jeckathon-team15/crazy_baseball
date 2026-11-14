import test from "node:test";
import assert from "node:assert/strict";
import { dailyAsReport, moodKey, extremeDemo, GAME_DATE, EXPERIENCE_DATE, chatOpening } from "./daily-experience";
import type { DailyMood } from "@/lib/analysis/daily-mood";

test("does not invent an emotion or score when no game exists", () => {
 const daily:DailyMood={team:"LG 트윈스",date:"2026-10-01",status:"no_game",games:[],score:null,mood:null};
 assert.equal(dailyAsReport(daily,"과장님"),null);
 assert.equal(dailyAsReport({...daily,status:"pending"},"과장님"),null);
});
test("judge demo always shows the angriest sample without a provider",()=>{
 const report=extremeDemo("가상 팀장님");
 assert.equal(report.performance.source,"sample");
 assert.equal(report.input.displayName,"가상 팀장님");
 assert.equal(moodKey(report.forecast.mood),"vbad");
 assert.match(report.forecast.reason,/테스트 시나리오/);
});
test("keeps the requested game date, result and model emotion", () => {
 const report=dailyAsReport({team:"LG 트윈스",date:"2026-10-01",status:"ready",score:-70,mood:"안 좋음",games:[{gameId:"one",startsAt:"2026-10-01T18:30:00+09:00",date:"2026-10-01",opponent:"한화 이글스",teamScore:3,oppScore:4,result:"L"}]},"과장님")!;
 assert.equal(report.performance.asOf,"2026-10-01");
 assert.equal(report.performance.teamGames[0].oppScore,4);
 assert.equal(report.forecast.mood,"안 좋음");
 assert.equal(report.performance.highlights.some(x=>x.includes("끝내기")),false);
 assert.equal(moodKey(report.forecast.mood),"bad");
});

 test("uses October 6 games for the October 7 experience",()=>{
 assert.equal(EXPERIENCE_DATE,"2026-10-07");assert.equal(GAME_DATE,"2026-10-06");
});
 test("mood copy never invents a losing streak or game event",()=>{
 for(const mood of ["매우 좋음","좋음","보통","안 좋음","매우 안 좋음"] as const){
 const report=dailyAsReport({team:"LG",date:GAME_DATE,status:"ready",score:0,mood,games:[{gameId:"one",startsAt:GAME_DATE+"T18:30:00+09:00",date:GAME_DATE,opponent:"한화",teamScore:1,oppScore:0,result:"W"}]},"과장님")!;
 assert.doesNotMatch(report.forecast.reason,/연패|연승|끝내기|역전패|재미용/);
 }
});

test("opening follows the analyzed mood and relationship",()=>{
 for(const role of ["boss","friend"] as const){
 assert.match(chatOpening("vgood",role),/기분이 좋|하루 종일/);
 assert.doesNotMatch(chatOpening("vgood",role),/복잡|조심|말자|터진다/);
 assert.match(chatOpening("vbad",role),/꺼내지 마|터진다/);
 assert.notEqual(chatOpening("good",role),chatOpening("bad",role));
 }
 assert.notEqual(chatOpening("normal","boss"),chatOpening("normal","friend"));
});
