import test from "node:test";
import assert from "node:assert/strict";
import { dailyAsReport, moodKey, extremeDemo } from "./daily-experience";
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
