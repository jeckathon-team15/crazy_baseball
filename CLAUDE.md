@AGENTS.md

# 야친자 기상청

상사가 좋아하는 야구 팀·선수를 입력하면 최근 경기력을 분석해
"내일 과장님 기분 예보", 추천 점심 메뉴, 대처 요령을 기상청 예보처럼 보여주는 서비스.
주제는 **야구 팀**에 한정합니다.

## 역할과 수정 가능 폴더

| 역할 | 수정 가능 |
| --- | --- |
| 총괄 | `types/`, `lib/mock.ts`, `lib/config.ts`, `app/layout.tsx`, `app/globals.css`, `package.json`, `CLAUDE.md` |
| 웹 | `app/page.tsx`, `app/result/`, `components/`, `lib/api.ts` |
| 분석 | `lib/analysis/`, `lib/ai/`, `app/api/`, `scripts/` |

- 내 폴더 밖은 수정하지 말고, 필요한 변경은 작업 결과에 **"총괄 요청 사항"**으로 정리해서 남깁니다.
- 패키지 추가(`package.json`)도 총괄 요청 사항입니다.

## 규칙

- **계약은 `types/forecast.ts`**. 필드 이름·단위를 그대로 따릅니다. 바꾸려면 총괄에게 요청합니다.
- **숫자 기준은 `lib/config.ts`**에 둡니다 (기분 구간, 팀/선수 가중치, AI 타임아웃, 모델명 등). 코드에 숫자를 하드코딩하지 않습니다.
- 단계마다 `npm run lint`, `npm run build`가 통과해야 합니다.
- AI 호출이 실패하거나 `AI_TIMEOUT_MS`(10초)를 넘기면 기본 문구로 응답하고 `forecast.fallback = true`로 표시합니다. 어떤 경우에도 화면이 깨지지 않게 합니다.
- 서버 키(`ANTHROPIC_API_KEY`)를 쓰는 파일은 맨 위에 `import "server-only";`를 넣습니다. `NEXT_PUBLIC_` 환경 변수는 사용 금지.
- 구단 로고, 선수 사진은 사용 금지입니다.

## 현재 상태

- `app/api/forecast/route.ts`는 600ms 뒤 `lib/mock.ts` 샘플을 돌려주는 껍데기입니다. 분석 담당이 실제 구현으로 교체합니다.
- `lib/api.ts`의 `getForecast()`로 화면에서 API를 호출합니다. 실패 시 서버의 `error` 메시지로 throw 합니다.
- 환경 변수는 `.env.example`을 복사해 `.env.local`로 만들어 씁니다.
