import type { DailyMood } from "@/lib/analysis/daily-mood";
import type { ForecastResponse } from "@/types/forecast";
import type { MoodKey } from "./v7-moods";
import type { Relation } from "@/types/chat";
import { MOCK_THUNDER } from "@/lib/mock";

export function extremeDemo(name:string,relation:Relation='boss'):ForecastResponse {
 return {...MOCK_THUNDER,input:{...MOCK_THUNDER.input,displayName:name,relation},forecast:{...MOCK_THUNDER.forecast,reason:"[테스트 시나리오] 5연패 뒤 1:11 대패. 평범한 말도 야구 이야기로 들리는, 가장 예민한 팬심을 체험해보세요. 실제 경기 분석 결과가 아닙니다."}};
}

export function moodKey(mood:string):MoodKey {
 return ({"매우 좋음":"vgood","좋음":"good","보통":"normal","안 좋음":"bad","매우 안 좋음":"vbad"} as Record<string,MoodKey>)[mood]??"normal";
}

export function dailyAsReport(daily:DailyMood,name:string,relation:Relation='boss'):ForecastResponse|null {
 if(daily.status!=="ready"||daily.mood===null||daily.score===null||!daily.games.length)return null;
 const highlights=daily.games.map(g=>`${g.opponent}전 ${g.teamScore}:${g.oppScore} ${g.result==="W"?"승리":g.result==="L"?"패배":"무승부"}`);
 const unhappy=daily.score<0;
 return {
  input:{displayName:name,relation,team:daily.team,player:"팀 전체",favoriteMenus:["국밥"]},
  performance:{team:daily.team,player:"팀 전체",teamGames:daily.games,playerGames:[],teamScore:daily.score,playerScore:0,highlights,source:"live",asOf:daily.date},
  forecast:{mood:daily.mood,moodScore:daily.score,headline:`${daily.team} 팬과의 대화 준비`,reason:`${highlights.join(". ")}. 경기 결과를 바탕으로 만든 재미용 팬심 반응이에요.`,lunch:{menu:"국밥",comment:""},tips:unhappy?["지난 경기의 실수는 먼저 꺼내지 마세요.","점심이나 주말 계획으로 말문을 열어보세요."]:["가볍게 인사를 건네보세요.","상대가 경기 이야기를 꺼내면 함께 기뻐해주세요."],fallback:false},
 };
}
